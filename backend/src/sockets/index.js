/**
 * SOCKET INDEX — updated for Phase 11 (adds huddle namespace)
 * Place at: backend/src/sockets/index.js
 */

import { Server } from 'socket.io';
import { initLiveAssistant } from './assistantSocket.js';
import { initDebateSocket } from './debateSocket.js';
import { initHuddleSocket } from './huddleSocket.js';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  const activeUsers = new Map();

  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    socket.on('join-post', (postId) => {
      socket.join(`post:${postId}`);
      if (!activeUsers.has(postId)) activeUsers.set(postId, new Set());
      activeUsers.get(postId).add(socket.id);
      io.to(`post:${postId}`).emit('viewer-count', activeUsers.get(postId).size);
    });

    socket.on('leave-post', (postId) => {
      socket.leave(`post:${postId}`);
      if (activeUsers.has(postId)) {
        activeUsers.get(postId).delete(socket.id);
        const count = activeUsers.get(postId).size;
        io.to(`post:${postId}`).emit('viewer-count', count);
        if (count === 0) activeUsers.delete(postId);
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ User disconnected:', socket.id);
      activeUsers.forEach((users, postId) => {
        if (users.has(socket.id)) {
          users.delete(socket.id);
          const count = users.size;
          io.to(`post:${postId}`).emit('viewer-count', count);
          if (count === 0) activeUsers.delete(postId);
        }
      });
    });
  });

  initDebateSocket(io);
  initLiveAssistant(io);
  initHuddleSocket(io);   // ← Phase 11

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

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
