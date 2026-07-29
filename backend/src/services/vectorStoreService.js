import { Document } from "@langchain/core/documents";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import mongoose from "mongoose";
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
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('📊 Initializing MongoDB Atlas Vector Search...');

      // Reuse Mongoose's pool rather than opening a second one against the same
      // cluster — two pools doubled the connection count for no benefit and is
      // the first thing to exhaust Atlas connection limits under load.
      if (mongoose.connection.readyState !== 1) {
        throw new Error('Mongoose is not connected — cannot initialise vector store');
      }

      this.client = mongoose.connection.getClient();
      this.db = process.env.MONGODB_DB_NAME
        ? this.client.db(process.env.MONGODB_DB_NAME)
        : mongoose.connection.db;


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

      // No retriever is built here: retrieval creates one per call, because a
      // shared retriever leaks the previous call's `k` and lets concurrent
      // requests overwrite each other's config.
      console.log('✅ Knowledge Vector Store initialized');

      // Initialize Memory Vector Store with LangChain
      this.memoryVectorStore = new MongoDBAtlasVectorSearch(
        embeddings,
        {
          collection: this.memoryCollection,
          indexName: "memory_vector_index",
          // The DebateMemory schema and all stored documents use `text`; a
          // `content` key here read an absent field, so every retrieved memory
          // came back with empty pageContent.
          textKey: "text",
          embeddingKey: "embedding",
        }
      );

      console.log('✅ Memory Vector Store initialized');

      // estimatedDocumentCount reads collection metadata; countDocuments scans.
      const count = await this.knowledgeCollection.estimatedDocumentCount();
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
      // A per-call retriever: mutating a shared one leaked the previous call's k
      // (any hybrid call widened it to k*3 and every later k=3 call inherited that)
      // and made concurrent requests overwrite each other's config.
      const retriever = this.knowledgeVectorStore.asRetriever({
        k,
        searchType: "similarity",
      });

      const docs = await retriever.invoke(query);

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

      // Accepts either `{ preFilter: {...} }` or a bare filter object. Both reach
      // Atlas as a $vectorSearch pre-filter, so both require every path they name
      // to be declared as a filter field in the index — an undeclared path fails
      // the whole aggregation rather than degrading.
      const preFilter = filters?.preFilter ?? filters;

      if (preFilter && Object.keys(preFilter).length > 0) {
        retrieverConfig.filter = { preFilter };
      }

      const retriever = this.memoryVectorStore.asRetriever(retrieverConfig);

      // Use LangChain retriever.invoke()
      const docs = await retriever.invoke(query);

      console.log(`🔍 Retrieved ${docs.length} memory docs (LangChain retriever)`);

      // Metadata arrives at one of two depths. Documents written through
      // LangChain carry their fields directly; documents written by the
      // DebateMemory model keep them under a nested `metadata` object, and
      // LangChain then wraps the whole row — producing metadata.metadata.side.
      //
      // The mapping only ever read the shallow path, so side, round and quality
      // came back undefined for every stored memory. That is why the `filters`
      // argument was never used anywhere: filtering could not have worked.
      const results = docs.map(doc => {
        const meta = { ...(doc.metadata ?? {}), ...(doc.metadata?.metadata ?? {}) };

        return {
          content: doc.pageContent,
          side: meta.side,
          round: meta.round,
          quality: meta.quality,
          topic: meta.topic,
          debateId: (meta.debate ?? meta.debateId)?.toString(),
          turnId: (meta.turn ?? meta.turnId)?.toString(),
          metadata: meta,
        };
      });

      return results;

    } catch (error) {
      console.error('❌ Memory retrieval failed:', error.message);
      return [];
    }
  }


  // ─────────────────────────────────────────────────────────────────────────
  // PURPOSEFUL MEMORY RETRIEVAL
  //
  // Semantic similarity alone answers "what else sounds like this", which is
  // rarely the useful question. These ask questions that only this platform's
  // own history can answer, and that no pretrained model can know.
  //
  // Filtering runs inside $vectorSearch as a pre-filter, so `k` results come back
  // already qualified. Post-filtering an over-fetched page silently loses matches
  // once the corpus outgrows the over-fetch multiplier — the candidate window
  // fills with near-duplicates from one side and the other side never appears.
  //
  // Every path used here is declared as a filter field in the Atlas index by
  // scripts/createVectorIndexes.js. Querying an undeclared path is not a soft
  // failure: Atlas rejects the whole aggregation.
  // ─────────────────────────────────────────────────────────────────────────

  async _retrieveMemoryFiltered(query, { k = 3, preFilter } = {}) {
    if (!this.isInitialized) return [];

    try {
      return await this.retrieveDebateMemory(query, k, { preFilter });
    } catch (error) {
      console.warn('Filtered memory retrieval failed:', error.message);
      return [];
    }
  }

  /**
   * How this argument has been attacked before.
   *
   * Retrieves high-quality turns from the opposing side — the actual counter-
   * arguments people made, not a model's guess at what one might look like.
   */
  async findCounterArguments(query, mySide, k = 3) {
    const opposing = mySide === 'for' ? 'against' : 'for';

    return this._retrieveMemoryFiltered(query, {
      k,
      preFilter: {
        'metadata.side': { $eq: opposing },
        'metadata.quality': { $gte: 55 },
      },
    });
  }

  /**
   * Arguments on this topic that scored badly.
   *
   * Useful as a negative example: "this line has been tried and did not land."
   */
  async findWeakArguments(query, k = 2) {
    return this._retrieveMemoryFiltered(query, {
      k,
      preFilter: { 'metadata.quality': { $lt: 45 } },
    });
  }

  /**
   * The strongest turns on this subject, whichever side made them.
   */
  async findStrongArguments(query, k = 3) {
    return this._retrieveMemoryFiltered(query, {
      k,
      preFilter: { 'metadata.quality': { $gte: 70 } },
    });
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

      // The already-initialised store, rather than the static fromDocuments
      // factory: that builds a second store per call with its own embeddings
      // instance, so nothing it embeds is served from the process-wide cache.
      await this.knowledgeVectorStore.addDocuments(docs);

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
      // LangChain spreads a Document's metadata across the root of the stored
      // record, so the shape written here is the shape queried later. Nesting the
      // descriptive fields under `metadata` reproduces the DebateMemory schema and
      // matches the `metadata.*` paths declared as Atlas filter fields.
      //
      // The previous version passed these fields flat, which put them at the root
      // where neither the schema nor the filter paths could see them.
      const doc = new Document({
        pageContent: turn.content,
        metadata: {
          turnId: turn._id,
          debateId: debate._id,
          metadata: {
            side: turn.side,
            round: turn.round,
            quality: turn.aiAnalysis?.overallQuality || 0,
            topic: debate.topic,
            author: turn.author,
          },
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

      // Seeding runs from initialize() after the store is constructed, so the
      // instance is available and the static factory's duplicate store is not needed.
      await this.knowledgeVectorStore.addDocuments(allDocs);

      console.log(`✅ Seeded ${knowledgeItems.length} items → ${allDocs.length} chunks`);

    } catch (error) {
      console.error('❌ Seeding failed:', error);
    }
  }

  /**
   * Get statistics
   */
  /**
   * Confirms `$vectorSearch` actually returns results. Atlas returns an empty
   * result set — not an error — when the vector index is missing or still
   * building, so document counts alone cannot tell you retrieval works.
   */
  async verifyRetrieval() {
    if (!this.isInitialized) return { ok: false, reason: 'not initialised' };

    try {
      const docs = await this.retrieveKnowledge('logical fallacy in argument', 1);
      return docs.length > 0
        ? { ok: true }
        : { ok: false, reason: 'vector search returned no results — index missing or still building' };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  async getStats() {
    if (!this.isInitialized) {
      return {
        initialized: false,
        hasKnowledgeStore: false,
        hasMemoryStore: false,
        knowledgeCount: 0,
        memoryCount: 0,
        embeddingModel: embeddingService.getModel(),
        embeddingDimensions: embeddingService.getDimensions(),
        vectorStore: 'MongoDB Atlas Vector Search (LangChain)',
        rerankCache: rerankingService.getCacheStats(),
      };
    }

    const knowledgeCount = await this.knowledgeCollection.estimatedDocumentCount();
    const memoryCount = await this.memoryCollection.estimatedDocumentCount();

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

  /**
   * The Mongo client is owned by Mongoose, so this only drops local references.
   * Closing it here would tear down the connection the whole app is using.
   */
  async close() {
    this.client = null;
    this.db = null;
    this.isInitialized = false;
  }
}

export default new VectorStoreService();