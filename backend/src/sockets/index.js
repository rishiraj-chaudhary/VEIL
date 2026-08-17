/**
 * SOCKET INDEX
 *
 * Wires the default namespace (posts + debates) plus the /assistant and /huddle
 * namespaces.
 */

import { Server } from 'socket.io';
import { allowedOrigins } from '../config/cors.js';
import logger from '../utils/logger.js';
import { initLiveAssistant } from './assistantSocket.js';
import { initDebateSocket } from './debateSocket.js';
import { initHuddleSocket } from './huddleSocket.js';
import { authenticateSocket } from './socketAuth.js';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // The default namespace carries debate turns and post activity. It used to
  // accept unauthenticated connections, so anyone who knew (or guessed) a debate
  // id could join `debate-<id>` and receive every turn of a private practice
  // debate in real time, plus typing indicators and viewer counts.
  io.use(authenticateSocket);

  const activeUsers = new Map();

  const leavePost = (socket, postId) => {
    const viewers = activeUsers.get(postId);
    if (!viewers) return;

    viewers.delete(socket.id);
    io.to(`post:${postId}`).emit('viewer-count', viewers.size);
    if (viewers.size === 0) activeUsers.delete(postId);
  };

  io.on('connection', (socket) => {
    logger.debug('socket connected', { socketId: socket.id, userId: socket.userId });

    socket.on('join-post', (postId) => {
      if (!postId) return;
      socket.join(`post:${postId}`);
      if (!activeUsers.has(postId)) activeUsers.set(postId, new Set());
      activeUsers.get(postId).add(socket.id);
      io.to(`post:${postId}`).emit('viewer-count', activeUsers.get(postId).size);
    });

    socket.on('leave-post', (postId) => {
      if (!postId) return;
      socket.leave(`post:${postId}`);
      leavePost(socket, postId);
    });

    socket.on('disconnect', () => {
      logger.debug('socket disconnected', { socketId: socket.id });
      for (const postId of [...activeUsers.keys()]) leavePost(socket, postId);
    });
  });

  // Debate room handlers register their own listeners on this same namespace.
  initDebateSocket(io);
  initLiveAssistant(io);
  initHuddleSocket(io);

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

/**
 * Emit helpers used from HTTP handlers.
 *
 * These no-op when the socket layer is absent — scripts, tests and the window
 * before `initSocket` runs — because a missing realtime broadcast must never
 * fail the write that already succeeded.
 */
export const emitVoteUpdate = (postId, data) => {
  if (io) io.to(`post:${postId}`).emit('vote-update', data);
};

export const emitNewComment = (postId, comment) => {
  if (io) io.to(`post:${postId}`).emit('new-comment', comment);
};

export {
  emitDebateCancelled, emitDebateCompleted, emitDebateStarted,
  emitParticipantJoined, emitParticipantReady, emitReactionAdded,
  emitRoundAdvanced, emitTurnSubmitted, emitVoteCast,
  getActiveDebates, getViewerCount
} from './debateSocket.js';
