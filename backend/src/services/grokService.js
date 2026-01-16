import axios from 'axios';

class GrokService {
  constructor() {
    this.initialized = false;
    this.apiKey = null;
    this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.fastModel = 'llama-3.1-8b-instant';
    this.smartModel = 'llama-3.3-70b-versatile';
    this.enabled = false;
  }

  /**
   * Initialize service (called on first use)
   */
  initialize() {
    if (this.initialized) return;

    const apiKey = process.env.GROK_API_KEY;
    
    if (!apiKey || apiKey === 'your-grok-api-key-here') {
      console.warn('⚠️  GROK_API_KEY not set! AI features will not work.');
      this.enabled = false;
      this.initialized = true;
      return;
    }

    this.apiKey = apiKey;
    this.enabled = true;
    this.initialized = true;

    console.log('✨ Grok AI Service initialized');
    console.log(`   Fast Model: ${this.fastModel}`);
    console.log(`   Smart Model: ${this.smartModel}`);
  }

  /**
   * Generate response using fast model
   */
  async generateFast(prompt, context = {}) {
    this.initialize(); // Initialize on first use
    return this.generate(prompt, context, this.fastModel, 500);
  }

  /**
   * Generate response using smart model
   */
  async generateSmart(prompt, context = {}) {
    this.initialize(); // Initialize on first use
    return this.generate(prompt, context, this.smartModel, 800);
  }

  /**
   * Core generation method
   */
  async generate(prompt, context = {}, model, maxTokens) {
    if (!this.enabled) {
      throw new Error('Grok API not configured. Please set GROK_API_KEY in .env');
    }

    try {
      const messages = this.buildMessages(prompt, context);
      
      console.log(`🤖 Calling Grok API (${model})...`);
      
      const response = await axios.post(
        this.apiUrl,
        {
          model: model,
          messages: messages,
          temperature: context.temperature || 0.7,
          max_tokens: maxTokens,
          top_p: 0.9,
          stream: false,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      console.log(`✅ Grok response generated (${response.data.usage.total_tokens} tokens)`);
      
      return aiResponse;
    } catch (error) {
      console.error('❌ Grok API error:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        throw new Error('Invalid Grok API key');
      } else if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout. Please try again.');
      }
      
      throw new Error('AI generation failed: ' + (error.response?.data?.error?.message || error.message));
    }
  }

  /**
   * Build messages array for chat completion
   */
  /**
 * Build messages array for chat completion
 */
buildMessages(userPrompt, context) {
    const messages = [];
  
    // System message with context
    let systemContent = context.systemRole || 'You are ORACLE, an AI assistant on the VEIL social platform that helps users craft better arguments and responses.';
    
    // Add thread context if available
    if (context.threadContext && context.threadContext.length > 0) {
      systemContent += '\n\n━━━ CURRENT THREAD (read this carefully) ━━━\n';
      
      if (context.threadInfo) {
        systemContent += `Thread: "${context.threadInfo.postTitle}"\n`;
        systemContent += `Community: c/${context.threadInfo.communityName}\n`;
        systemContent += `Comments so far: ${context.threadInfo.totalComments}\n\n`;
      }
  
      systemContent += 'CONVERSATION FLOW:\n';
      context.threadContext.forEach((item, idx) => {
        if (item.isPost) {
          systemContent += `\n${item.author} (OP): ${item.content}\n`;
        } else if (item.isReply && item.replyingTo) {
          systemContent += `├─ ${item.author} → @${item.replyingTo}: ${item.content}\n`;
        } else {
          systemContent += `${item.author}: ${item.content}\n`;
        }
      });
      
      systemContent += '\n━━━ END OF THREAD ━━━\n';
    }
  
    // Add user writing style if available
    if (context.userStyle) {
      systemContent += `\n📝 USER'S WRITING STYLE (try to match this):\n${context.userStyle.substring(0, 400)}...\n`;
    }
  
    // Add instructions
    systemContent += '\n📋 YOUR TASK:\n';
    systemContent += 'Generate a response that:\n';
    systemContent += '1. Fits naturally into THIS specific conversation\n';
    systemContent += '2. References the actual context above (not generic)\n';
    systemContent += '3. Matches the user\'s writing style\n';
    
    if (context.tone) {
      systemContent += `4. Uses a ${context.tone} tone\n`;
    }
  
    if (context.brief) {
      systemContent += '5. Is VERY brief (2-3 sentences max)\n';
    } else {
      systemContent += '5. Is thoughtful and substantive\n';
    }
  
    messages.push({
      role: 'system',
      content: systemContent.trim(),
    });
  
    // User message
    messages.push({
      role: 'user',
      content: userPrompt,
    });
  
    return messages;
  }
  /**
   * Check if service is ready
   */
  isReady() {
    this.initialize(); // Initialize on check
    return this.enabled;
  }

  /**
   * Get available models
   */
  getModels() {
    return {
      fast: this.fastModel,
      smart: this.smartModel,
    };
  }
}

// Singleton instance
const grokService = new GrokService();

export default grokService;