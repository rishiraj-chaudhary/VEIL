/**
 * HUDDLE SOCKET — Phase 11
 * WebRTC signaling: offer, answer, ICE candidates
 * Place at: backend/src/sockets/huddleSocket.js
 */

import Huddle from '../models/Huddle.js';

export const initHuddleSocket = (io) => {
  const huddleNamespace = io.of('/huddle');

  huddleNamespace.on('connection', (socket) => {
    console.log('🎙️ Huddle socket connected:', socket.id);

    // ── Join huddle room ────────────────────────────────────────────────────────
    socket.on('huddle:join', async ({ huddleId, userId, username }) => {
      try {
        const huddle = await Huddle.findById(huddleId).lean();
        if (!huddle) return socket.emit('huddle:error', { message: 'Huddle not found' });

        socket.join(`huddle:${huddleId}`);
        socket.huddleId = huddleId;
        socket.userId   = userId;
        socket.username = username;

        // Notify others in room that someone joined
        socket.to(`huddle:${huddleId}`).emit('huddle:peer-joined', { userId, username });

        // Tell the joiner how many peers are in the room
        const room   = huddleNamespace.adapter.rooms.get(`huddle:${huddleId}`);
        const count  = room ? room.size : 1;
        socket.emit('huddle:joined', { huddleId, peerCount: count - 1 });

        console.log(`🎙️ ${username} joined huddle ${huddleId}`);
      } catch (err) {
        socket.emit('huddle:error', { message: err.message });
      }
    });

    // ── WebRTC: send offer ──────────────────────────────────────────────────────
    socket.on('huddle:offer', ({ huddleId, offer, toUserId }) => {
      socket.to(`huddle:${huddleId}`).emit('huddle:offer', {
        offer,
        fromUserId: socket.userId,
        username:   socket.username,
      });
    });

    // ── WebRTC: send answer ─────────────────────────────────────────────────────
    socket.on('huddle:answer', ({ huddleId, answer }) => {
      socket.to(`huddle:${huddleId}`).emit('huddle:answer', {
        answer,
        fromUserId: socket.userId,
      });
    });

    // ── WebRTC: ICE candidate ───────────────────────────────────────────────────
    socket.on('huddle:ice-candidate', ({ huddleId, candidate }) => {
      socket.to(`huddle:${huddleId}`).emit('huddle:ice-candidate', {
        candidate,
        fromUserId: socket.userId,
      });
    });

    // ── Transcript chunk from speech recognition ────────────────────────────────
    socket.on('huddle:transcript-chunk', ({ huddleId, text }) => {
      // Broadcast to other participant so they see live captions
      socket.to(`huddle:${huddleId}`).emit('huddle:transcript-chunk', {
        username: socket.username,
        text,
      });
    });

    // ── Peer ended the huddle ───────────────────────────────────────────────────
    socket.on('huddle:end', ({ huddleId }) => {
      socket.to(`huddle:${huddleId}`).emit('huddle:peer-ended', {
        username: socket.username,
      });
    });

    // ── Disconnect ──────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (socket.huddleId) {
        socket.to(`huddle:${socket.huddleId}`).emit('huddle:peer-left', {
          userId:   socket.userId,
          username: socket.username,
        });
      }
      console.log('🎙️ Huddle socket disconnected:', socket.id);
    });
  });

  return huddleNamespace;
};