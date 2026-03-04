import { Document } from "@langchain/core/documents";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { MongoClient } from "mongodb";
import chunkingService from './chunkingService.js';
import embeddingService from './embeddingService.js';
import hybridSearchService from './hybridSearchService.js';
import rerankingService from './rerankingService.js';
class VectorStoreService {
  constructor() {
    this.client = null;
    this.db = null;
    this.knowledgeCollection = null;
    this.memoryCollection = null;
    this.knowledgeVectorStore = null;
    this.memoryVectorStore = null;
    this.knowledgeRetriever = null;
    this.memoryRetriever = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('📊 Initializing MongoDB Atlas Vector Search...');

      // Connect to your MongoDB Atlas
      this.client = new MongoClient(process.env.MONGODB_URI);
      await this.client.connect();
      console.log('✅ Connected to MongoDB Atlas (Cluster0)');

      // Use your existing 'test' database
      this.db = this.client.db(process.env.MONGODB_DB_NAME || 'test');
      
      // Use your existing collections
      this.knowledgeCollection = this.db.collection('knowledgeitems');
      this.memoryCollection = this.db.collection('debatememories');

      console.log(`📚 Database: ${this.db.databaseName}`);
      console.log(`   Knowledge: ${this.knowledgeCollection.collectionName}`);
      console.log(`   Memory: ${this.memoryCollection.collectionName}`);

      // Initialize embeddings
      const embeddings = embeddingService.getEmbeddings();

      // Initialize Knowledge Vector Store with LangChain
      this.knowledgeVectorStore = new MongoDBAtlasVectorSearch(
        embeddings,
        {
          collection: this.knowledgeCollection,
          indexName: "knowledge_vector_index",
          textKey: "text",
          embeddingKey: "embedding",
        }
      );

      // Create Knowledge Retriever using .asRetriever()
      this.knowledgeRetriever = this.knowledgeVectorStore.asRetriever({
        k: 3,
        searchType: "similarity",
      });

      console.log('✅ Knowledge Vector Store initialized');

      // Initialize Memory Vector Store with LangChain
      this.memoryVectorStore = new MongoDBAtlasVectorSearch(
        embeddings,
        {
          collection: this.memoryCollection,
          indexName: "memory_vector_index",
          textKey: "content",
          embeddingKey: "embedding",
        }
      );

      // Create Memory Retriever using .asRetriever()
      this.memoryRetriever = this.memoryVectorStore.asRetriever({
        k: 2,
        searchType: "similarity",
      });

      console.log('✅ Memory Vector Store initialized');

      // Check and seed if needed
      const count = await this.knowledgeCollection.countDocuments();
      if (count === 0) {
        console.log('🌱 Seeding knowledge base...');
        await this.seedKnowledgeBase();
      } else {
        console.log(`📚 Existing knowledge base (${count} documents)`);
      }

      this.isInitialized = true;
      console.log('✅ MongoDB Atlas Vector Search ready (LangChain)');

      return true;

    } catch (error) {
      console.error('❌ Vector Store initialization failed:', error.message);
      console.error('   Make sure vector indexes are created in MongoDB Atlas!');
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Retrieve knowledge using LangChain .asRetriever() + .invoke()
   */
  async retrieveKnowledge(query, k = 3) {
    if (!this.isInitialized) {
      console.warn('⚠️ Vector store not initialized');
      return [];
    }

    try {
      // Update retriever if k changed
      if (k !== 3) {
        this.knowledgeRetriever = this.knowledgeVectorStore.asRetriever({
          k: k,
          searchType: "similarity",
        });
      }

      // Use LangChain retriever.invoke() - NO MANUAL COSINE SIMILARITY
      const docs = await this.knowledgeRetriever.invoke(query);

      console.log(`🔍 Retrieved ${docs.length} knowledge docs (LangChain retriever)`);

      // Format results
      const results = docs.map(doc => ({
        text: doc.pageContent,
        content: doc.pageContent,
        category: doc.metadata?.category,
        type: doc.metadata?.type,
        metadata: doc.metadata,
      }));

      return results;

    } catch (error) {
      console.error('❌ Knowledge retrieval failed:', error.message);
      return [];
    }
  }

  /**
 * Hybrid retrieval: vector search → BM25 rerank
 * Drop-in upgrade over retrieveKnowledge()
 *
 * @param {string} query
 * @param {number} k - how many to return after reranking
 * @param {number} candidateMultiplier - fetch k*multiplier docs before reranking
 */
async retrieveKnowledgeHybrid(query, k = 3, candidateMultiplier = 3) {
  if (!this.isInitialized) {
    console.warn('⚠️ Vector store not initialized');
    return [];
  }

  try {
    // Step 1: Fetch a larger candidate pool from vector search
    const candidateK = k * candidateMultiplier;
    const vectorDocs = await this.retrieveKnowledge(query, candidateK);

    if (vectorDocs.length === 0) return [];

    // Step 2: BM25 rerank the candidates
    const reranked = hybridSearchService.hybridRerank(query, vectorDocs, { topK: k });

    console.log(`🔀 Hybrid: ${vectorDocs.length} candidates → ${reranked.length} returned`);
    return reranked;

  } catch (error) {
    console.error('❌ Hybrid retrieval failed, falling back to vector:', error.message);
    return this.retrieveKnowledge(query, k);
  }
}

/**
 * Hybrid retrieval for debate memory
 */
async retrieveDebateMemoryHybrid(query, k = 2, filters = {}) {
  if (!this.isInitialized) return [];

  try {
    const candidateK = k * 3;
    const vectorDocs = await this.retrieveDebateMemory(query, candidateK, filters);

    if (vectorDocs.length === 0) return [];

    const reranked = hybridSearchService.hybridRerank(query, vectorDocs, { topK: k });
    return reranked;

  } catch (error) {
    console.error('❌ Hybrid memory retrieval failed:', error.message);
    return this.retrieveDebateMemory(query, k, filters);
  }
}

/**
 * Full pipeline: vector → hybrid BM25 rerank → LLM rerank
 * This is the highest-quality retrieval available.
 *
 * Pipeline:
 *   1. Vector search fetches k*4 candidates
 *   2. Hybrid BM25+vector reranks → k*2 kept
 *   3. LLM scores final candidates → top k returned
 *
 * @param {string} query
 * @param {number} k - final number to return
 * @param {string} context - optional debate context for LLM reranker
 */
async retrieveKnowledgeReranked(query, k = 3, context = '') {
  if (!this.isInitialized) return [];

  try {
    // Stage 1: Hybrid retrieval with larger candidate pool
    const hybridK = k * 2;
    const hybridDocs = await this.retrieveKnowledgeHybrid(query, hybridK);

    if (hybridDocs.length === 0) return [];
    if (hybridDocs.length <= 2) return hybridDocs; // skip LLM for tiny sets

    // Stage 2: LLM reranking
    const reranked = await rerankingService.rerank(query, hybridDocs, {
      topK: k,
      context,
    });

    console.log(`✅ Full pipeline: vector→hybrid→LLM → ${reranked.length} docs`);
    return reranked;

  } catch (error) {
    console.error('❌ Reranked retrieval failed, falling back to hybrid:', error.message);
    return this.retrieveKnowledgeHybrid(query, k);
  }
}

/**
 * Full pipeline for debate memory.
 */
async retrieveDebateMemoryReranked(query, k = 2, filters = {}, context = '') {
  if (!this.isInitialized) return [];

  try {
    const hybridDocs = await this.retrieveDebateMemoryHybrid(query, k * 2, filters);

    if (hybridDocs.length === 0) return [];
    if (hybridDocs.length <= 2) return hybridDocs;

    const reranked = await rerankingService.rerank(query, hybridDocs, {
      topK: k,
      context,
    });

    return reranked;

  } catch (error) {
    console.error('❌ Reranked memory retrieval failed:', error.message);
    return this.retrieveDebateMemoryHybrid(query, k, filters);
  }
}

  /**
   * Retrieve debate memory using LangChain .asRetriever() + .invoke()
   */
  async retrieveDebateMemory(query, k = 2, filters = {}) {
    if (!this.isInitialized) {
      console.warn('⚠️ Vector store not initialized');
      return [];
    }

    try {
      // Create retriever config
      const retrieverConfig = {
        k: k,
        searchType: "similarity",
      };

      // Add MongoDB filters if provided
      if (Object.keys(filters).length > 0) {
        retrieverConfig.filter = filters;
      }

      const retriever = this.memoryVectorStore.asRetriever(retrieverConfig);

      // Use LangChain retriever.invoke()
      const docs = await retriever.invoke(query);

      console.log(`🔍 Retrieved ${docs.length} memory docs (LangChain retriever)`);

      // Format results
      const results = docs.map(doc => ({
        content: doc.pageContent,
        side: doc.metadata?.side,
        round: doc.metadata?.round,
        quality: doc.metadata?.quality,
        debateId: doc.metadata?.debate?.toString(),
        metadata: doc.metadata,
      }));

      return results;

    } catch (error) {
      console.error('❌ Memory retrieval failed:', error.message);
      return [];
    }
  }

  /**
   * Add knowledge using LangChain fromDocuments
   */
  async addKnowledge(text, metadata = {}) {
    try {
      // Chunk text
      const chunks = await chunkingService.chunk(text);

      // Create Document objects
      const docs = chunks.map((chunk, index) => new Document({
        pageContent: chunk,
        metadata: {
          ...metadata,
          chunkIndex: index,
          totalChunks: chunks.length,
        }
      }));

      // Add using LangChain
      await MongoDBAtlasVectorSearch.fromDocuments(
        docs,
        embeddingService.getEmbeddings(),
        {
          collection: this.knowledgeCollection,
          indexName: "knowledge_vector_index",
          textKey: "text",
          embeddingKey: "embedding",
        }
      );

      console.log(`✅ Added ${docs.length} knowledge chunks (LangChain)`);

    } catch (error) {
      console.error('❌ Failed to add knowledge:', error.message);
      throw error;
    }
  }

  /**
   * Add turn to memory using LangChain
   */
  async addToMemory(turn, debate) {
    try {
      // Create Document
      const doc = new Document({
        pageContent: turn.content,
        metadata: {
          turn: turn._id,
          debate: debate._id,
          side: turn.side,
          round: turn.round,
          quality: turn.aiAnalysis?.overallQuality || 0,
          topic: debate.topic,
          author: turn.author,
        }
      });

      // Add using LangChain
      await this.memoryVectorStore.addDocuments([doc]);

      console.log(`🧠 Added turn to memory (LangChain): ${turn._id}`);

    } catch (error) {
      console.error('❌ Failed to add to memory:', error.message);
      throw error;
    }
  }

  /**
   * Seed knowledge base using LangChain
   */
  async seedKnowledgeBase() {
    try {
      const knowledgeItems = [
        {
          text: 'Ad Hominem fallacy: Attacking the person making the argument rather than the argument itself. Example: You cannot trust his climate research because he is not a nice person.',
          metadata: { category: 'fallacy', type: 'ad_hominem', itemId: 'fallacy_ad_hominem' }
        },
        {
          text: 'Straw Man fallacy: Misrepresenting someone\'s argument to make it easier to attack. Example: Person A says we should improve public transportation. Person B responds why do you want to ban all cars?',
          metadata: { category: 'fallacy', type: 'straw_man', itemId: 'fallacy_straw_man' }
        },
        {
          text: 'Appeal to Emotion fallacy: Manipulating emotions rather than using valid reasoning. Example: Think of the children without logical connection to the argument.',
          metadata: { category: 'fallacy', type: 'appeal_to_emotion', itemId: 'fallacy_appeal_emotion' }
        },
        {
          text: 'False Dilemma fallacy: Presenting only two options when more exist. Example: Either we cut all government spending or the economy will collapse.',
          metadata: { category: 'fallacy', type: 'false_dilemma', itemId: 'fallacy_false_dilemma' }
        },
        {
          text: 'Hasty Generalization fallacy: Drawing broad conclusions from limited evidence. Example: I met two rude people from that city so everyone there must be rude.',
          metadata: { category: 'fallacy', type: 'hasty_generalization', itemId: 'fallacy_hasty_gen' }
        },
        {
          text: 'Strong evidence includes: peer-reviewed research, statistical data from credible sources, expert testimony from relevant fields, reproducible experiments, and primary sources.',
          metadata: { category: 'evidence', type: 'strong_evidence', itemId: 'evidence_strong' }
        },
        {
          text: 'Weak evidence includes: anecdotal stories, uncited claims, appeals to common sense without data, cherry-picked examples, and outdated sources.',
          metadata: { category: 'evidence', type: 'weak_evidence', itemId: 'evidence_weak' }
        },
        {
          text: 'Effective rebuttal techniques: Address the strongest version of opponent\'s argument, provide counter-evidence, identify logical flaws, offer alternative explanations.',
          metadata: { category: 'technique', type: 'rebuttal', itemId: 'technique_rebuttal' }
        },
      ];

      // Create all documents with chunks
      const allDocs = [];
      for (const item of knowledgeItems) {
        const chunks = await chunkingService.chunk(item.text);
        
        const docs = chunks.map((chunk, index) => new Document({
          pageContent: chunk,
          metadata: {
            ...item.metadata,
            chunkIndex: index,
            totalChunks: chunks.length,
          }
        }));

        allDocs.push(...docs);
      }

      // Add all using LangChain fromDocuments
      await MongoDBAtlasVectorSearch.fromDocuments(
        allDocs,
        embeddingService.getEmbeddings(),
        {
          collection: this.knowledgeCollection,
          indexName: "knowledge_vector_index",
          textKey: "text",
          embeddingKey: "embedding",
        }
      );

      console.log(`✅ Seeded ${knowledgeItems.length} items → ${allDocs.length} chunks`);

    } catch (error) {
      console.error('❌ Seeding failed:', error);
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    const knowledgeCount = await this.knowledgeCollection.countDocuments();
    const memoryCount = await this.memoryCollection.countDocuments();

    return {
      initialized: this.isInitialized,
      hasKnowledgeStore: knowledgeCount > 0,
      hasMemoryStore: true,
      knowledgeCount,
      memoryCount,
      embeddingModel: embeddingService.getModel(),
      embeddingDimensions: embeddingService.getDimensions(),
      vectorStore: 'MongoDB Atlas Vector Search (LangChain)',
      rerankCache: rerankingService.getCacheStats(),
    };
  }

  async close() {
    if (this.client) {
      await this.client.close();
      console.log('✅ MongoDB connection closed');
    }
  }
}

export default new VectorStoreService();