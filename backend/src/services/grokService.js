import axios from 'axios';
import AICostService from './aiCostService.js';

// A live request must never block on a provider cooldown for longer than this.
// Groq's Retry-After can be twenty minutes on a daily cap; honouring it inside a
// request handler hangs the user's turn submission for the full period.
const MAX_RETRY_WAIT_MS = 5000;

// Groq's free tier caps the 70B model at 100k tokens/day. Reserve a margin so
// the platform degrades gracefully instead of erroring on the final requests.
const SMART_DAILY_TOKEN_BUDGET = parseInt(process.env.SMART_DAILY_TOKEN_BUDGET, 10) || 85000;

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
    this.initialize();
    return this.generate(prompt, context, this.fastModel, 500);
  }

  /**
   * Generate response using smart model
   */
  /**
   * Today's smart-model token spend, cached briefly.
   *
   * Groq's free tier allows 100k tokens/day on the 70B model. Hitting that wall
   * produces a hard 429 with a cooldown measured in tens of minutes, so the
   * budget has to be checked *before* the call, not discovered by failing it.
   */
  async _smartTokensToday() {
    const now = Date.now();
    if (this._budgetCache && now - this._budgetCache.at < 60_000) {
      return this._budgetCache.tokens;
    }

    try {
      const AIUsage = (await import('../models/AIUsage.js')).default;
      const since = new Date();
      since.setHours(0, 0, 0, 0);

      const [row] = await AIUsage.aggregate([
        { $match: { createdAt: { $gte: since }, model: this.smartModel } },
        { $group: { _id: null, tokens: { $sum: '$totalTokens' } } },
      ]);

      const tokens = row?.tokens ?? 0;
      this._budgetCache = { at: now, tokens };
      return tokens;
    } catch {
      // Never let a budget lookup failure block generation.
      return 0;
    }
  }

  async generateSmart(prompt, context = {}) {
    this.initialize();

    // Degrade to the fast model as the daily budget runs out, rather than
    // letting the last few requests fail outright. Quality drops; availability
    // does not.
    const used = await this._smartTokensToday();
    if (used >= SMART_DAILY_TOKEN_BUDGET) {
      if (!this._budgetWarned) {
        console.warn(`⏬ Smart-model daily budget reached (${used}/${SMART_DAILY_TOKEN_BUDGET}) — using ${this.fastModel} for the rest of the day`);
        this._budgetWarned = true;
      }
      return this.generate(prompt, { ...context, _downgraded: true }, this.fastModel, 500);
    }

    return this.generate(prompt, context, this.smartModel, 800);
  }

  /**
   * Core generation method with AI cost tracking
   */
  async generate(prompt, context = {}, model, maxTokens) {
    if (!this.enabled) {
      throw new Error('Grok API not configured. Please set GROK_API_KEY in .env');
    }

    const startTime = Date.now();
    let usage = null;

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
      const responseTime = Date.now() - startTime;
      
      // Extract token usage from response
      usage = response.data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      };
      
      console.log(`✅ Grok response generated (${usage.total_tokens} tokens)`);
      
      // Tracked unconditionally. Gating on context.userId meant 36 of 37 call
      // sites — every graph, the AI opponent, safety checks — spent money
      // without appearing in usage at all.
      {
        await AICostService.trackUsage({
          userId: context.userId || null,
          operation: context.operation || 'other',
          model: model,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          responseTime,
          cached: false,
          debateId: context.debateId || null,
          turnId: context.turnId || null,
          error: null
        });
      }
      
      return aiResponse;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      console.error('❌ Grok API error:', error.response?.data || error.message);
      
      // Failed calls are still billed for the prompt, and a spike in failures
      // is exactly what an operator needs to see.
      {
        await AICostService.trackUsage({
          userId: context.userId || null,
          operation: context.operation || 'other',
          model: model,
          promptTokens: 0,
          completionTokens: 0,
          responseTime,
          cached: false,
          debateId: context.debateId || null,
          turnId: context.turnId || null,
          error: error.response?.data?.error?.message || error.message
        });
      }
      
      if (error.response?.status === 401) {
        throw new Error('Invalid Grok API key');
      } else if (error.response?.status === 429) {
        // Groq limits both tokens-per-minute and tokens-per-day. A per-minute
        // ceiling clears in seconds; a daily one does not clear at all today.
        // Retry-After is honoured only up to MAX_RETRY_WAIT_MS — beyond that,
        // waiting means blocking a live request for minutes, which is worse
        // than answering with the cheaper model.
        const retryAfterSec = Number(error.response.headers?.['retry-after']) || 0;
        const message = error.response?.data?.error?.message || '';
        const isDailyLimit = /per day|TPD|RPD/i.test(message);
        const attempt = (context._rateLimitAttempt || 0) + 1;

        const waitMs = retryAfterSec > 0 ? retryAfterSec * 1000 : 1000 * attempt;
        const canWait = !isDailyLimit && waitMs <= MAX_RETRY_WAIT_MS && attempt <= 2;

        if (canWait) {
          console.warn(`⏳ Rate limited on ${model}; retrying in ${waitMs}ms (attempt ${attempt}/2)`);
          await new Promise(r => setTimeout(r, waitMs));
          return this.generate(prompt, { ...context, _rateLimitAttempt: attempt }, model, maxTokens);
        }

        if (model !== this.fastModel) {
          const reason = isDailyLimit
            ? 'daily token budget exhausted'
            : `cooldown ${Math.round(waitMs / 1000)}s exceeds the ${MAX_RETRY_WAIT_MS / 1000}s wait cap`;
          console.warn(`⏬ ${reason} on ${model} — using ${this.fastModel} instead`);

          return this.generate(
            prompt,
            { ...context, _rateLimitAttempt: 0, _downgraded: true },
            this.fastModel,
            Math.min(maxTokens, 500),
          );
        }

        throw new Error(
          isDailyLimit
            ? 'Daily AI token budget exhausted. Analysis will resume tomorrow.'
            : 'Rate limit exceeded. Please try again shortly.',
        );
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout. Please try again.');
      }
      
      throw new Error('AI generation failed: ' + (error.response?.data?.error?.message || error.message));
    }
  }

  /**
   * ✅ NEW: Generate with automatic model selection based on budget
   */
  async generateWithBudget(prompt, context = {}) {
    this.initialize();
    
    // Get user tier (default to 'free' if not provided)
    const userTier = context.userTier || 'free';
    
    // Get recommended model based on budget
    const recommendation = await AICostService.getRecommendedModel(
      context.userId,
      userTier,
      context.preferredModel || this.smartModel
    );
    
    console.log(`💰 Budget check: ${recommendation.reason} → using ${recommendation.model}`);
    
    // Use recommended model
    const model = recommendation.model;
    const maxTokens = model === this.fastModel ? 500 : 800;
    
    // Add budget info to context for logging
    context.budgetReason = recommendation.reason;
    context.budgetInfo = recommendation.budget;
    
    return this.generate(prompt, context, model, maxTokens);
  }

  /**
   * ✅ NEW: Check if user can make AI request
   */
  async canUserMakeRequest(userId, userTier = 'free') {
    return await AICostService.canUserMakeRequest(userId, userTier);
  }

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
    this.initialize();
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