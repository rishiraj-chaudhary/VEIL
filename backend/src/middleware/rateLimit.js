import aiCacheService from '../services/aiCacheService.js';

/**
 * Fixed-window rate limiter.
 *
 * Uses Redis when it is reachable so the window is shared across instances, and
 * falls back to a per-process counter otherwise. The fallback is deliberate:
 * a limiter that disables itself when its backing store is down provides no
 * protection at exactly the moment the system is already under stress.
 */

const localWindows = new Map();

const localHit = (key, windowMs) => {
  const now = Date.now();
  const entry = localWindows.get(key);

  if (!entry || now >= entry.resetAt) {
    const fresh = { count: 1, resetAt: now + windowMs };
    localWindows.set(key, fresh);

    if (localWindows.size > 50_000) {
      for (const [k, v] of localWindows) {
        if (now >= v.resetAt) localWindows.delete(k);
      }
    }
    return fresh;
  }

  entry.count += 1;
  return entry;
};

const redisHit = async (key, windowSeconds) => {
  const [[, count], , [, ttl]] = await aiCacheService.redis
    .multi()
    .incr(key)
    .expire(key, windowSeconds, 'NX')
    .ttl(key)
    .exec();

  return {
    count,
    resetAt: Date.now() + (ttl > 0 ? ttl : windowSeconds) * 1000,
  };
};

const defaultKey = req => req.user?._id?.toString() || req.ip;

export const rateLimit = ({
  windowMs = 60_000,
  max = 100,
  keyPrefix = 'rl',
  message = 'Too many requests, please slow down.',
  keyGenerator = defaultKey,
} = {}) => {
  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (req, res, next) => {
    const key = `${keyPrefix}:${keyGenerator(req)}`;

    let state;
    try {
      state = aiCacheService.enabled
        ? await redisHit(key, windowSeconds)
        : localHit(key, windowMs);
    } catch (error) {
      state = localHit(key, windowMs);
    }

    const remaining = Math.max(0, max - state.count);
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(Math.ceil(state.resetAt / 1000)));

    if (state.count > max) {
      const retryAfter = Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, message, retryAfter });
    }

    next();
  };
};

/** Broad ceiling for the whole API — catches runaway clients and scrapers. */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_PER_MINUTE, 10) || 120,
  keyPrefix: 'rl:global',
});

/** LLM-backed routes cost real money per call, so they get a tighter budget. */
export const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE, 10) || 20,
  keyPrefix: 'rl:ai',
  message: 'AI request limit reached. Please wait a moment before trying again.',
});

/** Credential endpoints are the ones worth brute-forcing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: parseInt(process.env.AUTH_RATE_LIMIT, 10) || 20,
  keyPrefix: 'rl:auth',
  keyGenerator: req => req.ip,
  message: 'Too many authentication attempts. Please try again later.',
});

export default rateLimit;
