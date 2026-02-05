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

      // Separate by side
      const forTurns = turns.filter(t => t.side === 'for');
      const againstTurns = turns.filter(t => t.side === 'against');

      // Calculate component scores
      const forScores = await this.calculateSideScores(debateId, forTurns, 'for');
      const againstScores = await this.calculateSideScores(debateId, againstTurns, 'against');

      // Calculate round-by-round scores
      const roundScores = await this.calculateRoundScores(turns, debate.rounds.length);

      // Generate AI insights
      const insights = await this.generateInsights(debateId, forTurns, againstTurns);

      // Create score document
      const scoreDoc = new DebateScore({
        debate: debateId,
        scores: {
          for: {
            argumentQuality: forScores.argumentQuality || 50,
            rebuttalEffectiveness: forScores.rebuttalEffectiveness || 50,
            conductClarity: forScores.conductClarity || 50,
            audienceSupport: forScores.audienceSupport || 50
          },
          against: {
            argumentQuality: againstScores.argumentQuality || 50,
            rebuttalEffectiveness: againstScores.rebuttalEffectiveness || 50,
            conductClarity: againstScores.conductClarity || 50,
            audienceSupport: againstScores.audienceSupport || 50
          }
        },
        roundScores,
        insights
      });
      
      // Save to trigger pre-save hook that calculates winner
      await scoreDoc.save();

      // Update debate with results
      debate.winner = scoreDoc.winner;
      debate.finalScores = {
        for: scoreDoc.scores.for.total,
        against: scoreDoc.scores.against.total
      };
      await debate.save();

      // ✨ NEW: Update AI Coach performance for both participants
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
    // 1. Argument Quality (40%)
    const argumentQuality = this.calculateArgumentQuality(turns);

    // 2. Rebuttal Effectiveness (25%)
    const rebuttalEffectiveness = this.calculateRebuttalEffectiveness(turns);

    // 3. Conduct & Clarity (15%)
    const conductClarity = this.calculateConductClarity(turns);

    // 4. Audience Support (20%)
    const audienceSupport = await this.calculateAudienceSupport(debateId, side);

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
  calculateArgumentQuality(turns) {
    if (turns.length === 0) return 0;

    const scores = turns.map(turn => {
      const ai = turn.aiAnalysis;
      if (!ai) return 50; // Default if no AI analysis

      // Combine multiple factors
      const claimCount = (ai.claims?.length || 0) * 5; // Bonus for claims
      const evidenceScore = ai.evidenceScore || 50;
      const clarityScore = ai.clarityScore || 50;
      const overallScore = ai.overallQuality || 50;

      return Math.min(100, (
        overallScore * 0.4 +
        evidenceScore * 0.3 +
        clarityScore * 0.2 +
        claimCount * 0.1
      ));
    });

    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  /**
   * Calculate rebuttal effectiveness
   */
  calculateRebuttalEffectiveness(turns) {
    if (turns.length === 0) return 0;

    const scores = turns.map(turn => {
      const ai = turn.aiAnalysis;
      if (!ai || !ai.rebuttals) return 50;

      // More rebuttals = better
      const rebuttalCount = ai.rebuttals.length;
      const baseScore = Math.min(100, 40 + (rebuttalCount * 15));

      return baseScore;
    });

    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  /**
   * Calculate conduct and clarity
   */
  calculateConductClarity(turns) {
    if (turns.length === 0) return 0;

    const scores = turns.map(turn => {
      const ai = turn.aiAnalysis;
      if (!ai) return 50;

      const toneScore = ai.toneScore || 50;
      const clarityScore = ai.clarityScore || 50;
      const fallacyPenalty = (ai.fallacies?.length || 0) * 5; // Penalty for fallacies

      return Math.max(0, (toneScore * 0.5 + clarityScore * 0.5) - fallacyPenalty);
    });

    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
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

      roundScores.push({
        round,
        for: forTurn?.aiAnalysis?.overallQuality || 50,
        against: againstTurn?.aiAnalysis?.overallQuality || 50
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
      const score = turn.aiAnalysis?.overallQuality || 0;
      const bestScore = best.aiAnalysis?.overallQuality || 0;
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
      const quality = turn.aiAnalysis?.overallQuality || 0;
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