import api from './api';

class AIService {
  /**
   * Get AI service status
   */
  async getStatus() {
    try {
      const response = await api.get('/ai/status');
      console.log('📊 Status response:', response.data);
      return response.data;
    } catch (error) {
      console.error('AI status check failed:', error);
      return {
        success: false,
        data: { enabled: false }
      };
    }
  }

  /**
   * Generate AI reply with @oracle
   */
  async generateReply(prompt, options = {}) {
    try {
      console.log('🚀 Calling API with:', { prompt, options });
      
      const response = await api.post('/ai/oracle', {
        prompt,
        postId: options.postId,
        parentId: options.parentId,       
      replyingTo: options.replyingTo,
        options: {
          tone: options.tone || 'casual',
          brief: options.brief || false,
          smart: options.smart || false,
        }
      });

      console.log('📦 Full axios response:', response);
      console.log('📥 Response data:', response.data);
      
      return response.data;
    } catch (error) {
      console.error('❌ API call failed:', error);
      console.error('❌ Error response:', error.response);
      throw error;
    }
  }

  /**
   * Generate reply with thread context
   */
  async generateContextualReply(prompt, postId, options = {}) {
    return this.generateReply(prompt, {
      ...options,
      postId
    });
  }
}

const aiService = new AIService();

export default aiService;