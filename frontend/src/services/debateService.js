import api from './api';

const debateService = {
  // ==================== DEBATES ====================
  
  // Get all debates
  getDebates: async (params = {}) => {
    const response = await api.get('/debates', { params });
    return response.data;
  },

  // Get single debate
  getDebate: async (id) => {
    const response = await api.get(`/debates/${id}`);
    return response.data;
  },

  // Create debate
  createDebate: async (data) => {
    const response = await api.post('/debates', data);
    return response.data;
  },

  // Join debate
  joinDebate: async (id, side) => {
    const response = await api.post(`/debates/${id}/join`, { side });
    return response.data;
  },

  // Mark ready
  markReady: async (id) => {
    const response = await api.post(`/debates/${id}/ready`);
    return response.data;
  },

  // Leave debate
  leaveDebate: async (id) => {
    const response = await api.post(`/debates/${id}/leave`);
    return response.data;
  },

  // Cancel debate
  cancelDebate: async (id) => {
    const response = await api.post(`/debates/${id}/cancel`);
    return response.data;
  },

  // Get debate stats
  getDebateStats: async (id) => {
    const response = await api.get(`/debates/${id}/stats`);
    return response.data;
  },

  // Get debate score
  getDebateScore: async (id) => {
    const response = await api.get(`/debates/${id}/score`);
    return response.data;
  },

  // ==================== TURNS ====================

  // Get debate turns
  getDebateTurns: async (debateId, params = {}) => {
    const response = await api.get(`/debates/${debateId}/turns`, { params });
    return response.data;
  },

  // Get turns by round
  getTurnsByRound: async (debateId) => {
    const response = await api.get(`/debates/${debateId}/turns/rounds`);
    return response.data;
  },

  // Submit turn
  submitTurn: async (debateId, content) => {
    const response = await api.post(`/debates/${debateId}/turns`, { content });
    return response.data;
  },

  // Check if can submit
  canSubmitTurn: async (debateId) => {
    const response = await api.get(`/debates/${debateId}/turns/check`);
    return response.data;
  },

  // ==================== VOTING ====================

  // Vote on round
  voteOnRound: async (debateId, round, vote, confidence) => {
    const response = await api.post(`/debates/${debateId}/votes/${round}`, {
      vote,
      confidence
    });
    return response.data;
  },

  // Get debate votes
  getDebateVotes: async (debateId) => {
    const response = await api.get(`/debates/${debateId}/votes`);
    return response.data;
  },

  // Get round votes
  getRoundVotes: async (debateId, round) => {
    const response = await api.get(`/debates/${debateId}/votes/${round}`);
    return response.data;
  },

  // ==================== REACTIONS ====================

  // React to turn
  reactToTurn: async (turnId, reactionType, comment) => {
    const response = await api.post(`/debates/turns/${turnId}/reactions`, {
      reactionType,
      comment
    });
    return response.data;
  },

  // Get turn reactions
  getTurnReactions: async (turnId) => {
    const response = await api.get(`/debates/turns/${turnId}/reactions`);
    return response.data;
  },

  // Get debate reactions
  getDebateReactions: async (debateId) => {
    const response = await api.get(`/debates/${debateId}/reactions`);
    return response.data;
  },
};

export default debateService;