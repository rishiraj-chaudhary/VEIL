/**
 * HUDDLE SOCKET — Phase 11
 * WebRTC signaling: offer, answer, ICE candidates
 * Place at: backend/src/sockets/huddleSocket.js
 */

import Huddle from '../models/Huddle.js';
import User from '../models/user.js';
import { verifyToken } from '../utils/jwt.js';

const isParticipant = (huddle, userId) =>
  huddle.host?.toString() === userId || huddle.guest?.toString() === userId;

export const initHuddleSocket = (io) => {
  const huddleNamespace = io.of('/huddle');

  // The client already sends its JWT in the handshake; verifying it here is what
  // makes socket.userId trustworthy instead of whatever the client claims.
  huddleNamespace.use(async (socket, next) => {
    try {
      const decoded = verifyToken(socket.handshake.auth?.token);
      if (!decoded) return next(new Error('Invalid or expired token'));

      const user = await User.findById(decoded.id).select('username isActive').lean();
      if (!user || !user.isActive) return next(new Error('User not found or disabled'));

      socket.userId   = user._id.toString();
      socket.username = user.username;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  huddleNamespace.on('connection', (socket) => {
    console.log('🎙️ Huddle socket connected:', socket.id);

    // ── Join huddle room ────────────────────────────────────────────────────────
    socket.on('huddle:join', async ({ huddleId }) => {
      try {
        const huddle = await Huddle.findById(huddleId).lean();
        if (!huddle) return socket.emit('huddle:error', { message: 'Huddle not found' });

        // Signaling and live captions are private to the two participants.
        if (!isParticipant(huddle, socket.userId)) {
          return socket.emit('huddle:error', { message: 'Not a participant of this huddle' });
        }

        const { userId, username } = socket;
        socket.join(`huddle:${huddleId}`);
        socket.huddleId = huddleId;

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

    // Every broadcast targets the room this socket was admitted to, never a
    // room id taken from the message payload.
    const broadcast = (event, payload) => {
      if (!socket.huddleId) return;
      socket.to(`huddle:${socket.huddleId}`).emit(event, payload);
    };

    // ── WebRTC: send offer ──────────────────────────────────────────────────────
    socket.on('huddle:offer', ({ offer }) => {
      broadcast('huddle:offer', {
        offer,
        fromUserId: socket.userId,
        username:   socket.username,
      });
    });

    // ── WebRTC: send answer ─────────────────────────────────────────────────────
    socket.on('huddle:answer', ({ answer }) => {
      broadcast('huddle:answer', { answer, fromUserId: socket.userId });
    });

    // ── WebRTC: ICE candidate ───────────────────────────────────────────────────
    socket.on('huddle:ice-candidate', ({ candidate }) => {
      broadcast('huddle:ice-candidate', { candidate, fromUserId: socket.userId });
    });

    // ── Transcript chunk from speech recognition ────────────────────────────────
    socket.on('huddle:transcript-chunk', ({ text }) => {
      // Broadcast to other participant so they see live captions
      broadcast('huddle:transcript-chunk', { username: socket.username, text });
    });

    // ── Peer ended the huddle ───────────────────────────────────────────────────
    socket.on('huddle:end', () => {
      broadcast('huddle:peer-ended', { username: socket.username });
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