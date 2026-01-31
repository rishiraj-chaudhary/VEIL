import Debate from '../models/debate.js';
import DebateTurn from '../models/debateTurn.js';
import debateAIService from './debateAIService.js';
class DebateTurnService {
  /**
   * Submit a turn in the debate
   */
  async submitTurn(debateId, userId, content) {
    try {
      const debate = await Debate.findById(debateId);
      
      if (!debate) {
        throw new Error('Debate not found');
      }

      if (debate.status !== 'active') {
        throw new Error('Debate is not active');
      }

      // Verify it's the user's turn
      if (!debate.currentTurn || !debate.currentTurn.equals(userId)) {
        throw new Error('Not your turn');
      }

      // Get participant info
      const participant = debate.participants.find(p => p.user.equals(userId));
      if (!participant) {
        throw new Error('You are not a participant');
      }

      // Get current round config
      const currentRoundConfig = debate.rounds.find(
        r => r.number === debate.currentRound
      );
      if (!currentRoundConfig) {
        throw new Error('Invalid round configuration');
      }

      // Validate word count
      const wordCount = content.trim().split(/\s+/).length;
      if (wordCount > currentRoundConfig.wordLimit) {
        throw new Error(
          `Word limit exceeded: ${wordCount}/${currentRoundConfig.wordLimit}`
        );
      }

      if (wordCount < 10) {
        throw new Error('Content must be at least 10 words');
      }

      // Create the turn
      const turn = await DebateTurn.create({
        debate: debateId,
        round: debate.currentRound,
        turnNumber: debate.totalTurns + 1,
        author: userId,
        side: participant.side,
        content,
        wordCount,
        submittedAt: new Date()
      });

      // Populate author
      await turn.populate('author', 'username karma');

      // Run AI analysis asynchronously
      // Run AI analysis asynchronously
        this.analyzeDebateTurn(turn._id, debate._id).catch(async (error) => {
          console.error('❌ AI analysis error (non-blocking):', error);
          
          // Mark turn with error state
          try {
            await DebateTurn.findByIdAndUpdate(turn._id, {
              'aiAnalysis.decisionTrace': ['AI analysis failed - please retry'],
              'aiAnalysis.error': error.message
            });
          } catch (updateError) {
            console.error('Failed to mark error:', updateError);
          }
        });

      // Update debate state
      await this.advanceDebate(debate, participant.side);

      console.log(`✅ Turn submitted: ${turn._id} by ${userId}`);
      
      // Get updated debate
      const updatedDebate = await Debate.findById(debateId)
        .populate('currentTurn', 'username');

      return {
        success: true,
        turn,
        debate: updatedDebate,
        nextTurn: updatedDebate.currentTurn
      };
    } catch (error) {
      console.error('❌ Submit turn error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Advance debate to next turn
   */
  async advanceDebate(debate, currentSide) {
    // Increment total turns
    debate.totalTurns += 1;

    // Get opponent's side
    const nextSide = currentSide === 'for' ? 'against' : 'for';
    const nextParticipant = debate.getParticipantBySide(nextSide);

    // Check if round is complete (both sides have spoken)
    if (currentSide === 'against') {
      // Round complete, check if debate is complete
      if (debate.currentRound >= debate.rounds.length) {
        // Debate complete
        debate.status = 'completed';
        debate.completedAt = new Date();
        debate.currentTurn = null;
        
        await debate.save();
        
        // Trigger scoring
        this.scoreDebate(debate._id).catch(error => {
          console.error('Scoring error (non-blocking):', error);
        });
        
        console.log(`🏁 Debate ${debate._id} completed`);
        return;
      }

      // Move to next round
      debate.currentRound += 1;
    }

    // Set next turn
    debate.currentTurn = nextParticipant.user;
    
    await debate.save();
  }

  /**
   * Get all turns for a debate
   */
  async getDebateTurns(debateId, options = {}) {
    try {
      const { round, side, includeAI = false } = options;

      const filter = { debate: debateId, isDeleted: false };
      
      if (round) filter.round = round;
      if (side) filter.side = side;

      const turns = await DebateTurn.find(filter)
        .sort({ turnNumber: 1 })
        .populate('author', 'username karma');

      // Optionally exclude AI analysis for lighter payloads
      const turnsData = turns.map(turn => {
        const turnObj = turn.toObject();
        if (!includeAI) {
          delete turnObj.aiAnalysis;
        }
        return turnObj;
      });

      return { success: true, turns: turnsData };
    } catch (error) {
      console.error('❌ Get turns error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a specific turn with full details
   */
  async getTurn(turnId) {
    try {
      const turn = await DebateTurn.findById(turnId)
        .populate('author', 'username karma')
        .populate('debate', 'topic status');

      if (!turn) {
        throw new Error('Turn not found');
      }

      return { success: true, turn };
    } catch (error) {
      console.error('❌ Get turn error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyze debate turn with AI
   */
  async analyzeDebateTurn(turnId) {
    try {
      const turn = await DebateTurn.findById(turnId)
        .populate('author', 'username')
        .populate('debate');
  
      if (!turn) {
        throw new Error('Turn not found');
      }
  
      const debate = turn.debate;
      const previousTurns = await DebateTurn.find({
        debate: debate._id,
        turnNumber: { $lt: turn.turnNumber },
        isDeleted: false
      }).sort({ turnNumber: 1 });
  
      const analysis = await debateAIService.analyzeTurn(
        turn.content,
        turn.side,
        previousTurns
      );
  
      // 🐛 DEBUG LOGGING - ADD THIS
      console.log('📊 Analysis received:');
      console.log('  Fallacies type:', typeof analysis.fallacies);
      console.log('  Fallacies value:', analysis.fallacies);
      console.log('  Is array:', Array.isArray(analysis.fallacies));
  
      // Ensure fallacies is an array
      if (typeof analysis.fallacies === 'string') {
        console.log('⚠️ Fallacies is a string! Attempting to parse...');
        try {
          analysis.fallacies = JSON.parse(analysis.fallacies);
        } catch (e) {
          console.error('❌ Failed to parse fallacies string');
          analysis.fallacies = [];
        }
      }
  
      if (!Array.isArray(analysis.fallacies)) {
        console.log('⚠️ Fallacies is not an array! Converting to array...');
        analysis.fallacies = [];
      }
      console.log('🔍 BEFORE SAVE:');
      console.log('  analysis.fallacies:', analysis.fallacies);
      console.log('  Type:', typeof analysis.fallacies);
      console.log('  Is Array:', Array.isArray(analysis.fallacies));
      console.log('  Stringified:', JSON.stringify(analysis.fallacies));
  
      turn.aiAnalysis = analysis;
      await turn.save();
  
      // Store in memory
      await debateAIService.storeInMemory(turn, debate);
  
      console.log(`🤖 AI analysis complete for turn ${turnId}`);
      return analysis;
  
    } catch (error) {
      console.error('❌ Analyze turn error:', error);
      throw error;
    }
  }
  /**
   * Score debate (called when debate completes)
   */
  async scoreDebate(debateId) {
    // Import scoring service here to avoid circular dependency
    const { default: debateScoringService } = await import('./debateScoringService.js');
    return debateScoringService.calculateFinalScore(debateId);
  }

  /**
   * Get turns grouped by round
   */
  async getTurnsByRound(debateId) {
    try {
      const turns = await DebateTurn.find({
        debate: debateId,
        isDeleted: false
      })
        .sort({ turnNumber: 1 })
        .populate('author', 'username karma');

      // Group by round
      const roundMap = new Map();
      
      turns.forEach(turn => {
        if (!roundMap.has(turn.round)) {
          roundMap.set(turn.round, []);
        }
        roundMap.get(turn.round).push(turn);
      });

      // Convert to array
      const rounds = Array.from(roundMap.entries()).map(([round, turns]) => ({
        round,
        turns
      }));

      return { success: true, rounds };
    } catch (error) {
      console.error('❌ Get turns by round error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if user can submit turn
   */
  async canSubmitTurn(debateId, userId) {
    try {
      const debate = await Debate.findById(debateId);
      
      if (!debate) {
        return { canSubmit: false, reason: 'Debate not found' };
      }

      if (debate.status !== 'active') {
        return { canSubmit: false, reason: 'Debate is not active' };
      }

      if (!debate.currentTurn || !debate.currentTurn.equals(userId)) {
        return { canSubmit: false, reason: 'Not your turn' };
      }

      return { canSubmit: true };
    } catch (error) {
      return { canSubmit: false, reason: error.message };
    }
  }
}

const debateTurnService = new DebateTurnService();
export default debateTurnService;