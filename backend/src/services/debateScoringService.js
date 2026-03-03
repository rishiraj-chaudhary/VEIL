import DebateScore from '../models/debateScore.js';
import DebateTurn from '../models/debateTurn.js';
import DebateVote from '../models/debateVote.js';
import UserPerformance from '../models/UserPerformance.js';
import grokService from './grokService.js'; // ✅ FIXED: Default import instead of named import

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

      const forTotal = Object.values(forScores).reduce((sum, val) => sum + val, 0);
      const againstTotal = Object.values(againstScores).reduce((sum, val) => sum + val, 0);

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
      await this.updateUserPerformances(debate, winner, forScores, againstScores);

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
  async calculateSideScores(debateId, turns, side) {
    const argumentQuality = this.calculateArgumentQuality(turns);
    const rebuttalEffectiveness = this.calculateRebuttalEffectiveness(turns);
    const conductClarity = this.calculateConductClarity(turns);
    const audienceSupport = await this.calculateAudienceSupport(debateId, side);

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
      
      console.log(`📊 Turn ${turn._id} AI analysis:`, {
        hasDecisionTrace: !!ai?.decisionTrace,
        hasOverallQuality: ai?.overallQuality !== undefined,
        claimCount: turn.claims?.length || 0,
        evidenceScore: ai?.evidenceScore,
        clarityScore: ai?.clarityScore,
        decisionTraceType: typeof ai?.decisionTrace
      });

      if (!ai) return 50;

      let score = ai.overallQuality || 50;

      const claimCount = turn.claims?.length || 0;
      if (claimCount > 0) {
        score += Math.min(claimCount * 3, 15);
      }

      if (ai.evidenceScore) {
        score += (ai.evidenceScore - 50) * 0.3;
      }

      if (ai.clarityScore) {
        score += (ai.clarityScore - 50) * 0.2;
      }

      console.log(`   Final argument quality score: ${score.toFixed(1)}`);
      return Math.max(0, Math.min(100, score));
    });

    const avgQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
    console.log(`📊 Average argument quality: ${Math.round(avgQuality)}`);
    return Math.round(avgQuality);
  }

  /**
   * ========================================
   * Calculate Rebuttal Effectiveness
   * ========================================
   */
  calculateRebuttalEffectiveness(turns) {
    if (!turns || turns.length === 0) return 50;

    const rebuttalScores = turns.map(turn => {
      const rebuttals = turn.rebuttals || [];
      if (rebuttals.length === 0) return 40;

      const avgEffectiveness = rebuttals.reduce((sum, r) => sum + (r.effectiveness || 50), 0) / rebuttals.length;
      
      return Math.min(100, avgEffectiveness + (rebuttals.length * 5));
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
  
    const weights = {
      argumentQuality: 40,
      rebuttalEffectiveness: 25,
      conductClarity: 15,
      audienceSupport: 20
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
  async findMissedRebuttals(forTurns, againstTurns) {
    const missed = [];

    for (const forTurn of forTurns) {
      const rebutted = againstTurns.some(at => 
        at.rebuttals?.some(r => r.targetTurn?.toString() === forTurn._id.toString())
      );

      if (!rebutted && forTurn.claims?.length > 0) {
        missed.push({
          side: 'against',
          missedClaim: forTurn.content.substring(0, 100) + '...',
          round: forTurn.round
        });
      }
    }

    for (const againstTurn of againstTurns) {
      const rebutted = forTurns.some(ft => 
        ft.rebuttals?.some(r => r.targetTurn?.toString() === againstTurn._id.toString())
      );

      if (!rebutted && againstTurn.claims?.length > 0) {
        missed.push({
          side: 'for',
          missedClaim: againstTurn.content.substring(0, 100) + '...',
          round: againstTurn.round
        });
      }
    }

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
   */
  async updateUserPerformances(debate, winner, forScores, againstScores) {
    const forUser = debate.participants.for?.user;
    const againstUser = debate.participants.against?.user;

    if (forUser) {
      const forResult = winner === 'for' ? 'win' : winner === 'against' ? 'loss' : 'draw';
      await this.updatePerformance(forUser, forResult, forScores);
      console.log(`🏆 User ${forUser} updated - Rank: Beginner, Win Rate: 0%`);
    }

    if (againstUser) {
      const againstResult = winner === 'against' ? 'win' : winner === 'for' ? 'loss' : 'draw';
      await this.updatePerformance(againstUser, againstResult, againstScores);
      console.log(`🏆 User ${againstUser} updated - Rank: Beginner, Win Rate: 0%`);
    }
  }

  /**
   * ========================================
   * Update Performance
   * ========================================
   */
  async updatePerformance(userId, result, scores) {
    const performance = await UserPerformance.findOne({ user: userId }) || 
                       new UserPerformance({ user: userId });

    performance.debatesParticipated += 1;
    if (result === 'win') performance.wins += 1;
    if (result === 'loss') performance.losses += 1;
    if (result === 'draw') performance.draws += 1;

    performance.averageArgumentQuality = 
      (performance.averageArgumentQuality * (performance.debatesParticipated - 1) + scores.argumentQuality) / 
      performance.debatesParticipated;

    performance.averageConductClarity = 
      (performance.averageConductClarity * (performance.debatesParticipated - 1) + scores.conductClarity) / 
      performance.debatesParticipated;

    await performance.save();
    console.log(`  ✅ Updated performance for ${userId}`);
  }

  /**
   * ========================================
   * Get Debate Score
   * ========================================
   */
  async getDebateScore(debateId) {
    console.log(`📊 Fetching detailed score for debate: ${debateId}`);
    
    const score = await DebateScore.findOne({ debate: debateId })
      .populate('debate');

    if (!score) {
      console.log('📊 No score found, attempting to calculate...');
      return await this.calculateFinalScore(debateId);
    }

    return score;
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