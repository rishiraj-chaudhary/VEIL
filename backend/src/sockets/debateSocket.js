import Debate from '../models/debate.js';

// Track active viewers per debate
const debateViewers = new Map(); // debateId -> Set of socketIds

/**
 * Initialize debate socket events
 */
export const initDebateSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('🔌 Debate socket connected:', socket.id);

    /* =====================================================
       JOIN DEBATE ROOM
    ===================================================== */
    socket.on('debate:join', async (debateId) => {
      try {
        // Join the room
        socket.join(`debate:${debateId}`);
        
        // Track viewer
        if (!debateViewers.has(debateId)) {
          debateViewers.set(debateId, new Set());
        }
        debateViewers.get(debateId).add(socket.id);

        // Get current viewer count
        const viewerCount = debateViewers.get(debateId).size;

        // Broadcast updated viewer count to everyone in the room
        io.to(`debate:${debateId}`).emit('debate:viewers', {
          debateId,
          viewerCount
        });

        console.log(`👁️  User joined debate ${debateId}, viewers: ${viewerCount}`);

        // Send current debate state to the joining user
        const debate = await Debate.findById(debateId)
          .populate('currentTurn', 'username')
          .populate('participants.user', 'username');

        if (debate) {
          socket.emit('debate:state', {
            debateId,
            status: debate.status,
            currentRound: debate.currentRound,
            currentTurn: debate.currentTurn,
            totalTurns: debate.totalTurns
          });
        }
      } catch (error) {
        console.error('Join debate room error:', error);
        socket.emit('debate:error', { message: 'Failed to join debate' });
      }
    });

    /* =====================================================
       LEAVE DEBATE ROOM
    ===================================================== */
    socket.on('debate:leave', (debateId) => {
      try {
        socket.leave(`debate:${debateId}`);
        
        // Remove from viewers
        if (debateViewers.has(debateId)) {
          debateViewers.get(debateId).delete(socket.id);
          const viewerCount = debateViewers.get(debateId).size;

          // Broadcast updated count
          io.to(`debate:${debateId}`).emit('debate:viewers', {
            debateId,
            viewerCount
          });

          // Clean up empty sets
          if (viewerCount === 0) {
            debateViewers.delete(debateId);
          }
        }

        console.log(`👋 User left debate ${debateId}`);
      } catch (error) {
        console.error('Leave debate room error:', error);
      }
    });

    /* =====================================================
       TYPING INDICATOR
    ===================================================== */
    socket.on('debate:typing', ({ debateId, username }) => {
      socket.to(`debate:${debateId}`).emit('debate:user-typing', {
        debateId,
        username
      });
    });

    socket.on('debate:stop-typing', ({ debateId }) => {
      socket.to(`debate:${debateId}`).emit('debate:user-stopped-typing', {
        debateId
      });
    });

    /* =====================================================
       DISCONNECT HANDLER
    ===================================================== */
    socket.on('disconnect', () => {
      console.log('❌ Debate socket disconnected:', socket.id);
      
      // Remove from all debate rooms
      debateViewers.forEach((viewers, debateId) => {
        if (viewers.has(socket.id)) {
          viewers.delete(socket.id);
          const viewerCount = viewers.size;

          io.to(`debate:${debateId}`).emit('debate:viewers', {
            debateId,
            viewerCount
          });

          if (viewerCount === 0) {
            debateViewers.delete(debateId);
          }
        }
      });
    });
  });
};

/* =====================================================
   EMIT FUNCTIONS (Called from controllers/services)
===================================================== */

/**
 * Emit when debate starts
 */
export const emitDebateStarted = (io, debateId, debate) => {
  io.to(`debate:${debateId}`).emit('debate:started', {
    debateId,
    status: debate.status,
    currentRound: debate.currentRound,
    currentTurn: debate.currentTurn,
    message: 'Debate has started!'
  });
  console.log(`🎉 Emitted debate started: ${debateId}`);
};

/**
 * Emit when new turn is submitted
 */
export const emitTurnSubmitted = (io, debateId, turnData) => {
  io.to(`debate:${debateId}`).emit('debate:turn-submitted', {
    debateId,
    turn: turnData.turn,
    nextTurn: turnData.nextTurn,
    currentRound: turnData.currentRound
  });
  console.log(`📝 Emitted turn submitted: ${turnData.turn._id}`);
};

/**
 * Emit when round advances
 */
export const emitRoundAdvanced = (io, debateId, roundData) => {
  io.to(`debate:${debateId}`).emit('debate:round-advanced', {
    debateId,
    currentRound: roundData.currentRound,
    message: `Round ${roundData.currentRound} started!`
  });
  console.log(`⏭️  Emitted round advanced: ${debateId} -> Round ${roundData.currentRound}`);
};

/**
 * Emit when debate completes
 */
export const emitDebateCompleted = (io, debateId, results) => {
  io.to(`debate:${debateId}`).emit('debate:completed', {
    debateId,
    winner: results.winner,
    finalScores: results.finalScores,
    message: 'Debate has concluded!'
  });
  console.log(`🏁 Emitted debate completed: ${debateId}`);
};

/**
 * Emit when someone joins the debate
 */
export const emitParticipantJoined = (io, debateId, participant) => {
  io.to(`debate:${debateId}`).emit('debate:participant-joined', {
    debateId,
    participant,
    message: `${participant.username} joined the debate!`
  });
  console.log(`👤 Emitted participant joined: ${participant.username}`);
};

/**
 * Emit when someone marks ready
 */
export const emitParticipantReady = (io, debateId, userId, username) => {
  io.to(`debate:${debateId}`).emit('debate:participant-ready', {
    debateId,
    userId,
    username,
    message: `${username} is ready!`
  });
  console.log(`✅ Emitted participant ready: ${username}`);
};

/**
 * Emit when vote is cast
 */
export const emitVoteCast = (io, debateId, voteData) => {
  io.to(`debate:${debateId}`).emit('debate:vote-cast', {
    debateId,
    round: voteData.round,
    // Don't send individual votes, just trigger refresh
    message: 'New vote cast'
  });
  console.log(`🗳️  Emitted vote cast: ${debateId} Round ${voteData.round}`);
};

/**
 * Emit when reaction is added
 */
export const emitReactionAdded = (io, debateId, turnId, reactionData) => {
  io.to(`debate:${debateId}`).emit('debate:reaction-added', {
    debateId,
    turnId,
    reactionType: reactionData.reactionType,
    // Don't send user info for privacy
  });
  console.log(`👍 Emitted reaction added: ${turnId}`);
};

/**
 * Emit when debate is cancelled
 */
export const emitDebateCancelled = (io, debateId) => {
  io.to(`debate:${debateId}`).emit('debate:cancelled', {
    debateId,
    message: 'Debate has been cancelled'
  });
  console.log(`❌ Emitted debate cancelled: ${debateId}`);
};

/**
 * Get current viewer count for a debate
 */
export const getViewerCount = (debateId) => {
  return debateViewers.get(debateId)?.size || 0;
};

/**
 * Get all active debates with viewers
 */
export const getActiveDebates = () => {
  return Array.from(debateViewers.entries()).map(([debateId, viewers]) => ({
    debateId,
    viewerCount: viewers.size
  }));
};