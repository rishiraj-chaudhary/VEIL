import grokService from './grokService.js';

/**
 * LLM RERANKING SERVICE — Step 4 of AI Maturity Roadmap
 *
 * After hybrid retrieval (Step 3), this reranker asks the LLM:
 * "How relevant is this document to the query? Score 0-10."
 *
 * Why rerank?
 *   - BM25 + vector can agree on a doc that's topically close but
 *     not actually useful for the specific argument being made.
 *   - LLM understands INTENT, not just token overlap or embedding distance.
 *
 * Cost control:
 *   - Uses fast model (llama-3.1-8b) — cheapest option
 *   - Batches all docs into ONE LLM call (not N calls)
 *   - In-memory cache keyed by (query + doc fingerprint)
 *   - Falls back to hybrid order if LLM fails
 *
 * When to use:
 *   - Final retrieval step before injecting into prompts
 *   - Only on top K candidates (don't rerank 50 docs)
 *   - Skip if candidateCount <= 2 (not worth the cost)
 */
class RerankingService {
  constructor() {
    // Simple in-memory cache: "queryHash:docHash" → score
    this.cache = new Map();
    this.maxCacheSize = 500;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Rerank documents using LLM relevance scoring.
   * Single LLM call scores ALL candidates at once.
   *
   * @param {string} query - The debate turn / user argument
   * @param {Array} docs - Candidate docs from hybrid retrieval
   * @param {Object} options
   * @param {number} options.topK - How many to return after reranking
   * @param {string} options.context - Optional debate context for better scoring
   * @returns {Array} Reranked docs with relevanceScore added
   */
  async rerank(query, docs, options = {}) {
    if (!docs || docs.length === 0) return [];
    if (docs.length <= 2) {
      // Not worth an LLM call for 1-2 docs
      return docs.map(doc => ({ ...doc, relevanceScore: 1.0, _llmReranked: false }));
    }

    const { topK = docs.length, context = '' } = options;

    // Check cache first
    const cacheKey = this._buildCacheKey(query, docs);
    if (this.cache.has(cacheKey)) {
      this.cacheHits++;
      console.log(`💾 Reranker cache HIT (${this.cacheHits} hits, ${this.cacheMisses} misses)`);
      const cachedScores = this.cache.get(cacheKey);
      return this._applyScores(docs, cachedScores, topK);
    }

    this.cacheMisses++;

    if (!grokService.isReady()) {
      console.warn('⚠️ Reranker: Groq not available, skipping LLM rerank');
      return docs.slice(0, topK).map(doc => ({
        ...doc,
        relevanceScore: 1.0,
        _llmReranked: false,
      }));
    }

    try {
      const scores = await this._llmScore(query, docs, context);

      // Cache the scores
      this._setCache(cacheKey, scores);

      const reranked = this._applyScores(docs, scores, topK);

      console.log(`🧠 LLM reranked ${docs.length} docs → top ${topK}`);
      reranked.slice(0, 3).forEach((doc, i) => {
        const text = (doc.text || doc.content || '').substring(0, 60);
        console.log(`   ${i + 1}. [${doc.relevanceScore.toFixed(2)}] ${text}...`);
      });

      return reranked;

    } catch (error) {
      console.error('❌ LLM reranking failed, using hybrid order:', error.message);
      return docs.slice(0, topK).map(doc => ({
        ...doc,
        relevanceScore: 0.5,
        _llmReranked: false,
        _rerankError: error.message,
      }));
    }
  }

  /**
   * Single LLM call to score all documents at once.
   * Returns array of scores [0-10] matching doc order.
   */
  async _llmScore(query, docs, context = '') {
    const docList = docs.map((doc, i) => {
      const text = this._getDocText(doc).substring(0, 200);
      return `[${i}] ${text}`;
    }).join('\n\n');

    const contextSection = context
      ? `\nDebate context: ${context.substring(0, 300)}\n`
      : '';

    const prompt = `You are a relevance judge for a debate AI system.

Query (debate argument being analyzed):
"${query.substring(0, 400)}"
${contextSection}
Rate each document's relevance to the query on a scale of 0-10.
Focus on: Does this document help analyze, detect fallacies in, or provide evidence context for the query?

Documents:
${docList}

Return ONLY a JSON array of numbers, one per document, in order.
Example for 3 docs: [7, 2, 9]
Return ONLY the array, no explanation.`;

    const response = await grokService.generateFast(prompt, {
      operation: 'reranking',
      temperature: 0.1,
    });

    return this._parseScores(response, docs.length);
  }

  /**
   * Parse LLM score response into array of normalized floats.
   */
  _parseScores(response, expectedCount) {
    try {
      const cleaned = response.replace(/```json|```/g, '').trim();

      // Extract array from response
      const arrayMatch = cleaned.match(/\[[\d\s,\.]+\]/);
      if (!arrayMatch) throw new Error('No array found in response');

      const scores = JSON.parse(arrayMatch[0]);

      if (!Array.isArray(scores) || scores.length !== expectedCount) {
        throw new Error(`Expected ${expectedCount} scores, got ${scores.length}`);
      }

      // Normalize from [0-10] to [0-1]
      return scores.map(s => {
        const num = parseFloat(s);
        return isNaN(num) ? 0.5 : Math.max(0, Math.min(10, num)) / 10;
      });

    } catch (error) {
      console.warn('⚠️ Score parsing failed:', error.message, '— using uniform scores');
      return new Array(expectedCount).fill(0.5);
    }
  }

  /**
   * Apply scores to docs and sort by relevance descending.
   */
  _applyScores(docs, scores, topK) {
    const scored = docs.map((doc, i) => ({
      ...doc,
      relevanceScore: scores[i] ?? 0.5,
      _llmReranked: true,
    }));

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scored.slice(0, topK);
  }

  _getDocText(doc) {
    return doc?.text || doc?.content || doc?.pageContent || '';
  }

  /**
   * Build a cache key from query + doc fingerprints.
   * Uses first 100 chars of each doc to keep keys short.
   */
  _buildCacheKey(query, docs) {
    const queryKey = query.substring(0, 80).replace(/\s+/g, '_');
    const docsKey = docs
      .map(doc => this._getDocText(doc).substring(0, 30))
      .join('|')
      .replace(/\s+/g, '_');
    return `${queryKey}::${docsKey}`;
  }

  _setCache(key, value) {
    // Simple LRU: evict oldest entries when full
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: this.cacheHits + this.cacheMisses === 0
        ? 0
        : (this.cacheHits / (this.cacheHits + this.cacheMisses) * 100).toFixed(1) + '%',
    };
  }

  clearCache() {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    console.log('🧹 Reranker cache cleared');
  }
}

const rerankingService = new RerankingService();
export default rerankingService;