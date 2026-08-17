import { useEffect } from 'react';
import { getSocket } from '../services/socket';

/**
 * The shared socket connection.
 *
 * Deliberately not disconnected on unmount: the connection is process-wide and
 * other mounted components depend on it. `disconnectSocket` in services/socket
 * is the explicit teardown, used on logout.
 */
export const useSocket = () => getSocket();

export const useSocketEvent = (event, callback) => {
  useEffect(() => {
    const socket = getSocket();
    socket.on(event, callback);

    return () => {
      socket.off(event, callback);
    };
  }, [event, callback]);
};

export default useSocket;
