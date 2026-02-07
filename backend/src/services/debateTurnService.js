import Debate from '../models/debate.js';
import DebateTurn from '../models/debateTurn.js';
import aiCoachService from './aiCoachService.js';
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
    try {
      console.log('\n🔄 ========== ADVANCING DEBATE ==========');
      console.log('Debate ID:', debate._id);
      console.log('Current round:', debate.currentRound, '/ Total rounds:', debate.rounds.length);
      console.log('Side that just submitted:', currentSide);
  
      // Count turns in current round
      const turnsThisRound = await DebateTurn.countDocuments({
        debate: debate._id,
        round: debate.currentRound
      });
  
      console.log('Turns submitted in round', debate.currentRound, ':', turnsThisRound);
  
      // Check if round is complete (both sides have submitted)
      if (turnsThisRound >= 2) {
        console.log('✅ Round', debate.currentRound, 'complete! Both sides submitted.');
        
        // Move to next round
        debate.currentRound += 1;
        console.log('➡️  Moving to round:', debate.currentRound);
  
        // Check if all rounds are complete
        if (debate.currentRound > debate.rounds.length) {
          console.log('\n🏁 ========== ALL ROUNDS COMPLETE ==========');
          
          debate.status = 'completed';
          debate.completedAt = new Date();
          
          // ✅ SAVE FIRST so calculateFinalScore can see status='completed'
          await debate.save();
          console.log('✅ Debate status saved as completed');
        
          // Calculate final scores
          try {
            const { default: debateScoringService } = await import('./debateScoringService.js');
            const finalScore = await debateScoringService.calculateFinalScore(debate._id);
        
            console.log('📊 Final Scores:');
            console.log('  FOR side:', finalScore.forSide?.totalScore || 0);
            console.log('  AGAINST side:', finalScore.againstSide?.totalScore || 0);
        
            // Determine winner
            const forScore = finalScore.forSide?.totalScore || 0;
            const againstScore = finalScore.againstSide?.totalScore || 0;
        
            if (forScore > againstScore) {
              debate.winner = 'for';
              console.log('🏆 Winner: FOR');
            } else if (againstScore > forScore) {
              debate.winner = 'against';
              console.log('🏆 Winner: AGAINST');
            } else {
              debate.winner = 'draw';
              console.log('🤝 Result: DRAW');
            }
        
            // Save winner
            await debate.save();
        
            // Update user performances
            console.log('📊 Updating user performances...');
            for (const participant of debate.participants) {
              try {
                await aiCoachService.updatePerformanceAfterDebate(participant.user, debate);
                console.log(`  ✅ Updated performance for ${participant.user}`);
              } catch (error) {
                console.error(`  ❌ Failed to update performance for ${participant.user}:`, error.message);
              }
            }
        
          } catch (error) {
            console.error('❌ Error calculating final score:', error);
            debate.winner = 'draw';
            await debate.save();
          }
        
          // Emit socket event
          try {
            const { getIO } = await import('../sockets/index.js');
            const io = getIO();
            if (io) {
              io.to(`debate_${debate._id}`).emit('debate:completed', {
                debateId: debate._id,
                winner: debate.winner,
                status: 'completed'
              });
              console.log('📡 Emitted debate:completed event');
            }
          } catch (err) {
            console.error('❌ Socket emit error:', err);
          }
        
          console.log('========================================\n');
          return debate;
        }
      }
  
      // ✅ FIX: Set next turn to the USER ID, not the side string
      const nextSide = currentSide === 'for' ? 'against' : 'for';
      const nextParticipant = debate.participants.find(p => p.side === nextSide);
      
      if (nextParticipant) {
        debate.currentTurn = nextParticipant.user;
        console.log('Next turn: User', nextParticipant.user, '(', nextSide, 'side)');
      } else {
        console.error('❌ Could not find participant for side:', nextSide);
      }
  
      await debate.save();
      console.log('========================================\n');
  
      return debate;
  
    } catch (error) {
      console.error('❌ Error advancing debate:', error);
      throw error;
    }
  }

  /**
   * Get all turns for a debate
   */
  // UPDATED getDebateTurns for backend/src/services/debateTurnService.js

async getDebateTurns(debateId, options = {}) {
  try {
    const { round, side, includeAI = true } = options;

    const query = {
      debate: debateId,
      isDeleted: false
    };

    if (round) query.round = round;
    if (side) query.side = side;

    // ✅ CRITICAL: Use .lean() to get ALL fields including aiAnalysis
    const turns = await DebateTurn.find(query)
      .populate('author', 'username')
      .sort({ turnNumber: 1 })
      .lean(); // ← This ensures aiAnalysis is included!

    console.log(`📊 Fetched ${turns.length} turns for debate ${debateId}`);
    
    // Debug first turn
    if (turns.length > 0) {
      console.log('✅ First turn has aiAnalysis:', !!turns[0].aiAnalysis);
      if (turns[0].aiAnalysis) {
        console.log('   - Has toneScore:', !!turns[0].aiAnalysis.toneScore);
        console.log('   - Has decisionTrace:', !!turns[0].aiAnalysis.decisionTrace);
      }
    }

    return {
      success: true,
      turns
    };
  } catch (error) {
    console.error('Get debate turns error:', error);
    return {
      success: false,
      error: error.message
    };
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
      await debateAIService.processClaimsForGraph(
        analysis.claims,
        turn,
        debate,
        analysis.overallQuality
      );
      // Store in memory
      await debateAIService.storeInMemory(turn, debate);
      try {
        await aiCoachService.updatePerformanceAfterTurn(turn.author._id || turn.author, turn);
        console.log('📊 Performance updated for user');
      } catch (error) {
        console.error('Performance update error (non-blocking):', error);
      }
      try {
        const { getIO, emitAnalysisComplete } = await import('../sockets/index.js');
        const io = getIO();
        emitAnalysisComplete(
          io,
          turn.debate.toString(),
          turn._id.toString()
        );
      } catch (error) {
        console.log('⚠️ Socket emit skipped (socket not available)');
      }
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