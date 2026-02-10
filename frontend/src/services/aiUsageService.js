import api from './api';

class AIUsageService {
  async getMyStats(startDate = null, endDate = null) {
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

  async checkBudget() {
    try {
      const response = await api.get('/ai-usage/check-budget');
      return response.data;
    } catch (error) {
      console.error('Error checking budget:', error);
      throw error;
    }
  }

  async getDailyUsage(days = 30) {
    try {
      const response = await api.get('/ai-usage/daily', {
        params: { days }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching daily usage:', error);
      throw error;
    }
  }

  async getOperationBreakdown(startDate = null, endDate = null) {
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await api.get('/ai-usage/operations', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching operation breakdown:', error);
      throw error;
    }
  }
}

const aiUsageService = new AIUsageService();
export default aiUsageService;