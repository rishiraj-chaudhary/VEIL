import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import CachedEmbeddings from "./cachedEmbeddings.js";

const EMBEDDING_CACHE_SIZE = parseInt(process.env.EMBEDDING_CACHE_SIZE, 10) || 5000;

class EmbeddingService {
  constructor() {
    this.embeddings = null;
    this.initialized = false;
    this.model = "sentence-transformers/all-MiniLM-L6-v2";
  }

  initialize() {
    if (this.initialized) return this.embeddings;

    const apiKey = process.env.HUGGINGFACE_API_KEY;

    if (!apiKey) {
      console.error('❌ HUGGINGFACE_API_KEY not found in .env');
      throw new Error('HuggingFace API key required. Get free key from https://huggingface.co/settings/tokens');
    }

    try {
      const remote = new HuggingFaceInferenceEmbeddings({
        apiKey: apiKey,
        model: this.model,
      });

      // Wrapped so repeated queries (retrieval runs the same text constantly)
      // don't pay a network round-trip each time.
      this.embeddings = new CachedEmbeddings(remote, {
        model: this.model,
        maxEntries: EMBEDDING_CACHE_SIZE,
      });

      this.initialized = true;
      console.log('✅ HuggingFace Embeddings initialized (LangChain)');
      console.log(`   Model: ${this.model}`);
      console.log('   Dimensions: 384-d');
      console.log(`   Cache: in-process, max ${EMBEDDING_CACHE_SIZE} vectors`);

      return this.embeddings;

    } catch (error) {
      console.error('❌ HuggingFace initialization failed:', error.message);
      throw error;
    }
  }

  getEmbeddings() {
    if (!this.initialized) {
      return this.initialize();
    }
    return this.embeddings;
  }

  isReady() {
    return this.initialized;
  }

  getModel() {
    return this.model;
  }

  getDimensions() {
    return 384;
  }

  /** Embed many texts in one upstream call, reusing anything already cached. */
  async embedDocuments(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    return this.getEmbeddings().embedDocuments(texts);
  }

  async embedQuery(text) {
    return this.getEmbeddings().embedQuery(text);
  }

  getCacheStats() {
    return this.initialized ? this.embeddings.getCacheStats() : null;
  }
}

export default new EmbeddingService();