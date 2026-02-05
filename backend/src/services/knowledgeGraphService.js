import natural from 'natural';
import Claim from '../models/Claim.js';

/**
 * ARGUMENT KNOWLEDGE GRAPH SERVICE
 * 
 * Tracks claims across debates, identifies patterns,
 * and builds relationships between arguments
 */

class KnowledgeGraphService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
  }

  /**
   * Normalize claim text for matching
   */
  normalizeClaim(text) {
    // Convert to lowercase
    let normalized = text.toLowerCase();

    // Remove punctuation
    normalized = normalized.replace(/[.,!?;:()]/g, '');

    // Tokenize and stem
    const tokens = this.tokenizer.tokenize(normalized);
    const stemmed = tokens.map(token => this.stemmer.stem(token));

    return stemmed.join(' ');
  }

  /**
   * Extract topic from claim (simple keyword-based)
   */
  extractTopic(text) {
    const topicKeywords = {
      'politics': ['government', 'president', 'congress', 'election', 'vote', 'policy', 'law'],
      'economy': ['economy', 'money', 'market', 'trade', 'business', 'finance', 'tax'],
      'technology': ['technology', 'ai', 'computer', 'internet', 'software', 'digital'],
      'environment': ['climate', 'environment', 'pollution', 'green', 'energy', 'carbon'],
      'health': ['health', 'medical', 'doctor', 'disease', 'treatment', 'medicine'],
      'education': ['education', 'school', 'student', 'teacher', 'learning', 'university'],
      'ethics': ['ethics', 'moral', 'right', 'wrong', 'should', 'ought', 'justice']
    };

    const textLower = text.toLowerCase();
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => textLower.includes(keyword))) {
        return topic;
      }
    }

    return 'general';
  }

  /**
   * Calculate similarity between two normalized texts
   */
  calculateSimilarity(text1, text2) {
    const tokens1 = new Set(text1.split(' '));
    const tokens2 = new Set(text2.split(' '));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Add or update claim in knowledge graph
   */
  async addClaim(claimText, debate, turn, side, qualityScore = 0) {
    try {
      const normalized = this.normalizeClaim(claimText);
      const topic = this.extractTopic(claimText);

      console.log(`📊 Adding claim to knowledge graph: "${claimText.substring(0, 50)}..."`);

      // Check if similar claim exists
      const existingClaim = await Claim.findOne({ normalizedText: normalized });

      if (existingClaim) {
        // Update existing claim
        await existingClaim.addUsage(debate, turn, side, qualityScore);
        console.log(`♻️  Updated existing claim (total uses: ${existingClaim.stats.totalUses})`);
        return existingClaim;
      }

      // Create new claim
      const newClaim = await Claim.create({
        originalText: claimText,
        normalizedText: normalized,
        topic,
        firstDebate: debate,
        firstTurn: turn,
        debates: [{
          debate,
          turn,
          side,
          usedAt: new Date()
        }],
        stats: {
          totalUses: 1,
          avgQualityScore: qualityScore
        }
      });

      console.log(`✅ Created new claim in knowledge graph`);

      // Find and link similar claims
      await this.linkSimilarClaims(newClaim);

      return newClaim;

    } catch (error) {
      console.error('❌ Error adding claim to knowledge graph:', error);
      throw error;
    }
  }

  /**
   * Find and link similar claims
   */
  async linkSimilarClaims(claim, threshold = 0.6) {
    try {
      // Find claims with similar topics
      const potentialMatches = await Claim.find({
        topic: claim.topic,
        _id: { $ne: claim._id }
      }).limit(20);

      const related = [];

      for (const match of potentialMatches) {
        const similarity = this.calculateSimilarity(
          claim.normalizedText,
          match.normalizedText
        );

        if (similarity >= threshold) {
          related.push({
            claim: match._id,
            relationship: 'similar',
            similarity
          });

          // Add reverse relationship
          if (!match.relatedClaims.some(r => r.claim.equals(claim._id))) {
            match.relatedClaims.push({
              claim: claim._id,
              relationship: 'similar',
              similarity
            });
            await match.save();
          }
        }
      }

      if (related.length > 0) {
        claim.relatedClaims = related;
        await claim.save();
        console.log(`🔗 Linked ${related.length} similar claims`);
      }

    } catch (error) {
      console.error('Error linking similar claims:', error);
    }
  }

  /**
   * Mark claim as refuted by another claim
   */
  async markRefuted(originalClaimText, refutingClaimText, effectiveness = 5) {
    try {
      const normalizedOriginal = this.normalizeClaim(originalClaimText);
      const normalizedRefuting = this.normalizeClaim(refutingClaimText);

      const originalClaim = await Claim.findOne({ normalizedText: normalizedOriginal });
      const refutingClaim = await Claim.findOne({ normalizedText: normalizedRefuting });

      if (originalClaim) {
        await originalClaim.markRefuted();

        if (refutingClaim) {
          // Add counter-claim relationship
          if (!originalClaim.counterClaims.some(c => c.claim.equals(refutingClaim._id))) {
            originalClaim.counterClaims.push({
              claim: refutingClaim._id,
              effectiveness
            });
            await originalClaim.save();
          }

          console.log(`⚔️  Linked refutation relationship`);
        }
      }

    } catch (error) {
      console.error('Error marking refutation:', error);
    }
  }

  /**
   * Get claim statistics for a specific claim
   */
  async getClaimStats(claimText) {
    try {
      const normalized = this.normalizeClaim(claimText);
      const claim = await Claim.findOne({ normalizedText: normalized })
        .populate('relatedClaims.claim', 'originalText stats')
        .populate('counterClaims.claim', 'originalText stats');

      if (!claim) {
        return null;
      }

      return {
        originalText: claim.originalText,
        topic: claim.topic,
        stats: {
          totalUses: claim.stats.totalUses,
          timesRefuted: claim.stats.timesRefuted,
          winsWithClaim: claim.stats.winsWithClaim,
          lossesWithClaim: claim.stats.lossesWithClaim,
          successRate: Math.round(claim.stats.successRate * 100),
          avgQualityScore: Math.round(claim.stats.avgQualityScore)
        },
        relatedClaims: claim.relatedClaims.map(r => ({
          text: r.claim.originalText,
          similarity: Math.round(r.similarity * 100),
          uses: r.claim.stats.totalUses
        })),
        counterClaims: claim.counterClaims.map(c => ({
          text: c.claim.originalText,
          effectiveness: c.effectiveness,
          uses: c.claim.stats.totalUses
        }))
      };

    } catch (error) {
      console.error('Error getting claim stats:', error);
      return null;
    }
  }

  /**
   * Get popular claims by topic
   */
  async getPopularClaims(topic = null, limit = 10) {
    try {
      return await Claim.getPopularClaims(topic, limit);
    } catch (error) {
      console.error('Error getting popular claims:', error);
      return [];
    }
  }

  /**
   * Get most successful claims
   */
  async getMostSuccessful(topic = null, limit = 10) {
    try {
      return await Claim.getMostSuccessful(topic, limit);
    } catch (error) {
      console.error('Error getting successful claims:', error);
      return [];
    }
  }

  /**
   * Get knowledge graph stats
   */
  async getGraphStats() {
    try {
      const totalClaims = await Claim.countDocuments();
      const totalRelationships = await Claim.aggregate([
        { $project: { relatedCount: { $size: '$relatedClaims' } } },
        { $group: { _id: null, total: { $sum: '$relatedCount' } } }
      ]);

      const topicDistribution = await Claim.aggregate([
        { $group: { _id: '$topic', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      return {
        totalClaims,
        totalRelationships: totalRelationships[0]?.total || 0,
        topicDistribution: topicDistribution.map(t => ({
          topic: t._id,
          count: t.count
        })),
        avgClaimsPerDebate: 0 // TODO: Calculate from debates
      };

    } catch (error) {
      console.error('Error getting graph stats:', error);
      return null;
    }
  }

  /**
   * Search claims
   */
  async searchClaims(query, limit = 10) {
    try {
      const normalized = this.normalizeClaim(query);
      
      return await Claim.find({
        $text: { $search: normalized }
      })
      .limit(limit)
      .sort({ score: { $meta: 'textScore' } })
      .select('originalText topic stats');

    } catch (error) {
      console.error('Error searching claims:', error);
      return [];
    }
  }
}

const knowledgeGraphService = new KnowledgeGraphService();
export default knowledgeGraphService;