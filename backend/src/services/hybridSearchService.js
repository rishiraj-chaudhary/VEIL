import natural from 'natural';

/**
 * HYBRID SEARCH SERVICE — Step 3 of AI Maturity Roadmap
 *
 * Combines BM25 keyword scoring + vector similarity.
 * Formula: finalScore = (0.7 * vectorScore) + (0.3 * bm25Score)
 *
 * MongoDB M0 NOTE: Atlas Search (native BM25) requires M10+.
 * We implement BM25 in JavaScript using the 'natural' package.
 * This runs as a reranker AFTER vector retrieval from LangChain.
 */
class HybridSearchService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.vectorWeight = 0.7;
    this.bm25Weight = 0.3;
    // BM25 hyperparameters (Robertson & Zaragoza 2009)
    this.k1 = 1.5;   // term frequency saturation
    this.b = 0.75;   // length normalization
  }

  /**
   * Main entry point.
   * Takes docs already retrieved by LangChain vector search
   * and re-ranks them using BM25 + vector combined score.
   *
   * @param {string} query
   * @param {Array} vectorDocs - from vectorStoreService.retrieveKnowledge()
   * @param {Object} options - { vectorWeight, bm25Weight, topK }
   * @returns {Array} Re-ranked docs sorted by hybrid score (descending)
   */
  hybridRerank(query, vectorDocs, options = {}) {
    if (!vectorDocs || vectorDocs.length === 0) return [];

    const {
      vectorWeight = this.vectorWeight,
      bm25Weight = this.bm25Weight,
      topK = vectorDocs.length,
    } = options;

    try {
      const queryTokens = this._tokenizeAndStem(query);
      if (queryTokens.length === 0) return vectorDocs.slice(0, topK);

      const corpus = vectorDocs.map(doc => this._getDocText(doc));
      const bm25Scores = this._computeBM25Scores(queryTokens, corpus);
      const normalizedBM25 = this._normalize(bm25Scores);

      // LangChain doesn't always expose raw scores — use rank-decay fallback
      const vectorScores = vectorDocs.map((doc, i) =>
        typeof doc.score === 'number' ? doc.score : 1.0 - (i / vectorDocs.length)
      );
      const normalizedVector = this._normalize(vectorScores);

      const hybridScores = vectorDocs.map((doc, i) => ({
        ...doc,
        hybridScore: (vectorWeight * normalizedVector[i]) + (bm25Weight * normalizedBM25[i]),
        vectorScore: normalizedVector[i],
        bm25Score: normalizedBM25[i],
        _hybridRanked: true,
      }));

      hybridScores.sort((a, b) => b.hybridScore - a.hybridScore);

      console.log(`🔀 Hybrid rerank: ${vectorDocs.length} docs → top ${topK}`);
      console.log(`   Weights: vector=${vectorWeight}, BM25=${bm25Weight}`);

      return hybridScores.slice(0, topK);

    } catch (error) {
      console.error('❌ Hybrid rerank failed, falling back to vector order:', error.message);
      return vectorDocs.slice(0, topK);
    }
  }

  /**
   * Okapi BM25 implementation.
   * BM25(q,d) = Σ IDF(qi) * [f(qi,d)*(k1+1)] / [f(qi,d) + k1*(1-b+b*|d|/avgdl)]
   */
  _computeBM25Scores(queryTokens, corpus) {
    if (corpus.length === 0) return [];

    const tokenizedCorpus = corpus.map(doc => this._tokenizeAndStem(doc));
    const totalTokens = tokenizedCorpus.reduce((sum, doc) => sum + doc.length, 0);
    const avgDocLength = totalTokens / tokenizedCorpus.length || 1;

    // Build inverted index: term → { docIndex → frequency }
    const invertedIndex = {};
    tokenizedCorpus.forEach((docTokens, docIdx) => {
      const termFreq = {};
      docTokens.forEach(token => { termFreq[token] = (termFreq[token] || 0) + 1; });
      Object.entries(termFreq).forEach(([term, freq]) => {
        if (!invertedIndex[term]) invertedIndex[term] = {};
        invertedIndex[term][docIdx] = freq;
      });
    });

    const N = corpus.length;

    return tokenizedCorpus.map((docTokens, docIdx) => {
      const docLength = docTokens.length || 1;
      let score = 0;

      queryTokens.forEach(queryToken => {
        const postings = invertedIndex[queryToken] || {};
        const df = Object.keys(postings).length;
        const tf = postings[docIdx] || 0;
        if (tf === 0) return;

        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        const tfComp = (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (docLength / avgDocLength)));

        score += idf * tfComp;
      });

      return Math.max(0, score);
    });
  }

  _tokenizeAndStem(text) {
    if (!text || typeof text !== 'string') return [];

    const stopwords = new Set([
      'the','a','an','and','or','but','in','on','at','to','for','of','with',
      'by','from','is','was','are','were','be','been','have','has','had',
      'do','does','did','will','would','could','should','may','might','must',
      'can','this','that','these','those','it','its','i','you','he','she',
      'we','they','what','which','who','when','where','how','not'
    ]);

    const tokens = this.tokenizer.tokenize(text.toLowerCase()) || [];
    return tokens
      .filter(token => token.length > 2 && !stopwords.has(token))
      .map(token => this.stemmer.stem(token));
  }

  _getDocText(doc) {
    return doc?.text || doc?.content || doc?.pageContent || '';
  }

  _normalize(scores) {
    if (scores.length === 0) return [];
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min;
    if (range === 0) return scores.map(() => 1.0);
    return scores.map(s => (s - min) / range);
  }

  scoreSingle(query, docText) {
    const queryTokens = this._tokenizeAndStem(query);
    const scores = this._computeBM25Scores(queryTokens, [docText]);
    return scores[0] || 0;
  }

  getWeights() {
    return { vectorWeight: this.vectorWeight, bm25Weight: this.bm25Weight, k1: this.k1, b: this.b };
  }

  setWeights(vectorWeight, bm25Weight) {
    this.vectorWeight = vectorWeight;
    this.bm25Weight = bm25Weight;
    console.log(`🔧 Hybrid weights: vector=${vectorWeight}, BM25=${bm25Weight}`);
  }
}

const hybridSearchService = new HybridSearchService();
export default hybridSearchService;