import DebateMemory from '../models/DebateMemory.js';
import KnowledgeItem from '../models/KnowledgeItem.js';

/**
 * UNIFIED VECTOR STORE SERVICE (Phase 1)
 * 
 * Single entry point for all RAG retrieval
 * Supports: knowledge, debate memory, community memory, user memory
 */
class VectorStoreService {
  constructor() {
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('📊 Initializing MongoDB Vector Store...');

      const count = await KnowledgeItem.countDocuments();
      
      if (count === 0) {
        await this.seedKnowledgeBase();
      } else {
        console.log(`📚 Loaded existing knowledge base (${count} items)`);
      }

      const memoryCount = await DebateMemory.countDocuments();
      console.log(`🧠 Debate memory: ${memoryCount} items`);

      this.isInitialized = true;
      console.log('✅ MongoDB Vector Store initialized successfully');

    } catch (error) {
      console.error('❌ Vector Store initialization error:', error.message);
      this.isInitialized = false;
    }
  }

  /**
   * ✨ UNIFIED RETRIEVAL INTERFACE (Phase 1)
   * 
   * Single method to retrieve context from multiple sources
   */
  async retrieveContext(query, options = {}) {
    const {
      sources = ['knowledge', 'debate'],
      topK = 5,
      debateId = null,
      communityId = null,
      userId = null,
      filters = {}
    } = options;

    const context = {
      knowledge: [],
      debateMemory: [],
      communityMemory: [],
      userMemory: [],
      metadata: {
        query,
        sources: sources,
        totalResults: 0,
        timestamp: new Date()
      }
    };

    try {
      // Retrieve from knowledge base
      if (sources.includes('knowledge')) {
        context.knowledge = await this.retrieveKnowledge(query, topK);
      }

      // Retrieve from debate memory
      if (sources.includes('debate')) {
        context.debateMemory = await this.retrieveDebateMemory(
          query, 
          Math.min(topK, 3),
          { debateId, ...filters }
        );
      }

      // Future: Community memory
      if (sources.includes('community') && communityId) {
        context.communityMemory = await this.retrieveCommunityMemory(
          query, 
          communityId, 
          topK
        );
      }

      // Future: User memory
      if (sources.includes('user') && userId) {
        context.userMemory = await this.retrieveUserMemory(
          query, 
          userId, 
          topK
        );
      }

      // Calculate total results
      context.metadata.totalResults = 
        context.knowledge.length + 
        context.debateMemory.length +
        context.communityMemory.length +
        context.userMemory.length;

      return context;

    } catch (error) {
      console.error('Unified retrieval error:', error.message);
      return context;
    }
  }

  /**
   * Generate embedding
   */
  generateEmbedding(text) {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0);

    words.forEach((word) => {
      const hash = this.simpleHash(word);
      const position = hash % 384;
      embedding[position] += 1;
    });

    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magA += vecA[i] * vecA[i];
      magB += vecB[i] * vecB[i];
    }

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);

    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
  }

  async seedKnowledgeBase() {
    const knowledgeItems = [
      {
        itemId: 'fallacy_ad_hominem',
        text: 'Ad Hominem fallacy: Attacking the person making the argument rather than the argument itself. Example: You cannot trust his climate research because he is not a nice person.',
        category: 'fallacy',
        type: 'ad_hominem'
      },
      {
        itemId: 'fallacy_straw_man',
        text: 'Straw Man fallacy: Misrepresenting someone\'s argument to make it easier to attack. Example: Person A says we should improve public transportation. Person B responds why do you want to ban all cars?',
        category: 'fallacy',
        type: 'straw_man'
      },
      {
        itemId: 'fallacy_appeal_emotion',
        text: 'Appeal to Emotion fallacy: Manipulating emotions rather than using valid reasoning. Example: Think of the children without logical connection to the argument.',
        category: 'fallacy',
        type: 'appeal_to_emotion'
      },
      {
        itemId: 'fallacy_false_dilemma',
        text: 'False Dilemma fallacy: Presenting only two options when more exist. Example: Either we cut all government spending or the economy will collapse.',
        category: 'fallacy',
        type: 'false_dilemma'
      },
      {
        itemId: 'fallacy_hasty_gen',
        text: 'Hasty Generalization fallacy: Drawing broad conclusions from limited evidence. Example: I met two rude people from that city so everyone there must be rude.',
        category: 'fallacy',
        type: 'hasty_generalization'
      },
      {
        itemId: 'fallacy_appeal_authority',
        text: 'Appeal to Authority fallacy: Citing an authority without relevant expertise. Example: A famous actor says this medicine works so it must be true.',
        category: 'fallacy',
        type: 'appeal_to_authority'
      },
      {
        itemId: 'fallacy_slippery_slope',
        text: 'Slippery Slope fallacy: Claiming one event will lead to extreme consequences without evidence. Example: If we allow this small tax increase next we will have total government control.',
        category: 'fallacy',
        type: 'slippery_slope'
      },
      {
        itemId: 'evidence_strong',
        text: 'Strong evidence includes: peer-reviewed research, statistical data from credible sources, expert testimony from relevant fields, reproducible experiments, and primary sources.',
        category: 'evidence',
        type: 'strong_evidence'
      },
      {
        itemId: 'evidence_weak',
        text: 'Weak evidence includes: anecdotal stories, uncited claims, appeals to common sense without data, cherry-picked examples, and outdated sources.',
        category: 'evidence',
        type: 'weak_evidence'
      },
      {
        itemId: 'technique_rebuttal',
        text: 'Effective rebuttal techniques: Address the strongest version of opponent\'s argument, provide counter-evidence, identify logical flaws, offer alternative explanations, and acknowledge valid points before countering.',
        category: 'technique',
        type: 'rebuttal'
      },
      {
        itemId: 'technique_conduct',
        text: 'Professional debate conduct: Stay on topic, avoid personal attacks, cite sources, acknowledge uncertainty when appropriate, use clear language, and maintain respectful tone.',
        category: 'technique',
        type: 'conduct'
      }
    ];

    try {
      const items = knowledgeItems.map(item => ({
        ...item,
        embedding: this.generateEmbedding(item.text)
      }));

      await KnowledgeItem.insertMany(items);
      console.log(`📚 Seeded ${items.length} knowledge items`);
    } catch (error) {
      console.error('Seeding error:', error.message);
    }
  }

  async retrieveKnowledge(query, topK = 3) {
    if (!this.isInitialized) {
      return [];
    }

    try {
      const queryEmbedding = this.generateEmbedding(query);
      const items = await KnowledgeItem.find().lean();

      const results = items.map(item => ({
        ...item,
        similarity: this.cosineSimilarity(queryEmbedding, item.embedding)
      }));

      results.sort((a, b) => b.similarity - a.similarity);
      const topResults = results.slice(0, topK);

      return topResults.map(item => ({
        content: item.text,
        metadata: {
          category: item.category,
          type: item.type
        },
        similarity: item.similarity
      }));

    } catch (error) {
      console.error('Knowledge retrieval error:', error.message);
      return [];
    }
  }

  async retrieveDebateMemory(query, topK = 2, filters = {}) {
    if (!this.isInitialized) {
      return [];
    }

    try {
      const count = await DebateMemory.countDocuments(filters);
      if (count === 0) {
        return [];
      }

      const queryEmbedding = this.generateEmbedding(query);

      const items = await DebateMemory.find(filters)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const results = items.map(item => ({
        ...item,
        similarity: this.cosineSimilarity(queryEmbedding, item.embedding)
      }));

      results.sort((a, b) => b.similarity - a.similarity);
      const topResults = results.slice(0, topK);

      return topResults.map(item => ({
        content: item.text,
        metadata: item.metadata,
        similarity: item.similarity
      }));

    } catch (error) {
      console.error('Memory retrieval error:', error.message);
      return [];
    }
  }

  /**
   * FUTURE: Community memory retrieval
   */
  async retrieveCommunityMemory(query, communityId, topK = 3) {
    // TODO: Implement community-specific memory
    return [];
  }

  /**
   * FUTURE: User memory retrieval
   */
  async retrieveUserMemory(query, userId, topK = 3) {
    // TODO: Implement user-specific memory
    return [];
  }

  async addToMemory(turn, debate) {
    if (!this.isInitialized) {
      return;
    }

    try {
      const exists = await DebateMemory.findOne({ turnId: turn._id });
      if (exists) {
        return;
      }

      const embedding = this.generateEmbedding(turn.content);

      await DebateMemory.create({
        turnId: turn._id,
        debateId: debate._id,
        text: turn.content,
        embedding,
        metadata: {
          topic: debate.topic,
          side: turn.side,
          round: turn.round,
          quality: turn.aiAnalysis?.overallQuality || 0
        }
      });

      const count = await DebateMemory.countDocuments();
      console.log(`🧠 Added turn to memory (${count} total): ${turn._id}`);
    } catch (error) {
      console.error('Add to memory error:', error.message);
    }
  }

  async getStats() {
    try {
      const knowledgeCount = await KnowledgeItem.countDocuments();
      const memoryCount = await DebateMemory.countDocuments();

      return {
        initialized: this.isInitialized,
        hasKnowledgeStore: knowledgeCount > 0,
        hasMemoryStore: true,
        knowledgeCount,
        memoryCount
      };
    } catch (error) {
      return {
        initialized: this.isInitialized,
        hasKnowledgeStore: false,
        hasMemoryStore: false,
        knowledgeCount: 0,
        memoryCount: 0
      };
    }
  }
}

const vectorStoreService = new VectorStoreService();
export default vectorStoreService;