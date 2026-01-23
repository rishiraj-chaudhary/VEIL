import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5001';

let socket = null;

export const initDebateSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log('🔌 Debate socket connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('❌ Debate socket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Debate socket error:', error);
    });
  }

  return socket;
};

export const getDebateSocket = () => {
  if (!socket) {
    return initDebateSocket();
  }
  return socket;
};

export const disconnectDebateSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// ==================== DEBATE ROOM ====================

export const joinDebateRoom = (debateId) => {
  const socket = getDebateSocket();
  socket.emit('debate:join', debateId);
  console.log(`📍 Joined debate room: ${debateId}`);
};

export const leaveDebateRoom = (debateId) => {
  const socket = getDebateSocket();
  socket.emit('debate:leave', debateId);
  console.log(`👋 Left debate room: ${debateId}`);
};

// ==================== TYPING INDICATORS ====================

export const emitTyping = (debateId, username) => {
  const socket = getDebateSocket();
  socket.emit('debate:typing', { debateId, username });
};

export const emitStopTyping = (debateId) => {
  const socket = getDebateSocket();
  socket.emit('debate:stop-typing', { debateId });
};

// ==================== EVENT LISTENERS ====================

export const onViewerCount = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:viewers', callback);
};

export const onDebateState = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:state', callback);
};

export const onDebateStarted = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:started', callback);
};

export const onTurnSubmitted = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:turn-submitted', callback);
};

export const onRoundAdvanced = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:round-advanced', callback);
};

export const onDebateCompleted = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:completed', callback);
};

export const onParticipantJoined = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:participant-joined', callback);
};

export const onParticipantReady = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:participant-ready', callback);
};

export const onVoteCast = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:vote-cast', callback);
};

export const onReactionAdded = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:reaction-added', callback);
};

export const onDebateCancelled = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:cancelled', callback);
};

export const onUserTyping = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:user-typing', callback);
};

export const onUserStoppedTyping = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:user-stopped-typing', callback);
};

export const onDebateError = (callback) => {
  const socket = getDebateSocket();
  socket.on('debate:error', callback);
};

// ==================== CLEANUP ====================

export const removeAllListeners = () => {
  const socket = getDebateSocket();
  socket.removeAllListeners('debate:viewers');
  socket.removeAllListeners('debate:state');
  socket.removeAllListeners('debate:started');
  socket.removeAllListeners('debate:turn-submitted');
  socket.removeAllListeners('debate:round-advanced');
  socket.removeAllListeners('debate:completed');
  socket.removeAllListeners('debate:participant-joined');
  socket.removeAllListeners('debate:participant-ready');
  socket.removeAllListeners('debate:vote-cast');
  socket.removeAllListeners('debate:reaction-added');
  socket.removeAllListeners('debate:cancelled');
  socket.removeAllListeners('debate:user-typing');
  socket.removeAllListeners('debate:user-stopped-typing');
  socket.removeAllListeners('debate:error');
};