import DebateScore from '../models/debateScore.js';
import DebateTurn from '../models/debateTurn.js';
import DebateVote from '../models/debateVote.js';
import UserPerformance from '../models/UserPerformance.js';
import grokService from './grokService.js'; // ✅ FIXED: Default import instead of named import

/**
 * Evidence lands in one of two places depending on which analysis path produced
 * the turn, and under neither of the names this file used to read.
 * `aiAnalysis.evidenceScore` has never existed on the schema.
 */
const evidenceScoreOf = turn =>
  turn?.aiAnalysis?.evidenceAnalysis?.score
  ?? turn?.aiAnalysis?.evidenceQuality
  ?? null;

/** Claims and rebuttals live under aiAnalysis, not on the turn itself. */
const claimsOf    = turn => turn?.aiAnalysis?.claims    || [];
const rebuttalsOf = turn => turn?.aiAnalysis?.rebuttals || [];

class DebateScoringService {
  /**
   * ========================================
   * HELPER: Convert decisionTrace to string
   * ========================================
   */
  convertDecisionTraceToString(decisionTrace) {
    if (typeof decisionTrace === 'string') {
      return decisionTrace;
    } else if (typeof decisionTrace === 'object' && decisionTrace !== null) {
      return JSON.stringify(decisionTrace);
    }
    return '';
  }

  /**
   * ========================================
   * MAIN: Calculate Final Score
   * ========================================
   */
  async calculateFinalScore(debateId) {
    try {
      console.log(`📊 Calculating scores for debate ${debateId}`);

      const debate = await this.constructor.getDebate(debateId);

      // Was dereferenced straight away; a deleted or mistyped id produced
      // "cannot read property 'status' of null" rather than a usable message.
      if (!debate) {
        throw new Error('Debate not found');
      }

      if (debate.status !== 'completed') {
        throw new Error('Debate is not completed');
      }

      const turns = await DebateTurn.find({ debate: debateId })
        .sort({ createdAt: 1 });

      console.log(`📊 Found ${turns.length} turns for scoring`);

      const forTurns = turns.filter(t => t.side === 'for');
      const againstTurns = turns.filter(t => t.side === 'against');

      console.log(`📊 FOR turns: ${forTurns.length}, AGAINST turns: ${againstTurns.length}`);

      console.log('📊 Calculating scores for for side (3 turns)');
      const forScores = await this.calculateSideScores(debateId, forTurns, 'for');
      
      console.log('📊 Calculating scores for against side (3 turns)');
      const againstScores = await this.calculateSideScores(debateId, againstTurns, 'against');

      console.log('📊 FOR scores:', forScores);
      console.log('📊 AGAINST scores:', againstScores);

      const roundScores = await this.calculateRoundScores(forTurns, againstTurns);

      const forTotal = this.weightedTotal(forScores);
      const againstTotal = this.weightedTotal(againstScores);

      let winner = 'draw';
      if (forTotal > againstTotal) winner = 'for';
      else if (againstTotal > forTotal) winner = 'against';

      console.log(`📊 Final Scores:\n  FOR side: ${forTotal}\n  AGAINST side: ${againstTotal}\n🤝 Result: ${winner.toUpperCase()}`);

      const insights = await this.generateInsights(debateId, forTurns, againstTurns);

      const scoreData = {
        debate: debateId,
        scores: {
          for: {
            argumentQuality: forScores.argumentQuality,
            rebuttalEffectiveness: forScores.rebuttalEffectiveness,
            conductClarity: forScores.conductClarity,
            audienceSupport: forScores.audienceSupport,
            total: forTotal  // ✅ This will be saved in the schema
          },
          against: {
            argumentQuality: againstScores.argumentQuality,
            rebuttalEffectiveness: againstScores.rebuttalEffectiveness,
            conductClarity: againstScores.conductClarity,
            audienceSupport: againstScores.audienceSupport,
            total: againstTotal  // ✅ This will be saved in the schema
          }
        },
        winner,
        roundScores,
        insights,
        calculatedAt: new Date()
      };

      console.log('📊 Score document before save:', { forTotal, againstTotal });

      const score = await DebateScore.findOneAndUpdate(
        { debate: debateId },
        scoreData,
        { upsert: true, new: true }
      );

      console.log('📊 Updating user performances...');
      await this.updateUserPerformances(debate, winner, forScores, againstScores, {
        for: forTurns,
        against: againstTurns,
      });

      return score;
    } catch (error) {
      console.error('❌ Calculate score error:', error);
      throw error;
    }
  }

  /**
   * ========================================
   * Calculate Side Scores
   * ========================================
   */
  /**
   * Combines a side's four dimensions into a single comparable total.
   *
   * Summing them unweighted made audience votes worth exactly as much as the
   * quality of the argument, so a popular but weak case could beat a rigorous
   * unpopular one. On a platform whose premise is that reasoning is measurable,
   * the reasoning dimensions have to dominate; the audience still counts, but
   * as a minority voice rather than a quarter of the verdict.
   */
  weightedTotal(scores) {
    const WEIGHTS = {
      argumentQuality: 0.40,
      rebuttalEffectiveness: 0.30,
      conductClarity: 0.15,
      audienceSupport: 0.15,
    };

    return Math.round(
      Object.entries(WEIGHTS).reduce(
        (total, [key, weight]) => total + (scores[key] ?? 0) * weight,
        0,
      ),
    );
  }

  async calculateSideScores(debateId, turns, side) {
    const argumentQuality = this.calculateArgumentQuality(turns);
    const rebuttalEffectiveness = this.calculateRebuttalEffectiveness(turns);
    const conductClarity = this.calculateConductClarity(turns);
    const audienceSupport = await this.calculateAudienceSupport(debateId, side);

    // A side that never argued must not score. Each dimension falls back to a
    // neutral 50 when handed no turns, so a forfeiting side previously totalled
    // ~200 and could beat an opponent who actually showed up and argued badly.
    if (!turns || turns.length === 0) {
      console.log(`   - ${side} submitted no turns — scoring zero across the board`);
      return {
        argumentQuality: 0,
        rebuttalEffectiveness: 0,
        conductClarity: 0,
        audienceSupport,
      };
    }

    console.log(`   - Argument Quality: ${argumentQuality}`);
    console.log(`   - Rebuttal Effectiveness: ${rebuttalEffectiveness}`);
    console.log(`   - Conduct & Clarity: ${conductClarity}`);
    console.log(`   - Audience Support: ${audienceSupport}`);

    return {
      argumentQuality,
      rebuttalEffectiveness,
      conductClarity,
      audienceSupport
    };
  }

  /**
   * ========================================
   * FIX 1: Calculate Argument Quality
   * ========================================
   */
  calculateArgumentQuality(turns) {
    if (!turns || turns.length === 0) return 50;

    const qualityScores = turns.map(turn => {
      const ai = turn.aiAnalysis;
      if (!ai) return 50;

      let score = ai.overallQuality || 50;

      // Was `turn.claims`, which is not a field on DebateTurn — the claim bonus
      // has therefore never applied to anyone.
      const claimCount = claimsOf(turn).length;
      if (claimCount > 0) {
        score += Math.min(claimCount * 3, 15);
      }

      const evidence = evidenceScoreOf(turn);
      if (typeof evidence === 'number') {
        score += (evidence - 50) * 0.3;
      }

      if (ai.clarityScore) {
        score += (ai.clarityScore - 50) * 0.2;
      }

      return Math.max(0, Math.min(100, score));
    });

    const avgQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
    return Math.round(avgQuality);
  }

  /**
   * ========================================
   * Calculate Rebuttal Effectiveness
   * ========================================
   */
  /**
   * `aiAnalysis.rebuttals` is a list of strings — the points this turn answered.
   * This method read `turn.rebuttals` (not a field) and treated each entry as an
   * object with a numeric `.effectiveness` (not a shape it has), so the array was
   * always empty and every side scored a flat 40 on 30% of the verdict.
   *
   * With strings, effectiveness has to come from the turn's own graded quality,
   * scaled by how many of the opponent's points were actually engaged.
   */
  calculateRebuttalEffectiveness(turns) {
    if (!turns || turns.length === 0) return 50;

    const rebuttalScores = turns.map(turn => {
      const rebuttals = rebuttalsOf(turn).filter(r => typeof r === 'string' ? r.trim() : r);

      // An opening statement has nothing to rebut; scoring it as a failed
      // rebuttal would penalise going first.
      if (rebuttals.length === 0) return turn.round <= 1 ? 50 : 35;

      const base = turn.aiAnalysis?.overallQuality ?? 50;
      const engagementBonus = Math.min(rebuttals.length * 5, 15);

      return Math.max(0, Math.min(100, base + engagementBonus));
    });

    return Math.round(rebuttalScores.reduce((sum, score) => sum + score, 0) / rebuttalScores.length);
  }

  /**
   * ========================================
   * FIX 2: Calculate Conduct & Clarity
   * ========================================
   */
  calculateConductClarity(turns) {
    console.log('📊 Calculating Conduct & Clarity scores...');
    
    const toneScores = turns
      .map(turn => {
        const ai = turn.aiAnalysis;
        if (!ai) return null;
        
        // FIX: Convert decisionTrace to string if it's an object
        const decisionTraceText = this.convertDecisionTraceToString(ai.decisionTrace);
        
        // Check for negative tone indicators
        const hasNegativeTone = decisionTraceText.match(
          /rude|aggressive|disrespectful|personal attack|insult/i
        );
        
        return ai.toneScore || (hasNegativeTone ? 40 : 70);
      })
      .filter(score => score !== null);

    const avgTone = toneScores.length > 0
      ? toneScores.reduce((sum, score) => sum + score, 0) / toneScores.length
      : 70;

    const clarityScores = turns
      .map(turn => turn.aiAnalysis?.clarityScore)
      .filter(score => score !== undefined && score !== null);

    const avgClarity = clarityScores.length > 0
      ? clarityScores.reduce((sum, score) => sum + score, 0) / clarityScores.length
      : 70;

    console.log(`   Tone: ${avgTone.toFixed(1)}, Clarity: ${avgClarity.toFixed(1)}`);
    
    return Math.round((avgTone + avgClarity) / 2);
  }

  /**
   * ========================================
   * Calculate Audience Support
   * ========================================
   */
  async calculateAudienceSupport(debateId, side) {
    const votes = await DebateVote.find({ debate: debateId });
    
    const sideVotes = votes.filter(v => v.vote === side);
    const totalVotes = votes.length;

    if (totalVotes === 0) return 50;

    const baseScore = (sideVotes.length / totalVotes) * 100;
    
    const avgConfidence = sideVotes.length > 0
      ? sideVotes.reduce((sum, v) => sum + (v.confidence || 5), 0) / sideVotes.length
      : 5;
    
    const confidenceBonus = ((avgConfidence - 5) / 5) * 10;

    return Math.round(Math.max(0, Math.min(100, baseScore + confidenceBonus)));
  }

  /**
   * ========================================
   * FIX 3: Calculate Round Scores
   * ========================================
   */
  async calculateRoundScores(forTurns, againstTurns) {
    const rounds = new Set([
      ...forTurns.map(t => t.round),
      ...againstTurns.map(t => t.round)
    ]);
  
    // Same weighting as weightedTotal — a per-round score that ranks sides
    // differently from the final verdict is a bug report waiting to happen.
    const weights = {
      argumentQuality: 40,
      rebuttalEffectiveness: 30,
      conductClarity: 15,
      audienceSupport: 15
    };

    return Array.from(rounds).sort().map(round => {
      const forTurnsInRound = forTurns.filter(t => t.round === round);
      const againstTurnsInRound = againstTurns.filter(t => t.round === round);
      
      // Calculate scores for FOR side in this round
      let forRoundScore = 0;
      if (forTurnsInRound.length > 0) {
        const forArgQuality = this.calculateArgumentQuality(forTurnsInRound);
        const forRebuttal = this.calculateRebuttalEffectiveness(forTurnsInRound);
        const forConduct = this.calculateConductClarity(forTurnsInRound);
        const forAudience = 50; // Default for round scores
        
        forRoundScore = Math.round(
          (forArgQuality * weights.argumentQuality / 100) +
          (forRebuttal * weights.rebuttalEffectiveness / 100) +
          (forConduct * weights.conductClarity / 100) +
          (forAudience * weights.audienceSupport / 100)
        );
      }
      
      // Calculate scores for AGAINST side in this round
      let againstRoundScore = 0;
      if (againstTurnsInRound.length > 0) {
        const againstArgQuality = this.calculateArgumentQuality(againstTurnsInRound);
        const againstRebuttal = this.calculateRebuttalEffectiveness(againstTurnsInRound);
        const againstConduct = this.calculateConductClarity(againstTurnsInRound);
        const againstAudience = 50; // Default for round scores
        
        againstRoundScore = Math.round(
          (againstArgQuality * weights.argumentQuality / 100) +
          (againstRebuttal * weights.rebuttalEffectiveness / 100) +
          (againstConduct * weights.conductClarity / 100) +
          (againstAudience * weights.audienceSupport / 100)
        );
      }
  
      console.log(`📊 Round ${round} scores: FOR=${forRoundScore}, AGAINST=${againstRoundScore}`);
  
      return {
        round,
        for: forRoundScore,
        against: againstRoundScore
      };
    });
  }

  /**
   * ========================================
   * Generate Insights
   * ========================================
   */
  async generateInsights(debateId, forTurns, againstTurns) {
    const allTurns = [...forTurns, ...againstTurns].sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );

    const forStrongest = this.findStrongestArgument(forTurns);
    const againstStrongest = this.findStrongestArgument(againstTurns);
    const missedRebuttals = await this.findMissedRebuttals(forTurns, againstTurns);
    const keyMoments = this.findKeyMoments(allTurns);

    if (!grokService.isReady()) {
      return {
        strongestArguments: { for: forStrongest, against: againstStrongest },
        missedOpportunities: missedRebuttals,
        keyMoments,
        summary: 'AI analysis unavailable - Grok service not initialized'
      };
    }

    try {
      const prompt = `Analyze this debate and provide a brief summary of the key arguments and conclusion:
      
FOR side arguments:
${forTurns.map((t, i) => `${i + 1}. ${t.content}`).join('\n')}

AGAINST side arguments:
${againstTurns.map((t, i) => `${i + 1}. ${t.content}`).join('\n')}

Provide a 2-3 sentence summary focusing on the main points of contention and the overall quality of argumentation.`;

      const summary = await grokService.generateSmart(prompt, {
        operation: 'debate_analysis',
        maxTokens: 200,
        temperature: 0.7
      });

      return {
        strongestArguments: { for: forStrongest, against: againstStrongest },
        missedOpportunities: missedRebuttals,
        keyMoments,
        summary: summary || 'Unable to generate summary'
      };
    } catch (error) {
      console.error('Error generating insights:', error);
      return {
        strongestArguments: { for: forStrongest, against: againstStrongest },
        missedOpportunities: missedRebuttals,
        keyMoments,
        summary: 'Error generating summary'
      };
    }
  }

  /**
   * ========================================
   * Find Strongest Argument
   * ========================================
   */
  findStrongestArgument(turns) {
    if (!turns || turns.length === 0) return null;

    const strongest = turns.reduce((best, turn) => {
      const quality = turn.aiAnalysis?.overallQuality || 0;
      const bestQuality = best?.aiAnalysis?.overallQuality || 0;
      return quality > bestQuality ? turn : best;
    }, turns[0]);

    return {
      content: strongest.content.substring(0, 150) + '...',
      quality: strongest.aiAnalysis?.overallQuality || 0,
      round: strongest.round
    };
  }

  /**
   * ========================================
   * Find Missed Rebuttals
   * ========================================
   */
  /**
   * A claim counts as unanswered when no later turn from the other side names
   * anything recognisably from it.
   *
   * There is no turn-to-turn link to follow: rebuttals are recorded as free text,
   * not as references to the turn they answer. The previous implementation looked
   * for `r.targetTurn` on those strings, which is never present, so every claimed
   * turn was reported as missed — and it read `turn.claims`, which is not a field,
   * so in practice nothing was reported at all.
   */
  async findMissedRebuttals(forTurns, againstTurns) {
    const missed = [];

    const answeredBy = (opposingTurns, turn) => {
      const claims = claimsOf(turn).map(c => String(c).toLowerCase());
      if (claims.length === 0) return true; // nothing to answer

      const laterText = opposingTurns
        .filter(t => t.round >= turn.round)
        .flatMap(t => [...rebuttalsOf(t).map(String), t.content || ''])
        .join(' ')
        .toLowerCase();

      if (!laterText) return false;

      // A claim is treated as engaged when its distinctive words show up in the
      // opponent's later text. Short words carry no signal, so they are ignored.
      return claims.some(claim => {
        const terms = claim.split(/\W+/).filter(w => w.length > 5);
        if (terms.length === 0) return false;
        const hits = terms.filter(term => laterText.includes(term)).length;
        return hits / terms.length >= 0.5;
      });
    };

    const collect = (turns, opposingTurns, sideThatMissed) => {
      for (const turn of turns) {
        if (claimsOf(turn).length === 0) continue;
        if (answeredBy(opposingTurns, turn)) continue;

        missed.push({
          side: sideThatMissed,
          missedClaim: (turn.content || '').substring(0, 100) + '...',
          round: turn.round,
        });
      }
    };

    collect(forTurns, againstTurns, 'against');
    collect(againstTurns, forTurns, 'for');

    return missed.slice(0, 5);
  }

  /**
   * ========================================
   * Find Key Moments
   * ========================================
   */
  findKeyMoments(allTurns) {
    const moments = [];

    for (let i = 1; i < allTurns.length; i++) {
      const current = allTurns[i];
      const previous = allTurns[i - 1];

      const currentQuality = current.aiAnalysis?.overallQuality || 50;
      const previousQuality = previous.aiAnalysis?.overallQuality || 50;
      const qualityDiff = currentQuality - previousQuality;

      if (Math.abs(qualityDiff) > 15) {
        moments.push({
          round: current.round,
          side: current.side,
          type: qualityDiff > 0 ? 'strong_response' : 'weak_response',
          description: current.content.substring(0, 100) + '...'
        });
      }
    }

    return moments.slice(0, 3);
  }

  /**
   * ========================================
   * Update User Performances
   * ========================================
   *
   * `debate.participants` is an array of `{ user, side }`. This read it as
   * `debate.participants.for.user` — an object shape the schema has never had —
   * so both ids were always `undefined` and neither branch below ever ran. The
   * consequence was not a visible error but total silence: no debate has ever
   * updated a UserPerformance record, which is what the coach dashboard, the
   * leaderboards, the achievement graph and the debate component of karma are
   * all computed from. Every one of them read an empty collection.
   */
  async updateUserPerformances(debate, winner, forScores, againstScores, turnsBySide = {}) {
    const participantOn = side =>
      debate.participants?.find(p => p.side === side)?.user;

    const sides = [
      { side: 'for',     user: participantOn('for'),     scores: forScores },
      { side: 'against', user: participantOn('against'), scores: againstScores },
    ];

    for (const { side, user, scores } of sides) {
      if (!user) continue;

      const userId = user._id ?? user;
      const result = winner === 'draw' ? 'draw' : winner === side ? 'win' : 'loss';

      try {
        await this.updatePerformance(userId, result, scores, turnsBySide[side] || []);
      } catch (error) {
        // One participant's record failing must not abandon the other's.
        console.error(`❌ Failed to update performance for ${userId}:`, error.message);
      }
    }
  }

  /**
   * ========================================
   * Update Performance
   * ========================================
   *
   * Writes to the paths UserPerformance actually declares. The previous version
   * assigned `debatesParticipated`, `wins`, `averageArgumentQuality` and friends,
   * none of which exist on the schema — under Mongoose's default strict mode
   * those assignments are dropped without error, so the save succeeded and
   * stored nothing.
   */
  async updatePerformance(userId, result, scores, turns = []) {
    const performance = await UserPerformance.findOne({ user: userId })
      || new UserPerformance({ user: userId });

    const stats = performance.stats;
    const previousDebates = stats.totalDebates || 0;

    stats.totalDebates = previousDebates + 1;
    if (result === 'win')  stats.wins   = (stats.wins   || 0) + 1;
    if (result === 'loss') stats.losses = (stats.losses || 0) + 1;
    if (result === 'draw') stats.draws  = (stats.draws  || 0) + 1;
    stats.winRate = Math.round((stats.wins / stats.totalDebates) * 100);

    // Rolling average across debates, weighted by debate rather than by turn so
    // a long debate does not dominate a user's profile.
    const blend = (previous, next) =>
      next === null ? previous : ((previous || 0) * previousDebates + next) / stats.totalDebates;

    const avgOf = path => {
      const values = turns.map(path).filter(v => typeof v === 'number' && !Number.isNaN(v));
      return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
    };

    const quality = performance.qualityMetrics;
    quality.avgToneScore      = blend(quality.avgToneScore,      avgOf(t => t.aiAnalysis?.toneScore));
    quality.avgClarityScore   = blend(quality.avgClarityScore,   avgOf(t => t.aiAnalysis?.clarityScore));
    quality.avgEvidenceScore  = blend(quality.avgEvidenceScore,  avgOf(t => evidenceScoreOf(t)));
    quality.avgOverallQuality = blend(quality.avgOverallQuality, scores.argumentQuality ?? null);

    stats.totalTurns = (stats.totalTurns || 0) + turns.length;

    // Fallacy rate is per turn, so it is recomputed from the running totals
    // rather than blended — averaging an average would drift.
    const fallaciesThisDebate = turns.reduce(
      (sum, turn) => sum + (turn.aiAnalysis?.fallacies?.length || 0), 0,
    );
    const fallacyStats = performance.fallacyStats;
    fallacyStats.totalFallacies = (fallacyStats.totalFallacies || 0) + fallaciesThisDebate;
    fallacyStats.fallacyRate = stats.totalTurns > 0
      ? Number((fallacyStats.totalFallacies / stats.totalTurns).toFixed(3))
      : 0;

    for (const fallacy of turns.flatMap(t => t.aiAnalysis?.fallacies || [])) {
      const name = fallacy?.type;
      if (!name) continue;
      const existing = fallacyStats.commonFallacies.find(f => f.type === name);
      if (existing) existing.count += 1;
      else fallacyStats.commonFallacies.push({ type: name, count: 1 });
    }

    await performance.save();

    console.log(
      `🏆 Performance updated for ${userId} — ${result}, `
      + `${stats.wins}W/${stats.losses}L/${stats.draws}D (${stats.winRate}% win rate)`,
    );

    return performance;
  }

  /**
   * ========================================
   * Get Debate Score
   * ========================================
   */
  /**
   * The stored score for a debate, computing it once if it is missing.
   *
   * Returns a `{ success, score }` envelope. It used to return the Mongoose
   * document directly while the controller checked `result.success` — a property
   * no document has — so the endpoint answered 404 for every debate, including
   * ones whose score was sitting in the database. That went unnoticed because a
   * duplicate route registered earlier in the file shadowed this handler
   * entirely; removing the duplicate is what exposed it.
   */
  async getDebateScore(debateId) {
    const existing = await DebateScore.findOne({ debate: debateId }).populate('debate');
    if (existing) return { success: true, score: existing };

    const Debate = (await import('../models/debate.js')).default;
    const debate = await Debate.findById(debateId).select('status').lean();

    if (!debate) {
      return { success: false, message: 'Debate not found' };
    }

    // Scoring runs an LLM call and rewrites both participants' records. It must
    // not be triggered by a page view on a debate that is still in progress —
    // and there is nothing meaningful to score yet in any case.
    if (debate.status !== 'completed') {
      return { success: false, message: 'This debate has not finished yet' };
    }

    return { success: true, score: await this.calculateFinalScore(debateId) };
  }

  /**
   * ========================================
   * Static Helper: Get Debate
   * ========================================
   */
  static async getDebate(debateId) {
    const Debate = (await import('../models/debate.js')).default;
    return await Debate.findById(debateId);
  }
}

export default new DebateScoringService();