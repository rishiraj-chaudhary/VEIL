import api from './api.js';

const slickService = {
  // Create a new slick
  createSlick: async (slickData) => {
    try {
      const response = await api.post('/slicks', slickData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Get received slicks
  getReceivedSlicks: async (params = {}) => {
    try {
      const response = await api.get('/slicks/received', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Get sent slicks
  getSentSlicks: async (params = {}) => {
    try {
      const response = await api.get('/slicks/sent', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // React to a slick
  reactToSlick: async (slickId, reaction) => {
    try {
      const response = await api.post(`/slicks/${slickId}/react`, { reaction });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Reveal slick author
  revealAuthor: async (slickId) => {
    try {
      const response = await api.post(`/slicks/${slickId}/reveal`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Get AI insights
  getInsights: async (timeframe = '30d') => {
    try {
      const response = await api.get('/slicks/insights', { 
        params: { timeframe } 
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Get AI suggestions
  getSuggestions: async (targetUserId, context = '') => {
    try {
      const response = await api.get(`/slicks/suggestions/${targetUserId}`, {
        params: { context }
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Get currency info
  getCurrency: async () => {
    try {
      const response = await api.get('/slicks/currency');
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }
};

export default slickService;