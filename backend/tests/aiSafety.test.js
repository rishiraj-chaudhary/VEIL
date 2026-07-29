/**
 * Guards on the AI layers.
 *
 * Each of these encodes a failure that already happened during development:
 * cache keys that collided and served one user's answer to another, a fallacy
 * judge that invented supporting quotes, and an embedding cache that re-fetched
 * duplicates inside a single batch.
 */

const aiCacheService = (await import('../src/services/aiCacheService.js')).default;
const contentSafetyService = (await import('../src/services/contentSafetyService.js')).default;
const fallacyGraph = (await import('../src/services/graph/fallacyGraph.js')).default;
const CachedEmbeddings = (await import('../src/services/cachedEmbeddings.js')).default;

afterAll(async () => {
  // ioredis keeps a reconnect timer alive and would hold the test process open.
  if (aiCacheService.redis) aiCacheService.redis.disconnect();
});

describe('AI cache keys', () => {
  test('different prompts never share a key', () => {
    const a = aiCacheService.generateKey('u1', 'What is the capital of France?', {});
    const b = aiCacheService.generateKey('u1', 'What is the capital of Germany?', {});

    expect(a).not.toBe(b);
  });

  test('long prompts sharing a prefix stay distinct', () => {
    // The previous key truncated a base64 encoding to 32 characters, so any two
    // prompts with a common opening collided.
    const shared = 'Please analyse the following debate turn in detail. '.repeat(4);
    const a = aiCacheService.generateKey('u1', `${shared} FIRST`, {});
    const b = aiCacheService.generateKey('u1', `${shared} SECOND`, {});

    expect(a).not.toBe(b);
  });

  test('context is part of the key', () => {
    const a = aiCacheService.generateKey('u1', 'same prompt', { round: 1 });
    const b = aiCacheService.generateKey('u1', 'same prompt', { round: 2 });

    expect(a).not.toBe(b);
  });

  test('users never share a cache entry', () => {
    const a = aiCacheService.generateKey('userA', 'prompt', {});
    const b = aiCacheService.generateKey('userB', 'prompt', {});

    expect(a).not.toBe(b);
  });
});

describe('AI rate limiting without Redis', () => {
  test('a ceiling still applies when the cache is down', async () => {
    expect(aiCacheService.enabled).toBe(false);

    const user = `user-${Date.now()}`;
    const limit = aiCacheService.hourlyLimit;
    let allowed = 0;

    for (let i = 0; i < limit + 5; i++) {
      if (await aiCacheService.checkRateLimit(user)) allowed += 1;
    }

    expect(allowed).toBe(limit);
  });
});

describe('content safety heuristic', () => {
  test('flags an unambiguous insult', () => {
    const { score } = contentSafetyService._viaHeuristic('You are an idiot and your argument is garbage.');
    expect(score).toBeGreaterThan(0);
  });

  test('leaves civil disagreement alone', () => {
    const { score } = contentSafetyService._viaHeuristic('I disagree; the evidence does not support that.');
    expect(score).toBe(0);
  });

  test('empty input is not toxic', async () => {
    const result = await contentSafetyService.analyse('');
    expect(result.isToxic).toBe(false);
  });
});

describe('fallacy grounding', () => {
  const content = 'Either we ban this outright or society collapses. There is no middle ground.';

  test('accepts a verbatim quote from the argument', () => {
    expect(fallacyGraph._isGrounded({ type: 'false dilemma', quote: 'There is no middle ground' }, content)).toBe(true);
  });

  test('rejects a quote the argument never contained', () => {
    // The judge will invent supporting text alongside a verdict; requiring the
    // quote to be real is what stops a fabricated finding being recorded.
    expect(fallacyGraph._isGrounded({ type: 'ad hominem', quote: 'you are clearly an idiot' }, content)).toBe(false);
  });

  test('rejects a finding with no quote at all', () => {
    expect(fallacyGraph._isGrounded({ type: 'straw man' }, content)).toBe(false);
  });

  test('tolerates light paraphrase and punctuation differences', () => {
    expect(fallacyGraph._isGrounded({ type: 'false dilemma', quote: 'there is no middle ground!' }, content)).toBe(true);
  });
});

describe('embedding cache', () => {
  const stubDelegate = () => {
    const calls = { queries: 0, documents: [] };
    return {
      calls,
      embedQuery: async () => { calls.queries += 1; return [0.1, 0.2, 0.3]; },
      embedDocuments: async (texts) => {
        calls.documents.push(texts.length);
        return texts.map(() => [0.1, 0.2, 0.3]);
      },
    };
  };

  test('a repeated query hits the cache instead of the network', async () => {
    const delegate = stubDelegate();
    const embeddings = new CachedEmbeddings(delegate, { model: 'test' });

    await embeddings.embedQuery('same text');
    await embeddings.embedQuery('same text');

    expect(delegate.calls.queries).toBe(1);
    expect(embeddings.getCacheStats().hits).toBe(1);
  });

  test('duplicates within one batch are only fetched once', async () => {
    const delegate = stubDelegate();
    const embeddings = new CachedEmbeddings(delegate, { model: 'test' });

    const result = await embeddings.embedDocuments(['a', 'b', 'a']);

    expect(result).toHaveLength(3);
    expect(delegate.calls.documents).toEqual([2]);
    expect(result[0]).toEqual(result[2]);
  });

  test('eviction keeps the cache bounded', async () => {
    const embeddings = new CachedEmbeddings(stubDelegate(), { model: 'test', maxEntries: 3 });

    for (const text of ['a', 'b', 'c', 'd', 'e']) await embeddings.embedQuery(text);

    expect(embeddings.getCacheStats().size).toBe(3);
  });

  test('vectors are keyed by model so a swap cannot serve stale ones', async () => {
    const delegate = stubDelegate();
    const first = new CachedEmbeddings(delegate, { model: 'model-a' });
    const second = new CachedEmbeddings(delegate, { model: 'model-b' });

    expect(first._key('text')).not.toBe(second._key('text'));
  });
});
