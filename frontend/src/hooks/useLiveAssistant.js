import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { authToken } from '../services/socket';

/**
 * LIVE DEBATE ASSISTANT HOOK
 *
 * Streams draft analysis over the /assistant namespace. That namespace is now
 * authenticated — each analysis costs several model calls, so it cannot be
 * reachable without a token — and it derives the user from the handshake, so
 * nothing here needs to send a userId.
 */
export const useLiveAssistant = (debateId, side) => {
  const [insights, setInsights] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const throttleTimer = useRef(null);
  const THROTTLE_DELAY = 2000;

  // Initialize socket connection
  useEffect(() => {
    if (!debateId) return undefined;

    // Create socket
    const assistantSocket = io(`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/assistant`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: (cb) => cb({ token: authToken() }),
    });

    // 🔥 CRITICAL: Set up ALL listeners BEFORE connecting
    // This ensures they exist when the socket connects

    // Draft insights listener
    assistantSocket.on('draft-insights', (data) => {
      setInsights(data);
      setIsAnalyzing(false);
    });

    // The server emits this when the per-connection ceiling is hit. Without
    // handling it the spinner span forever, because no insights ever arrive.
    assistantSocket.on('draft-insights-error', () => {
      setIsAnalyzing(false);
    });

    // Connection events
    assistantSocket.on('connect', () => {
      setIsConnected(true);
      assistantSocket.emit('join-debate-assistant', { debateId });
    });

    assistantSocket.on('connect_error', (error) => {
      console.error('Assistant connection error:', error.message);
      setIsConnected(false);
      setIsAnalyzing(false);
    });

    assistantSocket.on('disconnect', () => {
      setIsConnected(false);
      setIsAnalyzing(false);
    });

    assistantSocket.on('reconnect', () => {
      setIsConnected(true);
    });

    // Set socket in state
    setSocket(assistantSocket);

    // Cleanup
    return () => {
      if (assistantSocket.connected) {
        assistantSocket.emit('leave-debate-assistant', { debateId });
      }
      assistantSocket.removeAllListeners();
      assistantSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [debateId]);

  /**
   * Analyze draft (throttled)
   */
  const analyzeDraft = useCallback((currentDraft) => {
    if (!socket || !isConnected) return;
    if (!currentDraft || currentDraft.length < 20) return;

    // Clear existing timer
    if (throttleTimer.current) {
      clearTimeout(throttleTimer.current);
    }

    // Set new timer
    throttleTimer.current = setTimeout(() => {
      setIsAnalyzing(true);

      // No userId: the server reads it from the authenticated handshake, and
      // sending one here would be a value the server has no reason to trust.
      socket.emit('analyze-draft', {
        debateId,
        currentDraft,
        side
      });
    }, THROTTLE_DELAY);

  }, [socket, isConnected, debateId, side]);

  /**
   * Clear insights
   */
  const clearInsights = useCallback(() => {
    setInsights(null);
  }, []);

  return {
    insights,
    isAnalyzing,
    analyzeDraft,
    clearInsights,
    isConnected // Expose connection status
  };
};