import api from './api';

class DebateService {
  /* =====================================================
     AI USAGE TRACKING METHODS
  ===================================================== */
  
  /**
   * Get user's AI usage stats
   */
  async getAIUsageStats(startDate = null, endDate = null) {
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await api.get('/ai-usage/my-stats', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching AI usage stats:', error);
      throw error;
    }
  }

  /**
   * Check user's budget status
   */
  async checkAIBudget() {
    try {
      const response = await api.get('/ai-usage/check-budget');
      return response.data;
    } catch (error) {
      console.error('Error checking AI budget:', error);
      throw error;
    }
  }

  /**
   * Get daily AI usage
   */
  async getDailyAIUsage(days = 30) {
    try {
      const response = await api.get('/ai-usage/daily', {
        params: { days }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching daily AI usage:', error);
      throw error;
    }
  }

  /**
   * Get AI operation breakdown
   */
  async getAIOperationBreakdown(startDate = null, endDate = null) {
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await api.get('/ai-usage/operations', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching AI operation breakdown:', error);
      throw error;
    }
  }

  /* =====================================================
     DEBATE METHODS
  ===================================================== */
  
  /**
   * Get all debates
   */
  async getDebates(filters = {}) {
    try {
      const response = await api.get('/debates', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching debates:', error);
      throw error;
    }
  }

  /**
   * Get single debate by ID
   */
  async getDebate(debateId) {
    try {
      const response = await api.get(`/debates/${debateId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching debate:', error);
      throw error;
    }
  }

  /**
   * Create a new debate
   */
  async createDebate(debateData) {
    try {
      const response = await api.post('/debates', debateData);
      return response.data;
    } catch (error) {
      console.error('Error creating debate:', error);
      throw error;
    }
  }

  /**
   * Join a debate
   */
  async joinDebate(debateId, side) {
    try {
      const response = await api.post(`/debates/${debateId}/join`, { side });
      return response.data;
    } catch (error) {
      console.error('Error joining debate:', error);
      throw error;
    }
  }

  /**
   * Mark ready
   */
  async markReady(debateId) {
    try {
      const response = await api.post(`/debates/${debateId}/ready`);
      return response.data;
    } catch (error) {
      console.error('Error marking ready:', error);
      throw error;
    }
  }

  /**
   * Leave debate
   */
  async leaveDebate(debateId) {
    try {
      const response = await api.post(`/debates/${debateId}/leave`);
      return response.data;
    } catch (error) {
      console.error('Error leaving debate:', error);
      throw error;
    }
  }

  /**
   * Cancel debate
   */
  async cancelDebate(debateId) {
    try {
      const response = await api.post(`/debates/${debateId}/cancel`);
      return response.data;
    } catch (error) {
      console.error('Error cancelling debate:', error);
      throw error;
    }
  }

  /* =====================================================
     TURN METHODS
  ===================================================== */

  /**
   * Get debate turns
   */
  async getDebateTurns(debateId) {
    try {
      const response = await api.get(`/debates/${debateId}/turns`);
      return response.data;
    } catch (error) {
      console.error('Error fetching turns:', error);
      throw error;
    }
  }

  /**
   * Submit a turn (AI tracked automatically)
   */
  async submitTurn(debateId, content) {
    try {
      const response = await api.post(`/debates/${debateId}/turns`, {
        content
      });
      
      console.log('✅ Turn submitted - AI usage tracked automatically');
      
      return response.data;
    } catch (error) {
      console.error('Error submitting turn:', error);
      throw error;
    }
  }

  /**
   * Check if user can submit turn
   */
  async canSubmitTurn(debateId) {
    try {
      const response = await api.get(`/debates/${debateId}/turns/check`);
      return response.data;
    } catch (error) {
      console.error('Error checking turn eligibility:', error);
      throw error;
    }
  }

  /* =====================================================
     STATISTICS & SCORING
  ===================================================== */

  /**
   * Get debate statistics
   */
  async getDebateStats(debateId) {
    try {
      const response = await api.get(`/debates/${debateId}/stats`);
      return response.data;
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  }

  /**
   * Get debate score
   */
  async getDebateScore(debateId) {
    try {
      const response = await api.get(`/debates/${debateId}/score`);
      return response.data;
    } catch (error) {
      console.error('Error fetching score:', error);
      throw error;
    }
  }
}

const debateService = new DebateService();
export default debateService;