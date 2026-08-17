import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

/**
 * The access token, read at connect time rather than captured once.
 *
 * Access tokens are short-lived and rotate, so a value captured at module load
 * is stale by the time a reconnect happens.
 */
export const authToken = () =>
  localStorage.getItem('veil_token') || localStorage.getItem('token') || null;

let socket = null;

export const initSocket = () => {
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    // Falling back to polling matters behind proxies that do not pass through
    // websocket upgrades; 'websocket' alone fails outright there.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    // The server authenticates the handshake, so an unauthenticated socket is
    // rejected before it can join any room.
    auth: (cb) => cb({ token: authToken() }),
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });

  return socket;
};

export const getSocket = () => socket || initSocket();

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
