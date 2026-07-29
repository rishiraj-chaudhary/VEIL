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
 *   4. Embedding-only similarity
 *      The Jaccard fallback was removed once every claim had a vector: word
 *      overlap linked unrelated claims sharing common vocabulary, and keeping
 *      two metrics meant keeping two threshold scales that had already been
 *      compared against each other by mistake.
 */
// Pseudo-count of "neutral" refutation attempts, so early results carry less weight.
const RESILIENCE_CONFIDENCE_PRIOR = 5;

class KnowledgeGraphService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.embeddingThreshold = 0.92;  // cosine similarity — claims above this are "same argument" (near-identical phrasing)
    this.relatedThreshold = 0.45;    // all-MiniLM-L6-v2 scores related claims at 0.45-0.92
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
  // SIMILARITY — Embedding-based (cosine)
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
        await exactMatch.addUsage(debate, turn, side, qualityScore, userId);
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
          await semanticMatch.addUsage(debate, turn, side, qualityScore, userId);
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
        author: userId || null,
        embedding: hasEmbedding ? embedding : [],
        authorPersona: personaMeta || undefined,
        debates: [{ debate, turn, user: userId || null, side, usedAt: new Date() }],
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

      // Candidate pool: same topic, exclude self
      const candidates = await Claim.find({
        topic: claim.topic,
        _id: { $ne: claim._id },
      }).limit(30).lean();

      const related = [];

      // Embedding-only. The Jaccard fallback was removed once every claim had a
      // vector: word overlap linked unrelated claims that happened to share
      // vocabulary, and maintaining two metrics meant maintaining two threshold
      // scales — which had already been compared against each other by mistake.
      if (!hasEmbedding) {
        console.warn('linkSimilarClaims called without an embedding — skipping');
        return [];
      }

      for (const candidate of candidates) {
        if (!candidate.embedding?.length) continue;

        const similarity = this.cosineSimilarity(embedding, candidate.embedding);

        const lowerBound = threshold ?? this.relatedThreshold;
        const upperBound = this.embeddingThreshold;

        // Only link if in "related but distinct" range
        if (similarity >= lowerBound && similarity < upperBound) {
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
        console.log(`🔗 Linked ${related.length} similar claims (cosine similarity)`);
      }

      // Returned as well as persisted so callers and tests can assert on the
      // links; every exit path now returns an array rather than sometimes
      // undefined.
      return related;

    } catch (error) {
      console.error('Error linking similar claims:', error.message);
      return [];
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

      return this.recordRefutation(originalClaim, refutingClaim, effectiveness, rebuttalQuality);
    } catch (error) {
      console.error('Error marking refutation:', error.message);
    }
  }

  /**
   * Records a refutation against a claim already resolved to a document.
   *
   * Text-based lookup only ever matched a verbatim restatement of the claim,
   * which real rebuttals never contain — so callers should identify the target
   * semantically (see refutationDetectionService) and pass the document here.
   *
   * @param {Object} originalClaim - Claim document being refuted
   * @param {Object|null} refutingClaim - Claim document doing the refuting
   * @param {number} effectiveness - 0-10 effectiveness score
   * @param {number} rebuttalQuality - 0-100 AI quality score of the rebuttal
   */
  /**
   * Did the rebuttal actually undermine the claim?
   *
   * `effectiveness` is the judge's verdict on the rebuttal's force.
   * `rebuttalQuality` is how well it is *written* — a different question. These
   * were combined with OR, so any competently written turn counted as
   * demolishing whatever it addressed, and every contested claim in the
   * database ended up with a success rate of 0.88-1.00. Quality now only breaks
   * ties at the threshold rather than substituting for the verdict.
   */
  _isRefutationSuccessful(effectiveness, rebuttalQuality) {
    return effectiveness >= 6 || (effectiveness >= 5 && rebuttalQuality >= 75);
  }

  async recordRefutation(originalClaim, refutingClaim = null, effectiveness = 5, rebuttalQuality = 50) {
    try {
      if (!originalClaim) return;

      const isSuccessful = this._isRefutationSuccessful(effectiveness, rebuttalQuality);

      // Counters are incremented atomically in a single round trip.
      //
      // This previously read the document, computed new totals in JS, then wrote
      // them back. Two refutations of the same claim arriving together — routine,
      // since a turn can target three claims and the job queue runs three workers
      // — both read the same starting count and both wrote count+1, silently
      // losing one. A measured run recorded 2 of 3 concurrent refutations.
      //
      // Successes are also stored as a count rather than reconstructed from the
      // stored rate, which was lossy and could not be incremented atomically.
      const updated = await Claim.findOneAndUpdate(
        { _id: originalClaim._id },
        {
          $inc: {
            'stats.refutationCount': 1,
            'stats.timesRefuted': 1,
            'stats.refutationSuccesses': isSuccessful ? 1 : 0,
          },
        },
        { new: true },
      );

      if (!updated) return null;

      const newCount     = updated.stats.refutationCount;
      const newSuccesses = updated.stats.refutationSuccesses ?? 0;
      const newSuccessRate = newCount > 0 ? newSuccesses / newCount : 0;

      // Running average of rebuttal quality, using the post-increment count.
      const prevAvgQuality = originalClaim.stats.averageRebuttalQuality || 0;
      const newAvgQuality = newCount > 1
        ? ((prevAvgQuality * (newCount - 1)) + rebuttalQuality) / newCount
        : rebuttalQuality;

      // Resilience = how often the claim survives refutation attempts.
      // Attempt count is a confidence weight, not a penalty: surviving 40
      // attacks must rank above surviving one, and a claim that has only ever
      // been attacked once stays near the neutral midpoint either way.
      const survivalRate = 1 - newSuccessRate;
      const confidence   = newCount / (newCount + RESILIENCE_CONFIDENCE_PRIOR);
      const resilienceScore = Math.max(0, Math.min(100,
        100 * (0.5 + (survivalRate - 0.5) * confidence)
      ));

      await Claim.updateOne(
        { _id: originalClaim._id },
        {
          $set: {
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

      return { refutationCount: newCount, resilienceScore: Math.round(resilienceScore), isSuccessful };

    } catch (error) {
      console.error('Error recording refutation:', error.message);
      return null;
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