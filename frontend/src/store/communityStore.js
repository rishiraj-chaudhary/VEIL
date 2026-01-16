import { create } from 'zustand';
import communityService from '../services/communityService';

const useCommunityStore = create((set, get) => ({
  communities: [],
  currentCommunity: null,
  loading: false,
  error: null,

  // Fetch all communities
  fetchCommunities: async () => {
    set({ loading: true, error: null });
    try {
      const data = await communityService.getAllCommunities();
      set({ communities: data.data.communities, loading: false });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch communities',
        loading: false 
      });
    }
  },

  // Fetch single community
  fetchCommunity: async (name) => {
    set({ loading: true, error: null });
    try {
      const data = await communityService.getCommunity(name);
      set({ currentCommunity: data.data.community, loading: false });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch community',
        loading: false 
      });
    }
  },

  // Create community
  createCommunity: async (communityData) => {
    set({ loading: true, error: null });
    try {
      const data = await communityService.createCommunity(communityData);
      set((state) => ({
        communities: [...state.communities, data.data.community],
        loading: false,
      }));
      return { success: true, community: data.data.community };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to create community';
      set({ error: errorMessage, loading: false });
      return { success: false, error: errorMessage };
    }
  },

  // Join community
  joinCommunity: async (name) => {
    try {
      await communityService.joinCommunity(name);
      // Refresh community data
      await get().fetchCommunity(name);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to join community' 
      };
    }
  },

  // Leave community
  leaveCommunity: async (name) => {
    try {
      await communityService.leaveCommunity(name);
      // Refresh community data
      await get().fetchCommunity(name);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to leave community' 
      };
    }
  },

  clearError: () => set({ error: null }),
}));

export default useCommunityStore;