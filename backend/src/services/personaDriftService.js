import Comment from '../models/comment.js';
import DebateTurn from '../models/debateTurn.js';
import PersonaSnapshot from '../models/PersonaSnapshot.js';
import Post from '../models/post.js';
import Slick from '../models/slick.js';
import UserPerformance from '../models/UserPerformance.js';
import grokService from './grokService.js';
import structuredParserService from './structuredParserService.js';
import vectorStoreService from './vectorStoreService.js';
class PersonaDriftService {
  
  // ============================================
  // SNAPSHOT CREATION
  // ============================================

  /**
   * Create a new persona snapshot for a user
   */
  async createSnapshot(userId, options = {}) {
    try {
      const {
        snapshotType = 'automatic',
        trigger = 'time_interval',
        periodDays = 30
      } = options;

      console.log(`📸 Creating persona snapshot for user ${userId}...`);

      // Calculate period
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      // 1. Gather content sample
      const contentSample = await this.gatherContentSample(userId, startDate, endDate);

      // 2. Extract traits from content
      const traits = await this.extractTraits(userId, contentSample);

      // 3. Identify topics
      const topics = await this.identifyTopics(userId, contentSample, startDate);

      // 4. Generate embedding
      const embedding = await this.generatePersonaEmbedding(contentSample, traits);

      // 5. Collect metrics
      const metrics = await this.collectMetrics(userId, startDate, endDate);

      // 6. Get previous snapshot for drift analysis
      const previousSnapshot = await PersonaSnapshot.getLatest(userId);

      // 7. Calculate drift
      const driftAnalysis = previousSnapshot 
        ? await this.calculateDrift(traits, embedding, previousSnapshot)
        : null;

      // 8. Generate AI summary
      const summary = await this.generateSummary(traits, driftAnalysis, contentSample);

      // 9. Create snapshot
      const snapshot = await PersonaSnapshot.create({
        userId,
        personaId: null, // Link to Persona model if you want
        timestamp: new Date(),
        contentSample,
        traits,
        topics,
        embedding,
        metrics,
        summary,
        keyChanges: driftAnalysis?.significantChanges || [],
        driftAnalysis: driftAnalysis || undefined,
        snapshotType,
        trigger,
        periodCovered: {
          startDate,
          endDate,
          durationDays: periodDays
        }
      });

      console.log(`✅ Snapshot created: ${snapshot._id}`);
      return snapshot;

    } catch (error) {
      console.error('❌ Error creating persona snapshot:', error);
      throw error;
    }
  }

  // ============================================
  // CONTENT GATHERING
  // ============================================

  /**
   * Gather recent content sample from user
   */
  async gatherContentSample(userId, startDate, endDate) {
    try {
      // Get recent debate turns
      const debateTurns = await DebateTurn.find({
        user: userId,
        createdAt: { $gte: startDate, $lte: endDate }
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('content debate createdAt')
      .lean();

      // Get recent comments
      const comments = await Comment.find({
        author: userId,
        createdAt: { $gte: startDate, $lte: endDate }
      })
      .sort({ createdAt: -1 })
      .limit(15)
      .select('content post createdAt')
      .lean();

      // Get recent posts
      const posts = await Post.find({
        author: userId,
        createdAt: { $gte: startDate, $lte: endDate }
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('content _id createdAt')
      .lean();

      return {
        debateTurns: debateTurns.map(dt => ({
          content: dt.content,
          debateId: dt.debate,
          createdAt: dt.createdAt
        })),
        comments: comments.map(c => ({
          content: c.content,
          postId: c.post,
          createdAt: c.createdAt
        })),
        posts: posts.map(p => ({
          content: p.content,
          postId: p._id,
          createdAt: p.createdAt
        }))
      };

    } catch (error) {
      console.error('Error gathering content sample:', error);
      return { debateTurns: [], comments: [], posts: [] };
    }
  }

  // ============================================
  // TRAIT EXTRACTION
  // ============================================

  /**
   * Extract personality traits from content using AI
   */
  /**
 * Extract personality traits from content using AI
 */
async extractTraits(userId, contentSample) {
    try {
      // Combine all content
      const allContent = [
        ...contentSample.debateTurns.map(dt => dt.content),
        ...contentSample.comments.map(c => c.content),
        ...contentSample.posts.map(p => p.content)
      ];
  
      if (allContent.length === 0) {
        return this.getDefaultTraits();
      }
  
      // Analyze with AI
      const prompt = `Analyze the following user-generated content and extract personality traits. Rate each trait on a scale of 0-100.
  
  Content samples:
  ${allContent.slice(0, 10).join('\n\n---\n\n')}
  
  CRITICAL: Return ONLY valid JSON with these EXACT fields and SINGLE values (no pipes or multiple options):
  
  {
    "tone": "<ONE of: analytical, emotional, sarcastic, supportive, aggressive, neutral, humorous>",
    "vocabularyComplexity": <number 0-100>,
    "aggressiveness": <number 0-100>,
    "empathy": <number 0-100>,
    "formality": <number 0-100>,
    "humor": <number 0-100>,
    "argumentativeStyle": "<ONE of: evidence-based, logical, emotional, rhetorical, balanced>"
  }
  
  Rules:
  - Choose ONLY ONE tone (the most dominant)
  - Choose ONLY ONE argumentativeStyle (the most dominant)
  - Do NOT use pipes (|) or multiple values
  - Return ONLY the JSON, no explanation`;
  
      const response = await grokService.generateFast(prompt, {
        temperature: 0.3,
        maxTokens: 300
      });
  
      // Parse AI response
      const traits = this.parseTraitsResponse(response);
      
      console.log('✅ Parsed traits:', traits);
      
      return traits;
  
    } catch (error) {
      console.error('Error extracting traits:', error);
      return this.getDefaultTraits();
    }
  }

  /**
   * Parse AI response into traits object
   */
 /**
 * Parse AI response into traits object
 */
parseTraitsResponse(response) {
  const result = structuredParserService.parseSync('personaTraits', response);
  if (result.success) {
    console.log('✅ Parsed persona traits (structured parser)');
    return result.data;
  }
  console.warn('⚠️ Persona trait parsing failed, using defaults:', result.error);
  return this.getDefaultTraits();
}



  /**
   * Default traits for new users
   */
  getDefaultTraits() {
    return {
      tone: 'neutral',
      vocabularyComplexity: 50,
      aggressiveness: 50,
      empathy: 50,
      formality: 50,
      humor: 50,
      argumentativeStyle: 'balanced'
    };
  }

  // ============================================
  // TOPIC IDENTIFICATION
  // ============================================

  /**
   * Identify topics user discusses
   */
  async identifyTopics(userId, contentSample, startDate) {
    try {
      const allContent = [
        ...contentSample.debateTurns.map(dt => dt.content),
        ...contentSample.comments.map(c => c.content),
        ...contentSample.posts.map(p => p.content)
      ].join(' ');

      if (!allContent.trim()) {
        return { primary: [], emerging: [], declining: [] };
      }

      // Use AI to extract topics
      const prompt = `Extract the top 5 main topics/themes from this user's content. Return ONLY a JSON array of topic strings.

Content: ${allContent.substring(0, 2000)}

Format: ["topic1", "topic2", "topic3", "topic4", "topic5"]`;

      const response = await grokService.generateFast(prompt, {
        temperature: 0.3,
        maxTokens: 150
      });

      const topics = this.parseTopicsResponse(response);

      // Get previous snapshot to detect emerging/declining topics
      const previousSnapshot = await PersonaSnapshot.findOne({
        userId,
        timestamp: { $lt: startDate }
      }).sort({ timestamp: -1 });

      const emerging = [];
      const declining = [];

      if (previousSnapshot?.topics?.primary) {
        const oldTopics = new Set(previousSnapshot.topics.primary);
        const newTopics = new Set(topics);

        // Emerging = in new but not in old
        topics.forEach(t => {
          if (!oldTopics.has(t)) emerging.push(t);
        });

        // Declining = in old but not in new
        previousSnapshot.topics.primary.forEach(t => {
          if (!newTopics.has(t)) declining.push(t);
        });
      }

      return {
        primary: topics,
        emerging: emerging.slice(0, 3),
        declining: declining.slice(0, 3)
      };

    } catch (error) {
      console.error('Error identifying topics:', error);
      return { primary: [], emerging: [], declining: [] };
    }
  }

  /**
   * Parse topics from AI response
   */
// REPLACE parseTopicsResponse():
parseTopicsResponse(response) {
  const result = structuredParserService.parseSync('topics', response);
  if (result.success) return result.data;
  console.warn('⚠️ Topic parsing failed:', result.error);
  return [];
}

  // ============================================
  // EMBEDDING GENERATION
  // ============================================

  /**
   * Generate persona embedding for similarity comparison
   */
  async generatePersonaEmbedding(contentSample, traits) {
    try {
      // Combine content with trait summary
      const contentText = [
        ...contentSample.debateTurns.map(dt => dt.content),
        ...contentSample.comments.map(c => c.content),
        ...contentSample.posts.map(p => p.content)
      ].join(' ').substring(0, 3000); // Limit to 3000 chars

      const traitSummary = `Tone: ${traits.tone}. Style: ${traits.argumentativeStyle}. Complexity: ${traits.vocabularyComplexity}/100.`;

      const fullText = `${traitSummary} ${contentText}`;

      // Generate embedding using vectorStoreService
      const embedding = await vectorStoreService.generateEmbedding(fullText);

      return embedding;

    } catch (error) {
      console.error('Error generating persona embedding:', error);
      return []; // Empty array fallback
    }
  }

  // ============================================
  // METRICS COLLECTION
  // ============================================

  /**
   * Collect activity metrics for the period
   */
  async collectMetrics(userId, startDate, endDate) {
    try {
      // Count activities
      const [debateCount, commentCount, postCount, slickCount] = await Promise.all([
        DebateTurn.countDocuments({ user: userId, createdAt: { $gte: startDate, $lte: endDate } }),
        Comment.countDocuments({ author: userId, createdAt: { $gte: startDate, $lte: endDate } }),
        Post.countDocuments({ author: userId, createdAt: { $gte: startDate, $lte: endDate } }),
        Slick.countDocuments({ author: userId, createdAt: { $gte: startDate, $lte: endDate } })
      ]);

      // Get performance data from UserPerformance
      const performance = await UserPerformance.findOne({ userId });

      return {
        totalDebates: debateCount,
        totalComments: commentCount,
        totalPosts: postCount,
        totalSlicks: slickCount,
        avgDebateScore: performance?.averageScore || 0,
        avgClarity: performance?.clarityScore || 0,
        avgTone: performance?.toneScore || 0,
        avgResponseTime: 0, // Can calculate later if needed
        participationRate: this.calculateParticipationRate(
          debateCount + commentCount + postCount,
          startDate,
          endDate
        )
      };

    } catch (error) {
      console.error('Error collecting metrics:', error);
      return {
        totalDebates: 0,
        totalComments: 0,
        totalPosts: 0,
        totalSlicks: 0,
        avgDebateScore: 0,
        avgClarity: 0,
        avgTone: 0,
        avgResponseTime: 0,
        participationRate: 0
      };
    }
  }

  /**
   * Calculate participation rate
   */
  calculateParticipationRate(totalActivities, startDate, endDate) {
    const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    if (daysDiff === 0) return 0;
    
    // Assume participation if at least 1 activity per day on average
    const activeDays = Math.min(totalActivities, daysDiff);
    return Math.round((activeDays / daysDiff) * 100);
  }

  // ============================================
  // DRIFT CALCULATION
  // ============================================

  /**
   * Calculate drift from previous snapshot
   */
  async calculateDrift(currentTraits, currentEmbedding, previousSnapshot) {
    try {
      const previousTraits = previousSnapshot.traits;
      const previousEmbedding = previousSnapshot.embedding;

      // 1. Calculate cosine similarity
      const cosineSimilarity = this.cosineSimilarity(currentEmbedding, previousEmbedding);

      // 2. Calculate trait changes
      const traitChanges = this.calculateTraitChanges(currentTraits, previousTraits);

      // 3. Calculate overall drift score (0-100)
      const overallDriftScore = Math.round((1 - cosineSimilarity) * 100);

      // 4. Identify significant changes
      const significantChanges = this.identifySignificantChanges(traitChanges);

      return {
        overallDriftScore,
        previousSnapshotId: previousSnapshot._id,
        cosineSimilarity,
        traitChanges,
        significantChanges
      };

    } catch (error) {
      console.error('Error calculating drift:', error);
      return null;
    }
  }

  /**
   * Cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA?.length || !vecB?.length || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Calculate changes in each trait
   */
  calculateTraitChanges(currentTraits, previousTraits) {
    const changes = [];

    const numericTraits = [
      'vocabularyComplexity',
      'aggressiveness',
      'empathy',
      'formality',
      'humor'
    ];

    numericTraits.forEach(trait => {
      const oldValue = previousTraits[trait] || 50;
      const newValue = currentTraits[trait] || 50;
      const percentChange = oldValue === 0 ? 0 : ((newValue - oldValue) / oldValue) * 100;

      changes.push({
        trait,
        oldValue,
        newValue,
        percentChange: Math.round(percentChange)
      });
    });

    return changes;
  }

  /**
   * Identify significant changes (threshold: 20% change or 15+ points)
   */
  identifySignificantChanges(traitChanges) {
    const significant = [];

    traitChanges.forEach(change => {
      const absoluteChange = Math.abs(change.newValue - change.oldValue);
      const percentChange = Math.abs(change.percentChange);

      if (absoluteChange >= 15 || percentChange >= 20) {
        const direction = change.newValue > change.oldValue ? 'increased' : 'decreased';
        const impact = absoluteChange >= 30 ? 'high' : absoluteChange >= 20 ? 'medium' : 'low';

        significant.push({
          type: change.trait,
          description: `${this.traitToLabel(change.trait)} ${direction} by ${absoluteChange} points`,
          impact
        });
      }
    });

    return significant;
  }

  /**
   * Convert trait key to readable label
   */
  traitToLabel(trait) {
    const labels = {
      vocabularyComplexity: 'Vocabulary complexity',
      aggressiveness: 'Aggressiveness',
      empathy: 'Empathy',
      formality: 'Formality',
      humor: 'Humor usage'
    };
    return labels[trait] || trait;
  }

  // ============================================
  // AI SUMMARY GENERATION
  // ============================================

  /**
   * Generate AI summary of persona state and changes
   */
  async generateSummary(traits, driftAnalysis, contentSample) {
    try {
      if (!driftAnalysis) {
        return `Initial persona snapshot. User exhibits ${traits.tone} tone with ${traits.argumentativeStyle} argumentative style.`;
      }

      const prompt = `Generate a brief 2-sentence summary of this user's persona evolution.

Current traits:
- Tone: ${traits.tone}
- Style: ${traits.argumentativeStyle}
- Vocabulary: ${traits.vocabularyComplexity}/100
- Empathy: ${traits.empathy}/100
- Formality: ${traits.formality}/100

Changes from previous snapshot:
${driftAnalysis.significantChanges.map(c => `- ${c.description} (${c.impact} impact)`).join('\n')}

Overall drift score: ${driftAnalysis.overallDriftScore}/100

Summary:`;

      const response = await grokService.generateFast(prompt, {
        temperature: 0.5,
        maxTokens: 150
      });

      return response.trim();

    } catch (error) {
      console.error('Error generating summary:', error);
      return 'Unable to generate persona summary.';
    }
  }

  // ============================================
  // TRIGGER LOGIC
  // ============================================

  /**
   * Check if snapshot should be triggered
   */
  async shouldTriggerSnapshot(userId, triggerType) {
    const latestSnapshot = await PersonaSnapshot.getLatest(userId);

    if (!latestSnapshot) return true; // Always create first snapshot

    const daysSinceLastSnapshot = Math.floor(
      (Date.now() - latestSnapshot.timestamp) / (1000 * 60 * 60 * 24)
    );

    switch (triggerType) {
      case 'time_interval':
        return daysSinceLastSnapshot >= 7; // Weekly snapshots

      case 'debate_count':
        const recentDebates = await DebateTurn.countDocuments({
          user: userId,
          createdAt: { $gt: latestSnapshot.timestamp }
        });
        return recentDebates >= 10; // Every 10 debates

      case 'user_request':
        return true; // Always allow manual requests

      default:
        return false;
    }
  }

  /**
   * Auto-trigger snapshot if conditions met
   */
  async triggerIfNeeded(userId, triggerType = 'time_interval') {
    try {
      const shouldTrigger = await this.shouldTriggerSnapshot(userId, triggerType);

      if (shouldTrigger) {
        console.log(`🎯 Triggering persona snapshot for user ${userId} (${triggerType})`);
        return await this.createSnapshot(userId, {
          snapshotType: 'automatic',
          trigger: triggerType
        });
      }

      return null;
    } catch (error) {
      console.error('Error in triggerIfNeeded:', error);
      return null;
    }
  }

  // ============================================
  // QUERY HELPERS
  // ============================================

  /**
   * Get drift timeline for user
   */
  async getDriftTimeline(userId, limit = 10) {
    try {
      const snapshots = await PersonaSnapshot.find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .select('timestamp traits driftAnalysis.overallDriftScore summary')
        .lean();

      return snapshots.map(s => ({
        timestamp: s.timestamp,
        driftScore: s.driftAnalysis?.overallDriftScore || 0,
        summary: s.summary,
        tone: s.traits?.tone
      }));

    } catch (error) {
      console.error('Error getting drift timeline:', error);
      return [];
    }
  }

  /**
   * Get persona evolution stats
   */
  async getEvolutionStats(userId) {
    try {
      const snapshots = await PersonaSnapshot.find({ userId })
        .sort({ timestamp: 1 })
        .select('timestamp traits metrics')
        .lean();

      if (snapshots.length < 2) {
        return { message: 'Not enough data for evolution analysis' };
      }

      const first = snapshots[0];
      const latest = snapshots[snapshots.length - 1];

      return {
        totalSnapshots: snapshots.length,
        firstSnapshot: first.timestamp,
        latestSnapshot: latest.timestamp,
        durationDays: Math.floor((latest.timestamp - first.timestamp) / (1000 * 60 * 60 * 24)),
        traitEvolution: {
          empathy: {
            start: first.traits?.empathy || 50,
            current: latest.traits?.empathy || 50,
            change: (latest.traits?.empathy || 50) - (first.traits?.empathy || 50)
          },
          formality: {
            start: first.traits?.formality || 50,
            current: latest.traits?.formality || 50,
            change: (latest.traits?.formality || 50) - (first.traits?.formality || 50)
          },
          vocabularyComplexity: {
            start: first.traits?.vocabularyComplexity || 50,
            current: latest.traits?.vocabularyComplexity || 50,
            change: (latest.traits?.vocabularyComplexity || 50) - (first.traits?.vocabularyComplexity || 50)
          }
        },
        activityEvolution: {
          debatesPerPeriod: {
            start: first.metrics?.totalDebates || 0,
            current: latest.metrics?.totalDebates || 0
          },
          avgDebateScore: {
            start: first.metrics?.avgDebateScore || 0,
            current: latest.metrics?.avgDebateScore || 0
          }
        }
      };

    } catch (error) {
      console.error('Error getting evolution stats:', error);
      throw error;
    }
  }
}

export const personaDriftService = new PersonaDriftService();