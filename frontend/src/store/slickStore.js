import { create } from 'zustand';
import slickService from '../services/slickService';

const useSlickStore = create((set, get) => ({
  // State
  receivedSlicks: [],
  sentSlicks: [],
  currency: {
    balance: 0,
    recentTransactions: [],
    earnings: {}
  },
  insights: null,
  loading: false,
  error: null,

  // Actions
  createSlick: async (slickData) => {
    set({ loading: true, error: null });
    try {
      const result = await slickService.createSlick(slickData);
      
      // Add to sent slicks locally
      const currentSent = get().sentSlicks;
      set({ 
        sentSlicks: [result.data.slick, ...currentSent],
        loading: false 
      });
      
      return { success: true, data: result.data };
    } catch (error) {
      set({ loading: false, error: error.message });
      return { success: false, error: error.message, suggestion: error.aiSuggestion };
    }
  },

  fetchReceivedSlicks: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const result = await slickService.getReceivedSlicks(params);
      set({ 
        receivedSlicks: result.data.slicks,
        loading: false 
      });
      return result;
    } catch (error) {
      set({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  },

  fetchSentSlicks: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const result = await slickService.getSentSlicks(params);
      set({ 
        sentSlicks: result.data.slicks,
        loading: false 
      });
      return result;
    } catch (error) {
      set({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  },

  reactToSlick: async (slickId, reaction) => {
    try {
      const result = await slickService.reactToSlick(slickId, reaction);
      
      // Update the slick locally
      const updateSlickReactions = (slicks) =>
        slicks.map(slick => 
          slick._id === slickId 
            ? { ...slick, reactions: result.data.reactions, credibilityScore: result.data.credibilityScore }
            : slick
        );

      set({
        receivedSlicks: updateSlickReactions(get().receivedSlicks),
        sentSlicks: updateSlickReactions(get().sentSlicks)
      });

      return { success: true, data: result.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  revealAuthor: async (slickId) => {
    set({ loading: true });
    try {
      const result = await slickService.revealAuthor(slickId);
      
      // Update the slick to show it's revealed
      const updateSlick = (slicks) =>
        slicks.map(slick => 
          slick._id === slickId 
            ? { 
                ...slick, 
                identityReveal: { 
                  ...slick.identityReveal, 
                  isRevealed: true 
                },
                revealedAuthor: result.data.author
              }
            : slick
        );

      set({
        receivedSlicks: updateSlick(get().receivedSlicks),
        loading: false
      });

      // Update currency
      await get().fetchCurrency();

      return { success: true, data: result.data };
    } catch (error) {
      set({ loading: false });
      return { success: false, error: error.message };
    }
  },

  fetchInsights: async (timeframe = '30d') => {
    set({ loading: true, error: null });
    try {
      const result = await slickService.getInsights(timeframe);
      set({ 
        insights: result.data.insights,
        loading: false 
      });
      return result;
    } catch (error) {
      set({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  },

  getSuggestions: async (targetUserId, context = '') => {
    try {
      const result = await slickService.getSuggestions(targetUserId, context);
      return { success: true, data: result.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  fetchCurrency: async () => {
    try {
      const result = await slickService.getCurrency();
      set({ currency: result.data });
      return { success: true, data: result.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  clearError: () => set({ error: null })
}));

export default useSlickStore;