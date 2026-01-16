import api from './api';

const communityService = {
  // Get all communities
  getAllCommunities: async (params = {}) => {
    const response = await api.get('/communities', { params });
    return response.data;
  },

  // Get single community
  getCommunity: async (name) => {
    const response = await api.get(`/communities/${name}`);
    return response.data;
  },

  // Create community
  createCommunity: async (data) => {
    const response = await api.post('/communities', data);
    return response.data;
  },

  // Join community
  joinCommunity: async (name) => {
    const response = await api.post(`/communities/${name}/join`);
    return response.data;
  },

  // Leave community
  leaveCommunity: async (name) => {
    const response = await api.post(`/communities/${name}/leave`);
    return response.data;
  },
};

export default communityService;