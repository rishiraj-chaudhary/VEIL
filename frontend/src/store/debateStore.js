import { create } from 'zustand';
import debateService from '../services/debateService';

const useDebateStore = create((set, get) => ({
  // State
  debates: [],
  currentDebate: null,
  turns: [],
  viewerCount: 0,
  loading: false,
  error: null,

  // ==================== DEBATES ====================

  fetchDebates: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const result = await debateService.getDebates(params);
      set({
        debates: result.data.debates,
        loading: false
      });
      return result;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch debates',
        loading: false
      });
      return { success: false, error: error.message };
    }
  },

  fetchDebate: async (id) => {
    set({ loading: true, error: null });
    try {
      const result = await debateService.getDebate(id);
      set({
        currentDebate: result.data.debate,
        loading: false
      });
      return result;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch debate',
        loading: false
      });
      return { success: false, error: error.message };
    }
  },

  createDebate: async (data) => {
    set({ loading: true, error: null });
    try {
      const result = await debateService.createDebate(data);
      set((state) => ({
        debates: [result.data.debate, ...state.debates],
        loading: false
      }));
      return result;
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to create debate';
      set({ error: errorMessage, loading: false });
      return { success: false, error: errorMessage };
    }
  },

  joinDebate: async (id, side) => {
    set({ loading: true, error: null });
    try {
      const result = await debateService.joinDebate(id, side);
      set({
        currentDebate: result.data.debate,
        loading: false
      });
      return result;
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to join debate';
      set({ error: errorMessage, loading: false });
      return { success: false, error: errorMessage };
    }
  },

  markReady: async (id) => {
    set({ loading: true, error: null });
    try {
      const result = await debateService.markReady(id);
      set({
        currentDebate: result.data.debate,
        loading: false
      });
      return result;
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to mark ready';
      set({ error: errorMessage, loading: false });
      return { success: false, error: errorMessage };
    }
  },

  leaveDebate: async (id) => {
    try {
      const result = await debateService.leaveDebate(id);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  cancelDebate: async (id) => {
    try {
      const result = await debateService.cancelDebate(id);
      set({ currentDebate: null });
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // ==================== TURNS ====================

  fetchTurns: async (debateId, params = {}) => {
    set({ loading: true, error: null });
    try {
      const result = await debateService.getDebateTurns(debateId, params);
      set({
        turns: result.data.turns,
        loading: false
      });
      return result;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch turns',
        loading: false
      });
      return { success: false, error: error.message };
    }
  },

  submitTurn: async (debateId, content) => {
    set({ loading: true, error: null });
    try {
      const result = await debateService.submitTurn(debateId, content);
      
      // Add turn to list
      set((state) => ({
        turns: [...state.turns, result.data.turn],
        currentDebate: result.data.debate,
        loading: false
      }));
      
      return result;
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to submit turn';
      set({ error: errorMessage, loading: false });
      return { success: false, error: errorMessage };
    }
  },

  canSubmitTurn: async (debateId) => {
    try {
      const result = await debateService.canSubmitTurn(debateId);
      return result.data;
    } catch (error) {
      return { canSubmit: false, reason: error.message };
    }
  },

  // ==================== VOTING ====================

  voteOnRound: async (debateId, round, vote, confidence) => {
    try {
      const result = await debateService.voteOnRound(debateId, round, vote, confidence);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // ==================== REACTIONS ====================

  reactToTurn: async (turnId, reactionType, comment) => {
    try {
      const result = await debateService.reactToTurn(turnId, reactionType, comment);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // ==================== SOCKET UPDATES ====================

  setViewerCount: (count) => {
    set({ viewerCount: count });
  },

  updateDebateState: (state) => {
    set((current) => ({
      currentDebate: {
        ...current.currentDebate,
        ...state
      }
    }));
  },

  addTurn: (turn) => {
    set((state) => {
      // Check if turn already exists
      const exists = state.turns.some(t => t._id === turn._id);
      if (exists) {
        // Update existing turn
        return {
          turns: state.turns.map(t => 
            t._id === turn._id ? turn : t
          )
        };
      }
      // Add new turn
      return {
        turns: [...state.turns, turn]
      };
    });
  },

  // ==================== UTILITIES ====================

  clearError: () => set({ error: null }),

  reset: () => set({
    debates: [],
    currentDebate: null,
    turns: [],
    viewerCount: 0,
    loading: false,
    error: null
  })
}));

export default useDebateStore;