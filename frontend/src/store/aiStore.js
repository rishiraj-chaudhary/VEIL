import { create } from 'zustand';
import aiService from '../services/aiService';

const useAIStore = create((set, get) => ({
  // State
  enabled: false,
  loading: false,
  error: null,
  generatedText: null,
  remainingRequests: 10,

  // Check AI availability
  checkStatus: async () => {
    try {
      const result = await aiService.getStatus();
      set({
        enabled: result.success && result.data.enabled,
        remainingRequests: result.data.rateLimit?.remaining || 10,
      });
    } catch (error) {
      set({ enabled: false });
    }
  },

  // Generate AI reply
  generateReply: async (prompt, options = {}) => {
    console.log('📤 AI Request:', { prompt, options });
    set({ loading: true, error: null, generatedText: null });

    try {
      const result = await aiService.generateReply(prompt, options);
      console.log('📥 Raw API Response:', result);
      if (result.success) {
        const responseText = result.data.response;
      
      console.log('✅ Response text:', responseText); 
      console.log('✅ Text length:', responseText?.length);
        set({
          generatedText: result.data.response,
          remainingRequests: result.data.remaining,
          loading: false,
        });
        return result.data.response;
      } else {
        throw new Error(result.message || 'AI generation failed');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to generate AI response';
      set({
        error: errorMessage,
        loading: false,
      });
      throw new Error(errorMessage);
    }
  },

  // Clear generated text
  clearGenerated: () => {
    set({ generatedText: null, error: null });
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));

export default useAIStore;