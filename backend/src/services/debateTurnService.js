import Debate from '../models/debate.js';
import DebateTurn from '../models/debateTurn.js';
import debateAIService from './debateAIService.js';
import { JOB_TYPES } from './jobHandlers.js';
import jobQueue from './jobQueue.js';

class DebateTurnService {
  /**
   * ✅ SUBMIT DEBATE TURN (with AI cost tracking + auto-scoring)
   */
  async submitDebateTurn(debateId, userId, content, userTier = 'free') {
    try {
      // Get debate
      const debate = await Debate.findById(debateId);
      if (!debate) {
        return { success: false, error: 'Debate not found' };
      }
  
      // Check if debate is active
      if (debate.status !== 'active') {
        return { success: false, error: 'Debate is not active' };
      }
  
      // Check if it's user's turn
      if (debate.currentTurn && !debate.currentTurn.equals(userId)) {
        return { success: false, error: 'It is not your turn' };
      }
  
      // Find participant
      const participant = debate.participants.find(
        p => p.user.equals(userId)
      );
  
      if (!participant) {
        return { success: false, error: 'You are not a participant in this debate' };
      }
  
      // ✅ Calculate turn number
      const existingTurns = await DebateTurn.countDocuments({ debate: debateId });
      const turnNumber = existingTurns + 1;
  
      // Create turn
      const turn = new DebateTurn({
        debate: debateId,
        author: userId,
        side: participant.side,
        round: debate.currentRound || 1,
        turnNumber: turnNumber,
        content: content.trim(),
        wordCount: content.trim().split(/\s+/).length
      });
  
      await turn.save();
  
      // Get previous turns for AI context
      const previousTurns = await DebateTurn.find({
        debate: debateId,
        _id: { $ne: turn._id }
      }).sort({ createdAt: 1 });
  
      console.log(`🤖 Analyzing turn for user: ${userId} (tier: ${userTier})`);
  
      // ✅ Analyze with AI tracking
      const aiAnalysis = await debateAIService.analyzeTurn(
        content,
        participant.side,
        previousTurns,
        userId,
        debateId,
        userTier
      );
  
      // Save AI analysis to turn
      turn.aiAnalysis = aiAnalysis;
      await turn.save();
  
      console.log(`✅ AI analysis complete. Overall quality: ${aiAnalysis.overallQuality}/100`);
  
      // Process claims for knowledge graph
      if (aiAnalysis.claims && aiAnalysis.claims.length > 0) {
        try {
          await debateAIService.processClaimsForGraph(
            aiAnalysis.claims,
            turn,
            debate,
            aiAnalysis.overallQuality,
            turn.author
          );
        } catch (error) {
          console.error('⚠️ Failed to process claims for graph:', error);
        }
      }

      // Record which opposing claims this turn challenges. Queued so a failure
      // is retried rather than silently dropping a user's reputation update.
      await jobQueue.enqueue(JOB_TYPES.DETECT_REFUTATIONS, {
        debateId: debate._id.toString(),
        authorSide: turn.side,
        rebuttalText: turn.content,
        rebuttalQuality: aiAnalysis.overallQuality ?? 50,
      });
  
      // Store turn in debate memory (RAG)
      try {
        await debateAIService.storeInMemory(turn, debate);
      } catch (error) {
        console.error('⚠️ Failed to store in memory:', error);
      }
      
      if (!debate.turns) {
        debate.turns = [];
      }
  
      // Update debate
      debate.turns.push(turn._id);
      debate.totalTurns += 1;
      debate.lastActivity = new Date();
  
      // Check if debate should complete
      const maxRounds = debate.maxRounds || 3;
      const turnsPerRound = 2;
      const totalExpectedTurns = maxRounds * turnsPerRound;

      if (debate.totalTurns >= totalExpectedTurns) {
        console.log(`🏁 Debate reached max rounds (${maxRounds}). Completing debate...`);
        
        debate.status = 'completed';
        debate.completedAt = new Date();
        debate.currentTurn = null;
        
        await debate.save();
        
        // Queued: losing this leaves a completed debate with no verdict and
        // both records unresolved, with nothing indicating scoring was owed.
        await jobQueue.enqueue(JOB_TYPES.SCORE_DEBATE, { debateId: debateId.toString() },
          { dedupeKey: `score:${debateId}`, maxAttempts: 5 });

      } else {
        // Switch turn to opponent
        const opponents = debate.participants.filter(
          p => p.side !== participant.side
        );
        if (opponents.length > 0) {
          debate.currentTurn = opponents[0].user;
        }
        
        // ✅ Advance round if both sides have submitted
        const turnsInCurrentRound = debate.totalTurns % turnsPerRound;
        if (turnsInCurrentRound === 0 && debate.currentRound < maxRounds) {
          debate.currentRound += 1;
          console.log(`📊 Advanced to Round ${debate.currentRound}`);
        }
        
        await debate.save();
      }
  
      // Populate author info
      await turn.populate('author', 'username');
  
      return {
        success: true,
        turn,
        debate
      };
  
    } catch (error) {
      console.error('❌ Submit turn error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all turns for a debate
   */
  async getDebateTurns(debateId) {
    try {
      const turns = await DebateTurn.find({ debate: debateId })
        .sort({ createdAt: 1 })
        .populate('author', 'username');

      return { success: true, turns };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get single turn
   */
  async getTurn(turnId) {
    try {
      const turn = await DebateTurn.findById(turnId)
        .populate('author', 'username');

      if (!turn) {
        return { success: false, error: 'Turn not found' };
      }

      return { success: true, turn };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get turns by round
   */
  async getTurnsByRound(debateId, round) {
    try {
      const turns = await DebateTurn.find({
        debate: debateId,
        round
      })
        .sort({ createdAt: 1 })
        .populate('author', 'username');

      return { success: true, turns };
    } catch (error) {
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

      if (debate.currentTurn && !debate.currentTurn.equals(userId)) {
        return { canSubmit: false, reason: 'It is not your turn' };
      }

      const participant = debate.participants.find(
        p => p.user.equals(userId)
      );

      if (!participant) {
        return { canSubmit: false, reason: 'You are not a participant' };
      }

      return {
        canSubmit: true,
        side: participant.side,
        round: debate.currentRound
      };

    } catch (error) {
      return { canSubmit: false, reason: error.message };
    }
  }
}

const debateTurnService = new DebateTurnService();
export default debateTurnService;