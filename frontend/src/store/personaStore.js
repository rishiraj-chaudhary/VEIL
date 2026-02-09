import { create } from 'zustand';
import personaService from '../services/personaService';

const usePersonaStore = create((set, get) => ({
  // State
  latestSnapshot: null,
  snapshots: [],
  timeline: [],
  significantDrifts: [],
  evolutionStats: null,
  comparison: null,
  loading: false,
  error: null,

  // Actions

  // Fetch latest snapshot
  fetchLatestSnapshot: async () => {
    set({ loading: true, error: null });
    try {
      const data = await personaService.getLatestSnapshot();
      set({ 
        latestSnapshot: data.snapshot,
        loading: false 
      });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch latest snapshot',
        loading: false 
      });
    }
  },

  // Fetch all snapshots
  fetchSnapshots: async (limit = 20) => {
    set({ loading: true, error: null });
    try {
      const data = await personaService.getSnapshots(limit);
      set({ 
        snapshots: data.snapshots,
        loading: false 
      });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch snapshots',
        loading: false 
      });
    }
  },

  // Fetch drift timeline
  fetchTimeline: async (limit = 10) => {
    set({ loading: true, error: null });
    try {
      const data = await personaService.getDriftTimeline(limit);
      set({ 
        timeline: data.timeline,
        loading: false 
      });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch timeline',
        loading: false 
      });
    }
  },

  // Fetch significant drifts
  fetchSignificantDrifts: async (threshold = 50) => {
    set({ loading: true, error: null });
    try {
      const data = await personaService.getSignificantDrifts(threshold);
      set({ 
        significantDrifts: data.drifts,
        loading: false 
      });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch significant drifts',
        loading: false 
      });
    }
  },

  // Fetch evolution stats
  fetchEvolutionStats: async () => {
    set({ loading: true, error: null });
    try {
      const data = await personaService.getEvolutionStats();
      set({ 
        evolutionStats: data.evolution,
        loading: false 
      });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch evolution stats',
        loading: false 
      });
    }
  },

  // Compare snapshots
  compareSnapshots: async (id1, id2) => {
    set({ loading: true, error: null });
    try {
      const data = await personaService.compareSnapshots(id1, id2);
      set({ 
        comparison: data.comparison,
        loading: false 
      });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to compare snapshots',
        loading: false 
      });
    }
  },

  // Create new snapshot
  createSnapshot: async (periodDays = 30) => {
    set({ loading: true, error: null });
    try {
      const data = await personaService.createSnapshot(periodDays);
      
      // Refresh latest snapshot
      await get().fetchLatestSnapshot();
      
      set({ loading: false });
      return data;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to create snapshot',
        loading: false 
      });
      throw error;
    }
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Reset store
  reset: () => set({
    latestSnapshot: null,
    snapshots: [],
    timeline: [],
    significantDrifts: [],
    evolutionStats: null,
    comparison: null,
    loading: false,
    error: null
  })
}));

export default usePersonaStore;