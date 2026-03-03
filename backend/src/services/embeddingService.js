import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";

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
      this.embeddings = new HuggingFaceInferenceEmbeddings({
        apiKey: apiKey,
        model: this.model,
      });

      this.initialized = true;
      console.log('✅ HuggingFace Embeddings initialized (LangChain)');
      console.log(`   Model: ${this.model}`);
      console.log('   Dimensions: 384-d');
      console.log('   Cost: FREE 🎉');

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
}

export default new EmbeddingService();