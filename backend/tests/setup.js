/**
 * Test environment defaults.
 *
 * Set before any service module is imported: several read process.env at import
 * time, and a missing key there means an import-time throw rather than a clean
 * skip. Nothing here points at a real service — these tests never touch the
 * network or a live database.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-outside-tests';
process.env.JWT_EXPIRE = '1h';
process.env.HUGGINGFACE_API_KEY = 'test-key';
process.env.GROK_API_KEY = 'test-key';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/veil-test';

// Redis is absent in CI; the cache and limiter are expected to degrade locally.
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6399';

// Keep the rubric and fallacy model layers off — unit tests assert the
// deterministic paths, not model output.
process.env.FALLACY_LLM_ENABLED = 'false';
