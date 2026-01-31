import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * LIVE DEBATE ASSISTANT HOOK (GUARANTEED WORKING VERSION)
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
    if (!debateId) {
      console.log('❌ No debateId, skipping socket setup');
      return;
    }

    console.log('🔌 Setting up assistant socket for debate:', debateId);

    // Create socket
    const assistantSocket = io(`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/assistant`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    // 🔥 CRITICAL: Set up ALL listeners BEFORE connecting
    // This ensures they exist when the socket connects

    // Draft insights listener
    assistantSocket.on('draft-insights', (data) => {
      console.log('📥📥📥 RECEIVED INSIGHTS!');
      console.log('📥 Data:', data);
      console.log('📥 Warnings:', data?.warnings?.length);
      console.log('📥 Suggestions:', data?.suggestions?.length);
      console.log('📥 Opportunities:', data?.opportunities?.length);
      
      setInsights(data);
      setIsAnalyzing(false);
    });

    // Connection events
    assistantSocket.on('connect', () => {
      console.log('✅ Assistant connected:', assistantSocket.id);
      setIsConnected(true);
      
      // Join room after connection
      console.log('🔌 Joining debate assistant room');
      assistantSocket.emit('join-debate-assistant', { debateId });
    });

    assistantSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      setIsConnected(false);
    });

    assistantSocket.on('disconnect', (reason) => {
      console.log('❌ Disconnected:', reason);
      setIsConnected(false);
    });

    assistantSocket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
    });

    // Error handler
    assistantSocket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    // Set socket in state
    setSocket(assistantSocket);

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up socket');
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
  const analyzeDraft = useCallback((currentDraft, userId) => {
    if (!socket) {
      console.log('⏭️ No socket available');
      return;
    }

    if (!isConnected) {
      console.log('⏭️ Socket not connected');
      return;
    }

    if (!currentDraft || currentDraft.length < 20) {
      console.log('⏭️ Draft too short:', currentDraft?.length);
      return;
    }

    // Clear existing timer
    if (throttleTimer.current) {
      clearTimeout(throttleTimer.current);
    }

    // Set new timer
    throttleTimer.current = setTimeout(() => {
      console.log('=== EMITTING ANALYZE-DRAFT ===');
      console.log('Socket ID:', socket.id);
      console.log('Connected:', socket.connected);
      console.log('Debate ID:', debateId);
      console.log('User ID:', userId);
      console.log('Draft:', currentDraft.substring(0, 50));
      console.log('Side:', side);
      
      setIsAnalyzing(true);
      
      socket.emit('analyze-draft', {
        debateId,
        userId,
        currentDraft,
        side
      });

      console.log('✅ Event emitted successfully');
      console.log('============================');
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