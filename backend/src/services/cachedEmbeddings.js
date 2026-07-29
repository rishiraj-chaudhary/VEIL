import { Embeddings } from "@langchain/core/embeddings";
import crypto from "crypto";

/**
 * Caching wrapper around any LangChain Embeddings implementation.
 *
 * Every vector retrieval embeds its query over the network before it can search,
 * so the same query text costs a round-trip every time it is asked. Embeddings
 * are deterministic for a fixed model, which makes them safe to memoise by
 * content hash. Cached entries are keyed by model too, so swapping models can
 * never serve vectors from the previous one.
 *
 * The cache is per-process and bounded (simple LRU via Map insertion order).
 */
class CachedEmbeddings extends Embeddings {
  constructor(delegate, { model, maxEntries = 5000 } = {}) {
    super({});
    this.delegate = delegate;
    this.model = model || 'unknown';
    this.maxEntries = maxEntries;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  _key(text) {
    return `${this.model}:${crypto.createHash('sha256').update(text).digest('hex')}`;
  }

  _get(text) {
    const key = this._key(text);
    if (!this.cache.has(key)) return null;

    // Refresh recency for LRU eviction.
    const vector = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, vector);
    this.hits += 1;
    return vector;
  }

  _set(text, vector) {
    if (!Array.isArray(vector) || vector.length === 0) return;

    const key = this._key(text);
    this.cache.set(key, vector);

    while (this.cache.size > this.maxEntries) {
      this.cache.delete(this.cache.keys().next().value);
    }
  }

  async embedQuery(text) {
    const cached = this._get(text);
    if (cached) return cached;

    this.misses += 1;
    const vector = await this.delegate.embedQuery(text);
    this._set(text, vector);
    return vector;
  }

  /**
   * Only the uncached texts are sent upstream, and they go in a single batched
   * call rather than one request per document.
   */
  async embedDocuments(texts) {
    const results = new Array(texts.length);

    // Deduplicated by text: repeats within a single batch would otherwise each
    // be sent upstream, since none of them is cached yet when the batch starts.
    const pending = new Map();

    texts.forEach((text, index) => {
      const cached = this._get(text);
      if (cached) {
        results[index] = cached;
        return;
      }

      if (pending.has(text)) {
        pending.get(text).push(index);
      } else {
        pending.set(text, [index]);
      }
    });

    if (pending.size === 0) return results;

    this.misses += pending.size;
    const uniqueTexts = [...pending.keys()];
    const fresh = await this.delegate.embedDocuments(uniqueTexts);

    uniqueTexts.forEach((text, i) => {
      const vector = fresh[i];
      this._set(text, vector);
      for (const index of pending.get(text)) results[index] = vector;
    });

    return results;
  }

  getCacheStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : Number((this.hits / total).toFixed(3)),
    };
  }
}

export default CachedEmbeddings;
