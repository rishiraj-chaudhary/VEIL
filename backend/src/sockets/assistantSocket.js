import debateAssistantService from '../services/debateAssistantService.js';

/**
 * Live Debate Assistant Socket Handler (Phase 2)
 * 
 * Provides real-time suggestions while users type
 */
export const initLiveAssistant = (io) => {
  const assistantNamespace = io.of('/assistant');

  assistantNamespace.on('connection', (socket) => {
    console.log('🤖 Assistant connected:', socket.id);

    // Join debate assistant room
    socket.on('join-debate-assistant', ({ debateId }) => {
      socket.join(`debate-assistant-${debateId}`);
      console.log(`🤖 Socket ${socket.id} joined assistant for debate ${debateId}`);
    });

    // Leave debate assistant room
    socket.on('leave-debate-assistant', ({ debateId }) => {
      socket.leave(`debate-assistant-${debateId}`);
      console.log(`🤖 Socket ${socket.id} left assistant for debate ${debateId}`);
    });

    // Analyze draft in real-time
    socket.on('analyze-draft', async (data) => {
      console.log('🔥 RECEIVED analyze-draft event:', data);
      
      try {
        const { debateId, userId, currentDraft, side } = data;
        
        // Validate input
        if (!currentDraft || currentDraft.length < 20) {
          console.log('⚠️ Draft too short, skipping analysis');
          return;
        }

        console.log('📊 Calling debateAssistantService.getLiveDebateInsights...');
        
        // Call the service
        const insights = await debateAssistantService.getLiveDebateInsights({
          debateId,
          userId,
          currentDraft,
          side
        });

        console.log('✅ Generated insights:', JSON.stringify(insights, null, 2));

        // Send back to client
        socket.emit('draft-insights', insights);
        
        console.log('📤 Sent insights back to client');

      } catch (error) {
        console.error('❌ Live assistant error:', error);
        
        // Send empty insights on error
        socket.emit('draft-insights', {
          warnings: [],
          opportunities: [],
          suggestions: [],
          stats: {
            wordCount: 0,
            evidenceCount: 0
          }
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('🤖 Assistant disconnected:', socket.id);
    });
  });
};