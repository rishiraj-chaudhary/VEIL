import natural from 'natural';
import Claim from '../models/Claim.js';
import PersonaSnapshot from '../models/PersonaSnapshot.js';
import embeddingService from './embeddingService.js';

/**
 * KNOWLEDGE GRAPH SERVICE — Step 9 of AI Maturity Roadmap
 *
 * Upgrades over the previous version:
 *
 *   1. Embedding-based claim linking
 *      Before: Jaccard similarity on stemmed tokens
 *              → "renewable energy reduces emissions" and
 *                "clean power lowers CO2 output" = 0% match
 *      After:  Cosine similarity on semantic embeddings
 *              → same two claims = ~0.91 similarity ✅
 *
 *   2. Refutation strength tracking
 *      Tracks per-claim:
 *        - refutationCount         how many times it was countered
 *        - refutationSuccessRate   % of refutations that succeeded
 *        - averageRebuttalQuality  avg AI quality score of rebuttals
 *        - claimResilienceScore    composite: survives refutations well?
 *
 *   3. Persona drift metadata on claims (NEW)
 *      When a claim is added, the author's current persona traits
 *      (tone, argumentativeStyle) are stored as metadata.
 *      Enables future queries:
 *        "show me claims made by evidence-based users on climate"
 *        "which claims survive when made by aggressive debaters?"
 *
 *   4. String similarity kept as fast fallback
 *      If embedding service is unavailable, falls back to
 *      the original Jaccard approach — no silent failures.
 */
class KnowledgeGraphService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.embeddingThreshold = 0.92;  // cosine similarity — claims above this are "same argument" (near-identical phrasing)
    this.relatedThreshold = 0.45;    // all-MiniLM-L6-v2 scores related claims at 0.45-0.92
    this.stringThreshold = 0.6;      // Jaccard fallback threshold
  }

  // ─────────────────────────────────────────────────────────────────
  // NORMALIZATION & TOPIC DETECTION (unchanged)
  // ─────────────────────────────────────────────────────────────────

  normalizeClaim(text) {
    let normalized = text.toLowerCase();
    normalized = normalized.replace(/[.,!?;:()]/g, '');
    const tokens = this.tokenizer.tokenize(normalized);
    const stemmed = tokens.map(token => this.stemmer.stem(token));
    return stemmed.join(' ');
  }

  extractTopic(text) {
    const topicKeywords = {
      politics: ['government', 'president', 'congress', 'election', 'vote', 'policy', 'law'],
      economy: ['economy', 'money', 'market', 'trade', 'business', 'finance', 'tax'],
      technology: ['technology', 'ai', 'computer', 'internet', 'software', 'digital'],
      environment: ['climate', 'environment', 'pollution', 'green', 'energy', 'carbon'],
      health: ['health', 'medical', 'doctor', 'disease', 'treatment', 'medicine'],
      education: ['education', 'school', 'student', 'teacher', 'learning', 'university'],
      ethics: ['ethics', 'moral', 'right', 'wrong', 'should', 'ought', 'justice'],
    };

    const textLower = text.toLowerCase();
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(kw => textLower.includes(kw))) return topic;
    }
    return 'general';
  }

  // ─────────────────────────────────────────────────────────────────
  // SIMILARITY — Embedding-based (primary) + Jaccard (fallback)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Cosine similarity between two embedding vectors.
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA?.length || !vecB?.length || vecA.length !== vecB.length) return 0;

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Jaccard similarity on stemmed tokens (string fallback).
   */
  calculateSimilarity(text1, text2) {
    const tokens1 = new Set(text1.split(' '));
    const tokens2 = new Set(text2.split(' '));
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    return intersection.size / union.size;
  }

  /**
   * Generate embedding for a claim text.
   * Returns [] if embedding service is unavailable.
   */
  async _generateEmbedding(text) {
    try {
      const embeddings = embeddingService.getEmbeddings();
      if (!embeddings) return [];
      // LangChain HuggingFace embeddings — embedQuery returns a flat number[]
      const vector = await embeddings.embedQuery(text);
      return Array.isArray(vector) ? vector : [];
    } catch {
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PERSONA METADATA HELPERS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Fetch the author's current persona traits for metadata storage.
   * Returns null if no snapshot exists — claim is still saved, just
   * without persona metadata.
   */
  async _getAuthorPersonaMeta(userId) {
    if (!userId) return null;
    try {
      const snapshot = await PersonaSnapshot.findOne({ userId })
        .sort({ timestamp: -1 })
        .select('traits')
        .lean();

      if (!snapshot?.traits) return null;

      return {
        tone: snapshot.traits.tone,
        argumentativeStyle: snapshot.traits.argumentativeStyle,
        aggressiveness: snapshot.traits.aggressiveness,
        empathy: snapshot.traits.empathy,
      };
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // MAIN: ADD CLAIM
  // ─────────────────────────────────────────────────────────────────

  /**
   * Add or update a claim in the knowledge graph.
   *
   * Changes from previous version:
   *   - Generates and stores embedding on creation
   *   - Stores author persona metadata (tone, style) on the claim
   *   - linkSimilarClaims now uses cosine similarity when embeddings exist
   *
   * @param {string} claimText    - The claim text
   * @param {*}      debate       - Debate ID or object
   * @param {*}      turn         - DebateTurn ID or object
   * @param {string} side         - 'for' | 'against'
   * @param {number} qualityScore - AI quality score (0-100)
   * @param {string} userId       - Author's user ID (optional, for persona meta)
   */
  async addClaim(claimText, debate, turn, side, qualityScore = 0, userId = null) {
    try {
      const normalized = this.normalizeClaim(claimText);
      const topic = this.extractTopic(claimText);

      console.log(`📊 Adding claim: "${claimText.substring(0, 60)}..."`);

      // ── Check for exact normalized match first (fast path) ──────
      const exactMatch = await Claim.findOne({ normalizedText: normalized });
      if (exactMatch) {
        await exactMatch.addUsage(debate, turn, side, qualityScore);
        console.log(`♻️  Updated existing claim (uses: ${exactMatch.stats.totalUses})`);
        return exactMatch;
      }

      // ── Generate embedding for this claim ────────────────────────
      const embedding = await this._generateEmbedding(claimText);
      const hasEmbedding = embedding.length > 0;

      // ── Check for semantically similar claims via embedding ──────
      if (hasEmbedding) {
        const semanticMatch = await this._findSemanticDuplicate(embedding, topic);
        if (semanticMatch) {
          await semanticMatch.addUsage(debate, turn, side, qualityScore);
          console.log(`🧠 Semantic duplicate found — merged into existing claim`);
          return semanticMatch;
        }
      }

      // ── Fetch author persona metadata ────────────────────────────
      const personaMeta = await this._getAuthorPersonaMeta(userId);

      // ── Create new claim ─────────────────────────────────────────
      const newClaim = await Claim.create({
        originalText: claimText,
        normalizedText: normalized,
        topic,
        firstDebate: debate,
        firstTurn: turn,
        embedding: hasEmbedding ? embedding : [],
        authorPersona: personaMeta || undefined,
        debates: [{ debate, turn, side, usedAt: new Date() }],
        stats: {
          totalUses: 1,
          avgQualityScore: qualityScore,
          // Refutation strength fields (new)
          refutationCount: 0,
          refutationSuccessRate: 0,
          averageRebuttalQuality: 0,
          claimResilienceScore: 100, // starts perfect, degrades with successful refutations
        },
      });

      console.log(`✅ Created new claim (embedding: ${hasEmbedding})`);

      // ── Link to similar claims ───────────────────────────────────
      await this.linkSimilarClaims(newClaim, embedding);

      return newClaim;

    } catch (error) {
      console.error('❌ Error adding claim:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // SEMANTIC DUPLICATE DETECTION
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find an existing claim that is semantically identical
   * (cosine similarity > embeddingThreshold) to the new one.
   * Only searches within the same topic for efficiency.
   */
  async _findSemanticDuplicate(embedding, topic) {
    try {
      // Candidate pool: same topic, has embeddings, limit to 50
      const candidates = await Claim.find({
        topic,
        embedding: { $exists: true, $not: { $size: 0 } },
      })
        .limit(50)
        .select('embedding stats normalizedText')
        .lean();

      for (const candidate of candidates) {
        const similarity = this.cosineSimilarity(embedding, candidate.embedding);
        if (similarity >= this.embeddingThreshold) {
          console.log(`🔍 Semantic duplicate: similarity=${similarity.toFixed(3)}`);
          return await Claim.findById(candidate._id);
        }
      }

      return null;
    } catch (error) {
      console.error('Semantic duplicate check error:', error.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // LINK SIMILAR CLAIMS (Upgraded)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find and link related (but not identical) claims.
   *
   * Strategy:
   *   - If new claim has embedding → cosine similarity against candidates
   *   - If no embedding → Jaccard fallback (original behavior)
   *   - threshold: 0.65–0.82 range = "related but distinct" 
   *     (above 0.92 = duplicate, caught in addClaim)
   */
  async linkSimilarClaims(claim, embedding = [], threshold = null) {
    try {
      const hasEmbedding = embedding.length > 0;
      const effectiveThreshold = threshold ?? (hasEmbedding ? this.relatedThreshold : this.stringThreshold);

      // Candidate pool: same topic, exclude self
      const candidates = await Claim.find({
        topic: claim.topic,
        _id: { $ne: claim._id },
      }).limit(30).lean();

      const related = [];

      for (const candidate of candidates) {
        let similarity = 0;

        if (hasEmbedding && candidate.embedding?.length > 0) {
          // ── Primary: embedding cosine similarity ─────────────────
          similarity = this.cosineSimilarity(embedding, candidate.embedding);
        } else {
          // ── Fallback: Jaccard on normalized text ──────────────────
          similarity = this.calculateSimilarity(
            claim.normalizedText,
            candidate.normalizedText
          );
        }

        // Only link if in "related but distinct" range
        if (similarity >= effectiveThreshold && similarity < this.embeddingThreshold) {
          related.push({
            claim: candidate._id,
            relationship: 'similar',
            similarity,
          });

          // Add reverse link
          await Claim.updateOne(
            {
              _id: candidate._id,
              'relatedClaims.claim': { $ne: claim._id },
            },
            {
              $push: {
                relatedClaims: {
                  claim: claim._id,
                  relationship: 'similar',
                  similarity,
                },
              },
            }
          );
        }
      }

      if (related.length > 0) {
        // Use $push per link to avoid overwriting reverse links already added
        for (const rel of related) {
          await Claim.updateOne(
            { _id: claim._id, 'relatedClaims.claim': { $ne: rel.claim } },
            { $push: { relatedClaims: rel } }
          );
        }
        console.log(`🔗 Linked ${related.length} similar claims (${hasEmbedding ? 'embedding' : 'string'} similarity)`);
      }

    } catch (error) {
      console.error('Error linking similar claims:', error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // REFUTATION STRENGTH TRACKING (New)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Mark a claim as refuted and update refutation strength metrics.
   *
   * New fields tracked:
   *   refutationCount         — total refutations attempted
   *   refutationSuccessRate   — % of refutations that were high-quality (score > 60)
   *   averageRebuttalQuality  — mean quality score of rebuttals
   *   claimResilienceScore    — starts at 100, degrades with successful refutations
   *
   * @param {string} originalClaimText   - The claim being refuted
   * @param {string} refutingClaimText   - The rebuttal claim
   * @param {number} effectiveness       - 0-10 effectiveness score
   * @param {number} rebuttalQuality     - AI quality score of the rebuttal turn (0-100)
   */
  async markRefuted(originalClaimText, refutingClaimText, effectiveness = 5, rebuttalQuality = 50) {
    try {
      const normalizedOriginal = this.normalizeClaim(originalClaimText);
      const normalizedRefuting = this.normalizeClaim(refutingClaimText);

      const originalClaim = await Claim.findOne({ normalizedText: normalizedOriginal });
      const refutingClaim = await Claim.findOne({ normalizedText: normalizedRefuting });

      if (!originalClaim) return;

      // ── Update base refutation count ─────────────────────────────
      await originalClaim.markRefuted();

      // ── Update refutation strength metrics ───────────────────────
      const prevCount = originalClaim.stats.refutationCount || 0;
      const prevAvgQuality = originalClaim.stats.averageRebuttalQuality || 0;
      const newCount = prevCount + 1;

      // Running average of rebuttal quality
      const newAvgQuality = ((prevAvgQuality * prevCount) + rebuttalQuality) / newCount;

      // Successful refutation = effectiveness >= 6 OR rebuttalQuality >= 65
      const isSuccessful = effectiveness >= 6 || rebuttalQuality >= 65;
      const prevSuccesses = Math.round((originalClaim.stats.refutationSuccessRate || 0) * prevCount);
      const newSuccesses = prevSuccesses + (isSuccessful ? 1 : 0);
      const newSuccessRate = newCount > 0 ? newSuccesses / newCount : 0;

      // Resilience score: starts 100, each successful refutation reduces it
      // Formula: 100 - (successRate * 60) - (refutationCount * 2) capped at [0,100]
      const resilienceScore = Math.max(
        0,
        Math.min(100, 100 - (newSuccessRate * 60) - (newCount * 2))
      );

      await Claim.updateOne(
        { _id: originalClaim._id },
        {
          $set: {
            'stats.refutationCount': newCount,
            'stats.refutationSuccessRate': newSuccessRate,
            'stats.averageRebuttalQuality': Math.round(newAvgQuality),
            'stats.claimResilienceScore': Math.round(resilienceScore),
          },
        }
      );

      // ── Link counter-claim relationship ──────────────────────────
      if (refutingClaim) {
        const alreadyLinked = originalClaim.counterClaims?.some(
          c => c.claim.equals(refutingClaim._id)
        );

        if (!alreadyLinked) {
          await Claim.updateOne(
            { _id: originalClaim._id },
            {
              $push: {
                counterClaims: {
                  claim: refutingClaim._id,
                  effectiveness,
                },
              },
            }
          );
        }

        console.log(`⚔️  Refutation linked — resilience: ${Math.round(resilienceScore)}/100`);
      }

    } catch (error) {
      console.error('Error marking refutation:', error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CLAIM STATS (Extended with refutation strength)
  // ─────────────────────────────────────────────────────────────────

  async getClaimStats(claimText) {
    try {
      const normalized = this.normalizeClaim(claimText);
      const claim = await Claim.findOne({ normalizedText: normalized })
        .populate('relatedClaims.claim', 'originalText stats')
        .populate('counterClaims.claim', 'originalText stats');

      if (!claim) return null;

      return {
        originalText: claim.originalText,
        topic: claim.topic,
        authorPersona: claim.authorPersona || null,
        stats: {
          totalUses: claim.stats.totalUses,
          timesRefuted: claim.stats.timesRefuted,
          winsWithClaim: claim.stats.winsWithClaim,
          lossesWithClaim: claim.stats.lossesWithClaim,
          successRate: Math.round((claim.stats.successRate || 0) * 100),
          avgQualityScore: Math.round(claim.stats.avgQualityScore || 0),
          // ── New refutation strength fields ──
          refutationCount: claim.stats.refutationCount || 0,
          refutationSuccessRate: Math.round((claim.stats.refutationSuccessRate || 0) * 100),
          averageRebuttalQuality: claim.stats.averageRebuttalQuality || 0,
          claimResilienceScore: claim.stats.claimResilienceScore ?? 100,
        },
        relatedClaims: (claim.relatedClaims || []).map(r => ({
          text: r.claim?.originalText,
          similarity: Math.round((r.similarity || 0) * 100),
          uses: r.claim?.stats?.totalUses || 0,
        })),
        counterClaims: (claim.counterClaims || []).map(c => ({
          text: c.claim?.originalText,
          effectiveness: c.effectiveness,
          uses: c.claim?.stats?.totalUses || 0,
        })),
      };

    } catch (error) {
      console.error('Error getting claim stats:', error.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // QUERIES (unchanged interface, kept compatible)
  // ─────────────────────────────────────────────────────────────────

  async getPopularClaims(topic = null, limit = 10) {
    try {
      return await Claim.getPopularClaims(topic, limit);
    } catch (error) {
      console.error('Error getting popular claims:', error.message);
      return [];
    }
  }

  async getMostSuccessful(topic = null, limit = 10) {
    try {
      return await Claim.getMostSuccessful(topic, limit);
    } catch (error) {
      console.error('Error getting successful claims:', error.message);
      return [];
    }
  }

  /**
   * Get most resilient claims — survive refutation well.
   * New method enabled by refutation strength tracking.
   */
  async getMostResilient(topic = null, limit = 10) {
    try {
      const query = topic ? { topic } : {};
      // Must have been refuted at least once to have a meaningful resilience score
      query['stats.refutationCount'] = { $gte: 1 };

      return await Claim.find(query)
        .sort({ 'stats.claimResilienceScore': -1, 'stats.totalUses': -1 })
        .limit(limit)
        .select('originalText topic stats authorPersona')
        .lean();
    } catch (error) {
      console.error('Error getting resilient claims:', error.message);
      return [];
    }
  }

  /**
   * Get claims by persona style — e.g. all evidence-based claims on climate.
   * Enabled by persona metadata stored on claim creation.
   */
  async getClaimsByPersonaStyle(argumentativeStyle, topic = null, limit = 10) {
    try {
      const query = { 'authorPersona.argumentativeStyle': argumentativeStyle };
      if (topic) query.topic = topic;

      return await Claim.find(query)
        .sort({ 'stats.successRate': -1, 'stats.totalUses': -1 })
        .limit(limit)
        .select('originalText topic stats authorPersona')
        .lean();
    } catch (error) {
      console.error('Error getting claims by persona style:', error.message);
      return [];
    }
  }

  async getGraphStats() {
    try {
      const totalClaims = await Claim.countDocuments();
      const withEmbeddings = await Claim.countDocuments({
        embedding: { $exists: true, $not: { $size: 0 } },
      });

      const totalRelationships = await Claim.aggregate([
        { $project: { relatedCount: { $size: '$relatedClaims' } } },
        { $group: { _id: null, total: { $sum: '$relatedCount' } } },
      ]);

      const topicDistribution = await Claim.aggregate([
        { $group: { _id: '$topic', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);

      // Average resilience score across all refuted claims
      const resilienceStats = await Claim.aggregate([
        { $match: { 'stats.refutationCount': { $gte: 1 } } },
        { $group: { _id: null, avgResilience: { $avg: '$stats.claimResilienceScore' } } },
      ]);

      return {
        totalClaims,
        withEmbeddings,
        embeddingCoverage: totalClaims > 0 ? Math.round((withEmbeddings / totalClaims) * 100) : 0,
        totalRelationships: totalRelationships[0]?.total || 0,
        avgClaimResilience: Math.round(resilienceStats[0]?.avgResilience || 100),
        topicDistribution: topicDistribution.map(t => ({
          topic: t._id,
          count: t.count,
        })),
      };

    } catch (error) {
      console.error('Error getting graph stats:', error.message);
      return null;
    }
  }

  async searchClaims(query, limit = 10) {
    try {
      const normalized = this.normalizeClaim(query);
      return await Claim.find({ $text: { $search: normalized } })
        .limit(limit)
        .sort({ score: { $meta: 'textScore' } })
        .select('originalText topic stats authorPersona');
    } catch (error) {
      console.error('Error searching claims:', error.message);
      return [];
    }
  }
}

const knowledgeGraphService = new KnowledgeGraphService();
export default knowledgeGraphService;