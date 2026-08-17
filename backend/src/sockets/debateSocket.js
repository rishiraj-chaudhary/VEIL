import Debate from '../models/debate.js';
import logger from '../utils/logger.js';

/**
 * May this socket watch this debate?
 *
 * Public debates are open to any signed-in user — an audience is the point, and
 * audience voting depends on it. Private ones (which is what every practice
 * debate against the AI is) are restricted to their participants.
 */
const canWatch = async (debateId, userId) => {
  const debate = await Debate.findById(debateId)
    .select('visibility participants.user initiator')
    .lean();

  if (!debate) return false;
  if (debate.visibility !== 'private') return true;

  const viewer = userId?.toString();
  return debate.initiator?.toString() === viewer
    || debate.participants?.some(p => p.user?.toString() === viewer);
};

const emitViewerCount = (io, debateId) => {
  const room = io.sockets.adapter.rooms.get(`debate-${debateId}`);
  io.to(`debate-${debateId}`).emit('viewer-count', room ? room.size : 0);
};

export const initDebateSocket = (io) => {
  io.on('connection', (socket) => {
    // Rooms this socket has actually been admitted to. Typing indicators
    // broadcast to a room id taken from the message payload previously, so a
    // client could emit into any debate room it had never joined.
    const joined = new Set();

    socket.on('join-debate', async (debateId) => {
      if (!debateId) return;

      try {
        if (!(await canWatch(debateId, socket.userId))) {
          socket.emit('debate-error', { message: 'This debate is not available to you' });
          return;
        }
      } catch (error) {
        logger.warn('debate join check failed', { debateId, error: error.message });
        return;
      }

      socket.join(`debate-${debateId}`);
      joined.add(debateId);
      emitViewerCount(io, debateId);
    });

    socket.on('leave-debate', (debateId) => {
      if (!debateId) return;
      socket.leave(`debate-${debateId}`);
      joined.delete(debateId);
      emitViewerCount(io, debateId);
    });

    // Typing indicators — only into rooms this socket was admitted to, and
    // always under the identity the handshake established rather than a
    // username supplied in the payload.
    socket.on('typing', ({ debateId } = {}) => {
      if (!joined.has(debateId)) return;
      socket.to(`debate-${debateId}`).emit('user-typing', { username: socket.username });
    });

    socket.on('stop-typing', ({ debateId } = {}) => {
      if (!joined.has(debateId)) return;
      socket.to(`debate-${debateId}`).emit('user-stopped-typing');
    });

    socket.on('disconnect', () => {
      for (const debateId of joined) emitViewerCount(io, debateId);
      joined.clear();
    });
  });

  logger.info('debate socket initialised');
};

// Emit debate started
export const emitDebateStarted = (io, debateId, debate) => {
  io.to(`debate-${debateId}`).emit('debate-started', {
    debateId,
    debate
  });
};

// Emit analysis complete
export const emitAnalysisComplete = (io, debateId, turnId) => {
  io.to(`debate-${debateId}`).emit('analysis-complete', {
    turnId
  });
};

// Emit turn submitted
export const emitTurnSubmitted = (io, debateId, turnData) => {
  io.to(`debate-${debateId}`).emit('turn-submitted', turnData);
};

// Emit round advanced
export const emitRoundAdvanced = (io, debateId, roundData) => {
  io.to(`debate-${debateId}`).emit('round-advanced', roundData);
};

// Emit debate completed
export const emitDebateCompleted = (io, debateId, results) => {
  io.to(`debate-${debateId}`).emit('debate-completed', results);
};

// Emit participant joined
export const emitParticipantJoined = (io, debateId, participant) => {
  io.to(`debate-${debateId}`).emit('participant-joined', participant);
};

// Emit participant ready
export const emitParticipantReady = (io, debateId, userId, username) => {
  io.to(`debate-${debateId}`).emit('participant-ready', {
    userId,
    username
  });
};

// Emit vote cast
export const emitVoteCast = (io, debateId, voteData) => {
  io.to(`debate-${debateId}`).emit('vote-cast', voteData);
};

// Emit reaction added
export const emitReactionAdded = (io, debateId, turnId, reactionData) => {
  io.to(`debate-${debateId}`).emit('reaction-added', {
    turnId,
    ...reactionData
  });
};

// Emit debate cancelled
export const emitDebateCancelled = (io, debateId) => {
  io.to(`debate-${debateId}`).emit('debate-cancelled', {
    debateId
  });
};

// Get viewer count (utility function)
export const getViewerCount = (io, debateId) => {
  const room = io.sockets.adapter.rooms.get(`debate-${debateId}`);
  return room ? room.size : 0;
};

// Get active debates (utility function)
export const getActiveDebates = (io) => {
  const rooms = io.sockets.adapter.rooms;
  const activeDebates = [];
  
  rooms.forEach((sockets, roomName) => {
    if (roomName.startsWith('debate-')) {
      activeDebates.push({
        debateId: roomName.replace('debate-', ''),
        viewers: sockets.size
      });
    }
  });
  
  return activeDebates;
};