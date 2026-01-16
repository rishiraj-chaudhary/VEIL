import Redis from 'ioredis';

class AICacheService {
  constructor() {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 50, 2000);
        },
      });

      this.redis.on('connect', () => {
        console.log('✅ AI Cache (Redis) connected');
      });

      this.redis.on('error', (err) => {
        console.error('❌ AI Cache error:', err.message);
      });

      this.enabled = true;
    } catch (error) {
      console.warn('⚠️  Redis not available, AI caching disabled');
      this.enabled = false;
    }
  }

  /**
   * Generate cache key
   */
  generateKey(userId, prompt, context = {}) {
    const contextHash = JSON.stringify(context);
    return `ai:${userId}:${Buffer.from(prompt + contextHash).toString('base64').slice(0, 32)}`;
  }

  /**
   * Get cached response
   */
  async get(userId, prompt, context) {
    if (!this.enabled) return null;

    try {
      const key = this.generateKey(userId, prompt, context);
      const cached = await this.redis.get(key);
      
      if (cached) {
        console.log('💾 AI Cache HIT');
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached response
   */
  async set(userId, prompt, context, response) {
    if (!this.enabled) return;

    try {
      const key = this.generateKey(userId, prompt, context);
      const ttl = parseInt(process.env.AI_CACHE_TTL) || 300; // 5 minutes default
      
      await this.redis.setex(key, ttl, JSON.stringify(response));
      console.log('💾 AI Cache SET');
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Check rate limit
   */
  async checkRateLimit(userId) {
    if (!this.enabled) return true; // Allow if cache disabled

    try {
      const key = `ratelimit:ai:${userId}`;
      const count = await this.redis.incr(key);
      
      if (count === 1) {
        // First request in this hour
        await this.redis.expire(key, 3600); // 1 hour
      }

      const limit = parseInt(process.env.AI_RATE_LIMIT_PER_HOUR) || 10;
      
      if (count > limit) {
        console.log(`🚫 Rate limit exceeded for user ${userId}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Rate limit check error:', error);
      return true; // Allow on error
    }
  }

  /**
   * Get remaining requests
   */
  async getRemainingRequests(userId) {
    if (!this.enabled) return 999;

    try {
      const key = `ratelimit:ai:${userId}`;
      const count = await this.redis.get(key);
      const limit = parseInt(process.env.AI_RATE_LIMIT_PER_HOUR) || 10;
      
      return Math.max(0, limit - (parseInt(count) || 0));
    } catch (error) {
      return 999;
    }
  }
}

const aiCacheService = new AICacheService();

export default aiCacheService;