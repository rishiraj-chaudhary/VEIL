import Comment from '../models/comment.js';
import DebateTurn from '../models/debateTurn.js';
import PersonaSnapshot from '../models/PersonaSnapshot.js';
import Post from '../models/post.js';
import Slick from '../models/slick.js';
import UserPerformance from '../models/UserPerformance.js';
import embeddingService from './embeddingService.js'; // ← FIX 1: correct import
import grokService from './grokService.js';
import structuredParserService from './structuredParserService.js';

class PersonaDriftService {

  // ============================================
  // SNAPSHOT CREATION
  // ============================================

  async createSnapshot(userId, options = {}) {
    try {
      const {
        snapshotType = 'automatic',
        trigger = 'time_interval',
        periodDays = 30
      } = options;

      console.log(`📸 Creating persona snapshot for user ${userId}...`);

      const endDate   = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      const contentSample    = await this.gatherContentSample(userId, startDate, endDate);
      const traits           = await this.extractTraits(userId, contentSample);
      const topics           = await this.identifyTopics(userId, contentSample, startDate);
      const embedding        = await this.generatePersonaEmbedding(contentSample, traits);
      const metrics          = await this.collectMetrics(userId, startDate, endDate);
      const previousSnapshot = await PersonaSnapshot.getLatest(userId);
      const driftAnalysis    = previousSnapshot
        ? await this.calculateDrift(traits, embedding, previousSnapshot)
        : null;
      const summary = await this.generateSummary(traits, driftAnalysis, contentSample);

      // ── FIX 2: significantChanges must be plain objects, not serialized strings ──
      // Ensure each element is a plain object before saving
      const significantChanges = (driftAnalysis?.significantChanges || []).map(c => ({
        type:        String(c.type        || ''),
        description: String(c.description || ''),
        impact:      ['low', 'medium', 'high'].includes(c.impact) ? c.impact : 'low',
      }));

      // keyChanges uses a different schema shape — map from significantChanges
      const keyChanges = significantChanges.map(c => ({
        trait:       c.type,
        direction:   'stable',
        magnitude:   0,
        description: c.description,
      }));

      const snapshot = await PersonaSnapshot.create({
        userId,
        personaId:   null,
        timestamp:   new Date(),
        contentSample,
        traits,
        topics,
        embedding,
        metrics,
        summary,
        keyChanges,
        driftAnalysis: driftAnalysis
          ? {
              overallDriftScore:  driftAnalysis.overallDriftScore,
              previousSnapshotId: driftAnalysis.previousSnapshotId,
              cosineSimilarity:   driftAnalysis.cosineSimilarity,
              traitChanges:       driftAnalysis.traitChanges,
              significantChanges,    // ← plain objects guaranteed
            }
          : undefined,
        snapshotType,
        trigger,
        periodCovered: { startDate, endDate, durationDays: periodDays },
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

  async gatherContentSample(userId, startDate, endDate) {
    try {
      const [debateTurns, comments, posts] = await Promise.all([
        DebateTurn.find({ user: userId, createdAt: { $gte: startDate, $lte: endDate } })
          .sort({ createdAt: -1 }).limit(10).select('content debate createdAt').lean(),
        Comment.find({ author: userId, createdAt: { $gte: startDate, $lte: endDate } })
          .sort({ createdAt: -1 }).limit(15).select('content post createdAt').lean(),
        Post.find({ author: userId, createdAt: { $gte: startDate, $lte: endDate } })
          .sort({ createdAt: -1 }).limit(5).select('content _id createdAt').lean(),
      ]);

      return {
        debateTurns: debateTurns.map(dt => ({ content: dt.content, debateId: dt.debate, createdAt: dt.createdAt })),
        comments:    comments.map(c  => ({ content: c.content,  postId:  c.post,   createdAt: c.createdAt })),
        posts:       posts.map(p    => ({ content: p.content,  postId:  p._id,    createdAt: p.createdAt })),
      };
    } catch (error) {
      console.error('Error gathering content sample:', error);
      return { debateTurns: [], comments: [], posts: [] };
    }
  }

  // ============================================
  // TRAIT EXTRACTION
  // ============================================

  async extractTraits(userId, contentSample) {
    try {
      const allContent = [
        ...contentSample.debateTurns.map(dt => dt.content),
        ...contentSample.comments.map(c => c.content),
        ...contentSample.posts.map(p => p.content),
      ];

      if (allContent.length === 0) return this.getDefaultTraits();

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

      const response = await grokService.generateFast(prompt, { temperature: 0.3, maxTokens: 300 });
      const traits   = this.parseTraitsResponse(response);
      console.log('✅ Parsed traits:', traits);
      return traits;

    } catch (error) {
      console.error('Error extracting traits:', error);
      return this.getDefaultTraits();
    }
  }

  parseTraitsResponse(response) {
    const result = structuredParserService.parseSync('personaTraits', response);
    if (result.success) {
      console.log('✅ Parsed persona traits (structured parser)');
      return result.data;
    }
    console.warn('⚠️ Persona trait parsing failed, using defaults:', result.error);
    return this.getDefaultTraits();
  }

  getDefaultTraits() {
    return {
      tone: 'neutral',
      vocabularyComplexity: 50,
      aggressiveness: 50,
      empathy: 50,
      formality: 50,
      humor: 50,
      argumentativeStyle: 'balanced',
    };
  }

  // ============================================
  // TOPIC IDENTIFICATION
  // ============================================

  async identifyTopics(userId, contentSample, startDate) {
    try {
      const allContent = [
        ...contentSample.debateTurns.map(dt => dt.content),
        ...contentSample.comments.map(c => c.content),
        ...contentSample.posts.map(p => p.content),
      ].join(' ');

      if (!allContent.trim()) return { primary: [], emerging: [], declining: [] };

      const prompt = `Extract the top 5 main topics/themes from this user's content. Return ONLY a JSON array of topic strings.

Content: ${allContent.substring(0, 2000)}

Format: ["topic1", "topic2", "topic3", "topic4", "topic5"]`;

      const response = await grokService.generateFast(prompt, { temperature: 0.3, maxTokens: 150 });
      const topics   = this.parseTopicsResponse(response);

      const previousSnapshot = await PersonaSnapshot.findOne({
        userId,
        timestamp: { $lt: startDate },
      }).sort({ timestamp: -1 });

      const emerging  = [];
      const declining = [];

      if (previousSnapshot?.topics?.primary) {
        const oldTopics = new Set(previousSnapshot.topics.primary);
        const newTopics = new Set(topics);
        topics.forEach(t => { if (!oldTopics.has(t)) emerging.push(t); });
        previousSnapshot.topics.primary.forEach(t => { if (!newTopics.has(t)) declining.push(t); });
      }

      return { primary: topics, emerging: emerging.slice(0, 3), declining: declining.slice(0, 3) };

    } catch (error) {
      console.error('Error identifying topics:', error);
      return { primary: [], emerging: [], declining: [] };
    }
  }

  parseTopicsResponse(response) {
    const result = structuredParserService.parseSync('topics', response);
    if (result.success) return result.data;
    console.warn('⚠️ Topic parsing failed:', result.error);
    return [];
  }

  // ============================================
  // EMBEDDING GENERATION — FIX 1
  // ============================================

  async generatePersonaEmbedding(contentSample, traits) {
    try {
      const contentText = [
        ...contentSample.debateTurns.map(dt => dt.content),
        ...contentSample.comments.map(c => c.content),
        ...contentSample.posts.map(p => p.content),
      ].join(' ').substring(0, 3000);

      const traitSummary = `Tone: ${traits.tone}. Style: ${traits.argumentativeStyle}. Complexity: ${traits.vocabularyComplexity}/100.`;
      const fullText     = `${traitSummary} ${contentText}`;

      // ── FIX 1: use embeddingService.getEmbeddings().embedQuery() ─────────────
      if (!embeddingService.isReady()) {
        embeddingService.initialize();
      }
      const embedder  = embeddingService.getEmbeddings();
      const embedding = await embedder.embedQuery(fullText);
      return embedding;

    } catch (error) {
      console.error('Error generating persona embedding:', error);
      return [];
    }
  }

  // ============================================
  // METRICS COLLECTION
  // ============================================

  async collectMetrics(userId, startDate, endDate) {
    try {
      const [debateCount, commentCount, postCount, slickCount] = await Promise.all([
        DebateTurn.countDocuments({ user: userId, createdAt: { $gte: startDate, $lte: endDate } }),
        Comment.countDocuments({ author: userId, createdAt: { $gte: startDate, $lte: endDate } }),
        Post.countDocuments({ author: userId, createdAt: { $gte: startDate, $lte: endDate } }),
        Slick.countDocuments({ author: userId, createdAt: { $gte: startDate, $lte: endDate } }),
      ]);

      const performance = await UserPerformance.findOne({ user: userId });

      return {
        totalDebates:      debateCount,
        totalComments:     commentCount,
        totalPosts:        postCount,
        totalSlicks:       slickCount,
        avgDebateScore:    performance?.qualityMetrics?.avgOverallQuality || 0,
        avgClarity:        performance?.qualityMetrics?.avgClarityScore   || 0,
        avgTone:           performance?.qualityMetrics?.avgToneScore       || 0,
        avgResponseTime:   0,
        participationRate: this.calculateParticipationRate(
          debateCount + commentCount + postCount, startDate, endDate
        ),
      };
    } catch (error) {
      console.error('Error collecting metrics:', error);
      return { totalDebates: 0, totalComments: 0, totalPosts: 0, totalSlicks: 0, avgDebateScore: 0, avgClarity: 0, avgTone: 0, avgResponseTime: 0, participationRate: 0 };
    }
  }

  calculateParticipationRate(totalActivities, startDate, endDate) {
    const daysDiff  = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    if (daysDiff === 0) return 0;
    const activeDays = Math.min(totalActivities, daysDiff);
    return Math.round((activeDays / daysDiff) * 100);
  }

  // ============================================
  // DRIFT CALCULATION
  // ============================================

  async calculateDrift(currentTraits, currentEmbedding, previousSnapshot) {
    try {
      const previousTraits    = previousSnapshot.traits;
      const previousEmbedding = previousSnapshot.embedding;

      const cosineSim       = this.cosineSimilarity(currentEmbedding, previousEmbedding);
      const traitChanges    = this.calculateTraitChanges(currentTraits, previousTraits);
      const overallDrift    = Math.min(100, Math.max(0, Math.round((1 - cosineSim) * 100)));

      // ── FIX 2: return plain objects, not serialized strings ──────────────────
      const significantChanges = this.identifySignificantChanges(traitChanges);

      return {
        overallDriftScore:  overallDrift,
        previousSnapshotId: previousSnapshot._id,
        cosineSimilarity:   cosineSim,
        traitChanges,
        significantChanges,
      };
    } catch (error) {
      console.error('Error calculating drift:', error);
      return null;
    }
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA?.length || !vecB?.length || vecA.length !== vecB.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot   += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  calculateTraitChanges(currentTraits, previousTraits) {
    return ['vocabularyComplexity', 'aggressiveness', 'empathy', 'formality', 'humor'].map(trait => {
      const oldValue      = previousTraits[trait] || 50;
      const newValue      = currentTraits[trait]  || 50;
      const percentChange = oldValue === 0 ? 0 : ((newValue - oldValue) / oldValue) * 100;
      return { trait, oldValue, newValue, percentChange: Math.round(percentChange) };
    });
  }

  identifySignificantChanges(traitChanges) {
    const significant = [];
    for (const change of traitChanges) {
      const abs = Math.abs(change.newValue - change.oldValue);
      const pct = Math.abs(change.percentChange);
      if (abs >= 15 || pct >= 20) {
        const direction = change.newValue > change.oldValue ? 'increased' : 'decreased';
        const impact    = abs >= 30 ? 'high' : abs >= 20 ? 'medium' : 'low';
        // ── Return a plain object — NOT a string ────────────────────────────────
        significant.push({
          type:        change.trait,
          description: `${this.traitToLabel(change.trait)} ${direction} by ${abs} points`,
          impact,
        });
      }
    }
    return significant;
  }

  traitToLabel(trait) {
    const labels = {
      vocabularyComplexity: 'Vocabulary complexity',
      aggressiveness:       'Aggressiveness',
      empathy:              'Empathy',
      formality:            'Formality',
      humor:                'Humor usage',
    };
    return labels[trait] || trait;
  }

  // ============================================
  // AI SUMMARY
  // ============================================

  async generateSummary(traits, driftAnalysis, contentSample) {
    try {
      if (!driftAnalysis) {
        return `Initial persona snapshot. User exhibits ${traits.tone} tone with ${traits.argumentativeStyle} argumentative style.`;
      }

      const changesText = (driftAnalysis.significantChanges || [])
        .map(c => `- ${c.description} (${c.impact} impact)`)
        .join('\n') || '- No significant changes';

      const prompt = `Generate a brief 2-sentence summary of this user's persona evolution.

Current traits:
- Tone: ${traits.tone}
- Style: ${traits.argumentativeStyle}
- Vocabulary: ${traits.vocabularyComplexity}/100
- Empathy: ${traits.empathy}/100
- Formality: ${traits.formality}/100

Changes from previous snapshot:
${changesText}

Overall drift score: ${driftAnalysis.overallDriftScore}/100

Summary:`;

      const response = await grokService.generateFast(prompt, { temperature: 0.5, maxTokens: 150 });
      return response.trim();

    } catch (error) {
      console.error('Error generating summary:', error);
      return 'Unable to generate persona summary.';
    }
  }

  // ============================================
  // TRIGGER LOGIC
  // ============================================

  async shouldTriggerSnapshot(userId, triggerType) {
    const latestSnapshot = await PersonaSnapshot.getLatest(userId);
    if (!latestSnapshot) return true;

    const daysSince = Math.floor((Date.now() - latestSnapshot.timestamp) / (1000 * 60 * 60 * 24));

    switch (triggerType) {
      case 'time_interval':
        return daysSince >= 7;
      case 'debate_count': {
        const recentDebates = await DebateTurn.countDocuments({
          user: userId, createdAt: { $gt: latestSnapshot.timestamp },
        });
        return recentDebates >= 10;
      }
      case 'user_request':
        return true;
      default:
        return false;
    }
  }

  async triggerIfNeeded(userId, triggerType = 'time_interval') {
    try {
      const shouldTrigger = await this.shouldTriggerSnapshot(userId, triggerType);
      if (shouldTrigger) {
        console.log(`🎯 Triggering persona snapshot for user ${userId} (${triggerType})`);
        return await this.createSnapshot(userId, { snapshotType: 'automatic', trigger: triggerType });
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

  async getDriftTimeline(userId, limit = 10) {
    try {
      const snapshots = await PersonaSnapshot.find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .select('timestamp traits driftAnalysis.overallDriftScore summary')
        .lean();

      return snapshots.map(s => ({
        timestamp:  s.timestamp,
        driftScore: s.driftAnalysis?.overallDriftScore || 0,
        summary:    s.summary,
        tone:       s.traits?.tone,
      }));
    } catch (error) {
      console.error('Error getting drift timeline:', error);
      return [];
    }
  }

  async getEvolutionStats(userId) {
    try {
      const snapshots = await PersonaSnapshot.find({ userId })
        .sort({ timestamp: 1 })
        .select('timestamp traits metrics')
        .lean();

      if (snapshots.length < 2) return { message: 'Not enough data for evolution analysis' };

      const first  = snapshots[0];
      const latest = snapshots[snapshots.length - 1];

      return {
        totalSnapshots: snapshots.length,
        firstSnapshot:  first.timestamp,
        latestSnapshot: latest.timestamp,
        durationDays:   Math.floor((latest.timestamp - first.timestamp) / (1000 * 60 * 60 * 24)),
        traitEvolution: {
          empathy:              { start: first.traits?.empathy              || 50, current: latest.traits?.empathy              || 50, change: (latest.traits?.empathy              || 50) - (first.traits?.empathy              || 50) },
          formality:            { start: first.traits?.formality            || 50, current: latest.traits?.formality            || 50, change: (latest.traits?.formality            || 50) - (first.traits?.formality            || 50) },
          vocabularyComplexity: { start: first.traits?.vocabularyComplexity || 50, current: latest.traits?.vocabularyComplexity || 50, change: (latest.traits?.vocabularyComplexity || 50) - (first.traits?.vocabularyComplexity || 50) },
        },
        activityEvolution: {
          debatesPerPeriod: { start: first.metrics?.totalDebates  || 0, current: latest.metrics?.totalDebates  || 0 },
          avgDebateScore:   { start: first.metrics?.avgDebateScore || 0, current: latest.metrics?.avgDebateScore || 0 },
        },
      };
    } catch (error) {
      console.error('Error getting evolution stats:', error);
      throw error;
    }
  }
}

export const personaDriftService = new PersonaDriftService();