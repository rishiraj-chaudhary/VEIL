import { useEffect } from 'react';
import { getSocket } from '../services/socket';

export const useSocket = () => {
  useEffect(() => {
    const socket = getSocket();

    return () => {
      // Don't disconnect on unmount, keep connection alive
    };
  }, []);

  return getSocket();
};

export const useSocketEvent = (event, callback) => {
  useEffect(() => {
    const socket = getSocket();
    socket.on(event, callback);

    return () => {
      socket.off(event, callback);
    };
  }, [event, callback]);
};