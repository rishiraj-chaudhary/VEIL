import grokService from './grokService.js';
import vectorStoreService from './vectorStoreService.js';

/**
 * FACT CHECK SERVICE (Phase 3)
 * 
 * Pattern-based verification using RAG
 * Does NOT verify absolute truth, but checks if claims match known patterns
 */
class FactCheckService {
  constructor() {
    this.confidenceThresholds = {
      high: 0.7,
      medium: 0.4,
      low: 0.2
    };
  }

  /**
   * Check a single claim against knowledge base
   */
  async checkClaim(claim, options = {}) {
    const { sources = ['knowledge'], topK = 3 } = options;

    try {
      // Retrieve relevant context
      const context = await vectorStoreService.retrieveContext(
        claim,
        { sources, topK }
      );

      // Calculate pattern match confidence
      const confidence = this.calculateConfidence(claim, context);

      // Determine support level
      const supported = confidence >= this.confidenceThresholds.medium;
      const level = this.getConfidenceLevel(confidence);

      return {
        claim,
        supported,
        confidence,
        level,
        reasoning: this.explainCheck(confidence, context),
        retrievedSources: context.knowledge.map(k => k.metadata?.type || 'unknown'),
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Fact check error:', error.message);
      return {
        claim,
        supported: false,
        confidence: 0,
        level: 'unknown',
        reasoning: 'Unable to verify',
        retrievedSources: [],
        error: error.message
      };
    }
  }

  /**
   * Check multiple claims in text
   */
  async checkText(text, options = {}) {
    try {
      // Extract potential claims using simple sentence splitting
      const sentences = text
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 20); // Only check substantial sentences

      // Check each claim
      const checks = await Promise.all(
        sentences.slice(0, 5).map(sentence => // Limit to 5 claims
          this.checkClaim(sentence, options)
        )
      );

      // Calculate overall confidence
      const avgConfidence = checks.reduce((sum, c) => sum + c.confidence, 0) / checks.length;

      // Identify flags
      const flags = checks
        .filter(c => !c.supported)
        .map(c => ({
          claim: c.claim.substring(0, 100),
          reason: c.reasoning
        }));

      return {
        checks,
        overallConfidence: Math.round(avgConfidence * 100),
        flags,
        verified: flags.length === 0,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Text check error:', error.message);
      return {
        checks: [],
        overallConfidence: 0,
        flags: [],
        verified: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate confidence based on pattern matching
   */
  calculateConfidence(claim, context) {
    if (!context.knowledge || context.knowledge.length === 0) {
      return 0;
    }

    const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    let totalScore = 0;
    let maxScore = claimWords.length;

    context.knowledge.forEach(knowledge => {
      const knowledgeText = knowledge.content.toLowerCase();
      
      claimWords.forEach(word => {
        if (knowledgeText.includes(word)) {
          totalScore += 1;
        }
      });
    });

    return maxScore > 0 ? totalScore / maxScore : 0;
  }

  /**
   * Get confidence level label
   */
  getConfidenceLevel(confidence) {
    if (confidence >= this.confidenceThresholds.high) return 'high';
    if (confidence >= this.confidenceThresholds.medium) return 'medium';
    if (confidence >= this.confidenceThresholds.low) return 'low';
    return 'none';
  }

  /**
   * Explain the check result
   */
  explainCheck(confidence, context) {
    const level = this.getConfidenceLevel(confidence);
    const knowledgeCount = context.knowledge?.length || 0;

    const explanations = {
      high: `Strong pattern match with ${knowledgeCount} knowledge sources`,
      medium: `Partial pattern match with ${knowledgeCount} knowledge sources`,
      low: `Weak pattern match with ${knowledgeCount} knowledge sources`,
      none: 'No supporting patterns found in knowledge base'
    };

    return explanations[level];
  }

  /**
   * Enhanced fact check with AI verification (optional, costs API calls)
   */
  async checkWithAI(claim, context) {
    try {
      const retrievedKnowledge = context.knowledge
        .map(k => k.content)
        .join('\n\n');

      const prompt = `Given this knowledge base:

${retrievedKnowledge}

Is this claim supported by the knowledge above?
Claim: "${claim}"

Respond with JSON only:
{
  "supported": true/false,
  "confidence": 0-100,
  "reasoning": "brief explanation"
}`;

      const response = await grokService.generateFast(prompt, { temperature: 0.2 });
      const cleanResponse = response.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanResponse);

    } catch (error) {
      console.error('AI verification error:', error.message);
      return null;
    }
  }

  /**
   * Get fact check statistics
   */
  getStats(checks) {
    const total = checks.length;
    const supported = checks.filter(c => c.supported).length;
    const unsupported = total - supported;

    return {
      total,
      supported,
      unsupported,
      supportRate: total > 0 ? Math.round((supported / total) * 100) : 0
    };
  }
}

const factCheckService = new FactCheckService();
export default factCheckService;