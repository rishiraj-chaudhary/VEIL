import Debate from '../models/debate.js';
import DebateScore from '../models/debateScore.js';
import DebateTurn from '../models/debateTurn.js';
import DebateVote from '../models/debateVote.js';
import aiCoachService from './aiCoachService.js';
import debateAIService from './debateAIService.js';

class DebateScoringService {
  /**
   * Calculate final score for a completed debate
   */
  async calculateFinalScore(debateId) {
    try {
      const debate = await Debate.findById(debateId);
      
      if (!debate) {
        throw new Error('Debate not found');
      }

      if (debate.status !== 'completed') {
        throw new Error('Debate is not completed');
      }

      console.log(`📊 Calculating scores for debate ${debateId}`);

      // Get all turns
      const turns = await DebateTurn.find({
        debate: debateId,
        isDeleted: false
      }).sort({ turnNumber: 1 });

      console.log(`📊 Found ${turns.length} turns for scoring`);

      // Separate by side
      const forTurns = turns.filter(t => t.side === 'for');
      const againstTurns = turns.filter(t => t.side === 'against');

      console.log(`📊 FOR turns: ${forTurns.length}, AGAINST turns: ${againstTurns.length}`);

      // Calculate component scores
      const forScores = await this.calculateSideScores(debateId, forTurns, 'for');
      const againstScores = await this.calculateSideScores(debateId, againstTurns, 'against');

      console.log('📊 FOR scores:', forScores);
      console.log('📊 AGAINST scores:', againstScores);

      // Calculate round-by-round scores
      const roundScores = await this.calculateRoundScores(turns, debate.rounds.length);

      // Generate AI insights
      const insights = await this.generateInsights(debateId, forTurns, againstTurns);

      // Create score document with GUARANTEED non-zero scores
      const scoreDoc = new DebateScore({
        debate: debateId,
        scores: {
          for: {
            argumentQuality: forScores.argumentQuality || 60,
            rebuttalEffectiveness: forScores.rebuttalEffectiveness || 60,
            conductClarity: forScores.conductClarity || 60,
            audienceSupport: forScores.audienceSupport || 50
          },
          against: {
            argumentQuality: againstScores.argumentQuality || 60,
            rebuttalEffectiveness: againstScores.rebuttalEffectiveness || 60,
            conductClarity: againstScores.conductClarity || 60,
            audienceSupport: againstScores.audienceSupport || 50
          }
        },
        roundScores,
        insights
      });

      console.log('📊 Score document before save:', {
        forTotal: scoreDoc.scores.for.total,
        againstTotal: scoreDoc.scores.against.total
      });
      
      // Save to trigger pre-save hook that calculates winner
      await scoreDoc.save();

      console.log('📊 Score document after save:', {
        winner: scoreDoc.winner,
        forTotal: scoreDoc.scores.for.total,
        againstTotal: scoreDoc.scores.against.total
      });

      // Update debate with results
      debate.winner = scoreDoc.winner;
      debate.finalScores = {
        for: scoreDoc.scores.for.total,
        against: scoreDoc.scores.against.total
      };
      await debate.save();

      // ✨ Update AI Coach performance for both participants
      try {
        for (const participant of debate.participants) {
          await aiCoachService.updatePerformanceAfterDebate(participant.user._id || participant.user, debate);
          console.log(`📊 Debate performance updated for user ${participant.user}`);
        }
      } catch (error) {
        console.error('⚠️ Performance update error (non-blocking):', error);
      }

      console.log(`✅ Scoring complete: Winner is '${scoreDoc.winner}'`);

      return { success: true, score: scoreDoc };
    } catch (error) {
      console.error('❌ Calculate score error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate scores for one side
   */
  async calculateSideScores(debateId, turns, side) {
    console.log(`📊 Calculating scores for ${side} side (${turns.length} turns)`);

    // 1. Argument Quality (40%)
    const argumentQuality = this.calculateArgumentQuality(turns);
    console.log(`   - Argument Quality: ${argumentQuality}`);

    // 2. Rebuttal Effectiveness (25%)
    const rebuttalEffectiveness = this.calculateRebuttalEffectiveness(turns);
    console.log(`   - Rebuttal Effectiveness: ${rebuttalEffectiveness}`);

    // 3. Conduct & Clarity (15%)
    const conductClarity = this.calculateConductClarity(turns);
    console.log(`   - Conduct & Clarity: ${conductClarity}`);

    // 4. Audience Support (20%)
    const audienceSupport = await this.calculateAudienceSupport(debateId, side);
    console.log(`   - Audience Support: ${audienceSupport}`);

    return {
      argumentQuality,
      rebuttalEffectiveness,
      conductClarity,
      audienceSupport
    };
  }

  /**
   * Calculate argument quality from AI analysis
   */
  /**
 * Calculate argument quality from AI analysis
 */
calculateArgumentQuality(turns) {
  if (turns.length === 0) return 60; // Default if no turns

  const scores = turns.map(turn => {
    const ai = turn.aiAnalysis;
    if (!ai) {
      console.log(`⚠️ Turn ${turn._id} has no AI analysis, using default score`);
      return 60; // Increased default
    }

    // Check what fields are available
    const hasDecisionTrace = !!ai.decisionTrace;
    const hasOverallQuality = ai.overallQuality !== undefined;

    console.log(`📊 Turn ${turn._id} AI analysis:`, {
      hasDecisionTrace,
      hasOverallQuality,
      claimCount: ai.claims?.length || 0,
      evidenceScore: ai.evidenceScore,
      clarityScore: ai.clarityScore,
      decisionTraceType: typeof ai.decisionTrace
    });

    // Use direct scores if available
    let overallScore = 60;
    let evidenceScore = 60;
    let clarityScore = 60;

    // Try to use overallQuality first
    if (hasOverallQuality && typeof ai.overallQuality === 'number') {
      overallScore = ai.overallQuality;
    }

    // Try to use direct score fields
    if (ai.evidenceScore !== undefined && typeof ai.evidenceScore === 'number') {
      evidenceScore = ai.evidenceScore;
    }
    
    if (ai.clarityScore !== undefined && typeof ai.clarityScore === 'number') {
      clarityScore = ai.clarityScore;
    }

    // ONLY parse decisionTrace if it's actually a string
    if (hasDecisionTrace && typeof ai.decisionTrace === 'string') {
      const trace = ai.decisionTrace;
      
      // Extract scores from text
      const overallMatch = trace.match(/Overall.*?(\d+)/i);
      const evidenceMatch = trace.match(/Evidence.*?(\d+)/i);
      const clarityMatch = trace.match(/Clarity.*?(\d+)/i);
      
      if (overallMatch && !hasOverallQuality) overallScore = Number(overallMatch[1]);
      if (evidenceMatch && ai.evidenceScore === undefined) evidenceScore = Number(evidenceMatch[1]);
      if (clarityMatch && ai.clarityScore === undefined) clarityScore = Number(clarityMatch[1]);
    }

    // Combine multiple factors
    const claimCount = (ai.claims?.length || 0) * 3; // Bonus for claims
    const finalScore = Math.min(100, (
      overallScore * 0.4 +
      evidenceScore * 0.3 +
      clarityScore * 0.2 +
      claimCount
    ));

    console.log(`   Final argument quality score: ${finalScore}`);
    return finalScore;
  });

  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  console.log(`📊 Average argument quality: ${avgScore}`);
  return avgScore;
}

  /**
   * Calculate rebuttal effectiveness
   */
  calculateRebuttalEffectiveness(turns) {
    if (turns.length === 0) return 60; // Default if no turns

    const scores = turns.map(turn => {
      const ai = turn.aiAnalysis;
      if (!ai || !ai.rebuttals) return 60; // Increased default

      // More rebuttals = better
      const rebuttalCount = ai.rebuttals.length;
      const baseScore = Math.min(100, 50 + (rebuttalCount * 12));

      return baseScore;
    });

    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  /**
   * Calculate conduct and clarity
   */
  // FIX for debateScoringService.js - calculateConductClarity method
// Problem: ai.decisionTrace is an OBJECT, not a string, so you can't use .match() on it

calculateConductClarity(turns) {
  console.log('📊 Calculating Conduct & Clarity scores...');
  
  const toneScores = turns
    .map(turn => {
      const ai = turn.aiAnalysis;
      if (!ai) return null;
      
      // FIX: Convert decisionTrace to string if it's an object
      let decisionTraceText = '';
      if (typeof ai.decisionTrace === 'string') {
        decisionTraceText = ai.decisionTrace;
      } else if (typeof ai.decisionTrace === 'object' && ai.decisionTrace !== null) {
        // Convert object to JSON string for pattern matching
        decisionTraceText = JSON.stringify(ai.decisionTrace);
      }
      
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
   * Calculate audience support from votes
   */
  async calculateAudienceSupport(debateId, side) {
    try {
      const support = await DebateVote.getAudienceSupport(debateId);
      return support[side] || 50;
    } catch (error) {
      console.error('Audience support calculation error:', error);
      return 50; // Neutral if error
    }
  }

  /**
   * Calculate per-round scores
   */
  async calculateRoundScores(turns, totalRounds) {
    const roundScores = [];

    for (let round = 1; round <= totalRounds; round++) {
      const roundTurns = turns.filter(t => t.round === round);
      
      const forTurn = roundTurns.find(t => t.side === 'for');
      const againstTurn = roundTurns.find(t => t.side === 'against');

      // Extract scores with fallbacks
      let forScore = 60;
      let againstScore = 60;

      if (forTurn?.aiAnalysis) {
        if (forTurn.aiAnalysis.overallQuality !== undefined) {
          forScore = forTurn.aiAnalysis.overallQuality;
        } else if (forTurn.aiAnalysis.decisionTrace) {
          const match = forTurn.aiAnalysis.decisionTrace.match(/Overall.*?(\d+)/i);
          if (match) forScore = Number(match[1]);
        }
      }

      if (againstTurn?.aiAnalysis) {
        if (againstTurn.aiAnalysis.overallQuality !== undefined) {
          againstScore = againstTurn.aiAnalysis.overallQuality;
        } else if (againstTurn.aiAnalysis.decisionTrace) {
          const match = againstTurn.aiAnalysis.decisionTrace.match(/Overall.*?(\d+)/i);
          if (match) againstScore = Number(match[1]);
        }
      }

      roundScores.push({
        round,
        for: forScore,
        against: againstScore
      });
    }

    return roundScores;
  }

  /**
   * Generate AI insights
   */
  async generateInsights(debateId, forTurns, againstTurns) {
    try {
      // Find strongest arguments
      const strongestFor = this.findStrongestArgument(forTurns);
      const strongestAgainst = this.findStrongestArgument(againstTurns);

      // Find missed rebuttals
      const missedRebuttals = await this.findMissedRebuttals(forTurns, againstTurns);

      // Find key moments
      const keyMoments = this.findKeyMoments([...forTurns, ...againstTurns]);

      // Generate overall analysis
      const overallAnalysis = await debateAIService.generateDebateSummary(
        debateId,
        forTurns,
        againstTurns
      );

      return {
        strongestArgumentFor: strongestFor,
        strongestArgumentAgainst: strongestAgainst,
        missedRebuttals,
        keyMoments,
        overallAnalysis
      };
    } catch (error) {
      console.error('Insights generation error:', error);
      return {
        strongestArgumentFor: 'Unable to determine',
        strongestArgumentAgainst: 'Unable to determine',
        missedRebuttals: [],
        keyMoments: [],
        overallAnalysis: 'Analysis unavailable'
      };
    }
  }

  /**
   * Find strongest argument from turns
   */
  findStrongestArgument(turns) {
    if (turns.length === 0) return 'No arguments submitted';

    const strongest = turns.reduce((best, turn) => {
      let score = 60;
      let bestScore = 60;

      // Get score from current turn
      if (turn.aiAnalysis?.overallQuality !== undefined) {
        score = turn.aiAnalysis.overallQuality;
      } else if (turn.aiAnalysis?.decisionTrace) {
        const match = turn.aiAnalysis.decisionTrace.match(/Overall.*?(\d+)/i);
        if (match) score = Number(match[1]);
      }

      // Get score from best turn
      if (best.aiAnalysis?.overallQuality !== undefined) {
        bestScore = best.aiAnalysis.overallQuality;
      } else if (best.aiAnalysis?.decisionTrace) {
        const match = best.aiAnalysis.decisionTrace.match(/Overall.*?(\d+)/i);
        if (match) bestScore = Number(match[1]);
      }

      return score > bestScore ? turn : best;
    }, turns[0]);

    return strongest.content.substring(0, 150) + '...';
  }

  /**
   * Find missed rebuttals
   */
  async findMissedRebuttals(forTurns, againstTurns) {
    const missed = [];

    // Check if 'against' missed responding to key 'for' claims
    forTurns.forEach(forTurn => {
      const claims = forTurn.aiAnalysis?.claims || [];
      claims.forEach(claim => {
        // Check if any 'against' turn addressed this claim
        const addressed = againstTurns.some(againstTurn => {
          const rebuttals = againstTurn.aiAnalysis?.rebuttals || [];
          return rebuttals.some(r => r.toLowerCase().includes(claim.toLowerCase().substring(0, 20)));
        });

        if (!addressed) {
          missed.push(`Against side missed: "${claim.substring(0, 80)}..."`);
        }
      });
    });

    return missed.slice(0, 3); // Top 3 missed rebuttals
  }

  /**
   * Find key moments in debate
   */
  findKeyMoments(allTurns) {
    const moments = [];

    allTurns.forEach(turn => {
      let quality = 60;

      if (turn.aiAnalysis?.overallQuality !== undefined) {
        quality = turn.aiAnalysis.overallQuality;
      } else if (turn.aiAnalysis?.decisionTrace) {
        const match = turn.aiAnalysis.decisionTrace.match(/Overall.*?(\d+)/i);
        if (match) quality = Number(match[1]);
      }

      const fallacies = turn.aiAnalysis?.fallacies?.length || 0;

      // High quality turn
      if (quality > 85) {
        moments.push({
          turn: turn.turnNumber,
          description: `Strong argument by ${turn.side}`,
          impact: 'high'
        });
      }

      // Major fallacy
      if (fallacies >= 2) {
        moments.push({
          turn: turn.turnNumber,
          description: `Multiple logical fallacies detected`,
          impact: 'medium'
        });
      }
    });

    return moments.sort((a, b) => b.turn - a.turn).slice(0, 5);
  }

  /**
   * Get score for a debate
   */
  async getDebateScore(debateId) {
    try {
      const score = await DebateScore.findOne({ debate: debateId })
        .populate('debate', 'topic status winner');

      if (!score) {
        throw new Error('Score not found');
      }

      return { success: true, score };
    } catch (error) {
      console.error('❌ Get score error:', error);
      return { success: false, error: error.message };
    }
  }
}

const debateScoringService = new DebateScoringService();
export default debateScoringService;