import api from './api';

const personaService = {
  // Create a new snapshot
  createSnapshot: async (periodDays = 30) => {
    const response = await api.post('/persona/snapshot', { periodDays });
    return response.data;
  },

  // Get latest snapshot
  getLatestSnapshot: async () => {
    const response = await api.get('/persona/snapshot/latest');
    return response.data;
  },

  // Get all snapshots
  getSnapshots: async (limit = 20) => {
    const response = await api.get('/persona/snapshots', {
      params: { limit }
    });
    return response.data;
  },

  // Get specific snapshot
  getSnapshot: async (id) => {
    const response = await api.get(`/persona/snapshot/${id}`);
    return response.data;
  },

  // Get drift timeline
  getDriftTimeline: async (limit = 10) => {
    const response = await api.get('/persona/drift/timeline', {
      params: { limit }
    });
    return response.data;
  },

  // Get significant drift events
  getSignificantDrifts: async (threshold = 50) => {
    const response = await api.get('/persona/drift/significant', {
      params: { threshold }
    });
    return response.data;
  },

  // Compare two snapshots
  compareSnapshots: async (id1, id2) => {
    const response = await api.get(`/persona/compare/${id1}/${id2}`);
    return response.data;
  },

  // Get evolution stats
  getEvolutionStats: async () => {
    const response = await api.get('/persona/evolution');
    return response.data;
  },

  // Delete snapshot
  deleteSnapshot: async (id) => {
    const response = await api.delete(`/persona/snapshot/${id}`);
    return response.data;
  }
};

export default personaService;