import Debate from '../models/debate.js';
import DebateTurn from '../models/debateTurn.js';
import vectorStoreService from './vectorStoreService.js';

/**
 * LIVE DEBATE ASSISTANT (Phase 2)
 * 
 * Provides real-time guidance while users type their arguments
 * Non-intrusive, structural assistance only
 */
class DebateAssistantService {
  constructor() {
    // Throttle settings
    this.MIN_CHARS = 20; // Minimum characters before analysis (lowered for testing)
    this.THROTTLE_MS = 2000; // Wait 2 seconds between analyses
    this.lastAnalysis = new Map(); // debateId_userId -> timestamp
  }

  /**
   * Get live insights for current draft
   */
  async getLiveDebateInsights(options) {
    const {
      debateId,
      userId,
      currentDraft,
      side
    } = options;

    try {
      // Validate input
      if (!currentDraft || currentDraft.trim().length < this.MIN_CHARS) {
        return {
          suggestions: [],
          warnings: [],
          opportunities: [],
          stats: {
            wordCount: 0,
            hasEvidence: false
          },
          message: 'Keep writing...'
        };
      }

      // Throttle check
      const key = `${debateId}_${userId}`;
      const lastTime = this.lastAnalysis.get(key) || 0;
      const now = Date.now();
      
      if (now - lastTime < this.THROTTLE_MS) {
        return {
          suggestions: [],
          warnings: [],
          opportunities: [],
          stats: {
            wordCount: currentDraft.split(/\s+/).length,
            hasEvidence: false
          },
          throttled: true
        };
      }

      this.lastAnalysis.set(key, now);

      // Get debate context
      const debate = await Debate.findById(debateId)
        .populate('participants.user', 'username');

      if (!debate) {
        throw new Error('Debate not found');
      }

      // Get opponent's arguments
      const opponentSide = side === 'for' ? 'against' : 'for';
      const opponentTurns = await DebateTurn.find({
        debate: debateId,
        side: opponentSide,
        isDeleted: false
      }).sort({ turnNumber: 1 }).limit(5);

      // Retrieve relevant context using unified retrieval
      const context = await vectorStoreService.retrieveContext(
        currentDraft,
        {
          sources: ['knowledge', 'debate'],
          topK: 5,
          debateId
        }
      );

      // Analyze the draft (FIXED: removed space in method name)
      const insights = await this.analyzeDraft({
        draft: currentDraft,
        opponentTurns,
        context,
        side
      });

      return insights;

    } catch (error) {
      console.error('Live assistant error:', error.message);
      return {
        suggestions: [],
        warnings: [],
        opportunities: [],
        stats: {
          wordCount: 0,
          hasEvidence: false
        },
        error: error.message
      };
    }
  }

  /**
   * Analyze the draft and provide suggestions
   */
  async analyzeDraft(options) {
    const { draft, opponentTurns = [], context = { knowledge: [] }, side } = options;

    const insights = {
      suggestions: [],
      warnings: [],
      opportunities: [],
      stats: {
        wordCount: draft.split(/\s+/).length,
        hasEvidence: this.detectEvidenceIndicators(draft),
        potentialFallacies: []
      }
    };

    // Check for potential fallacies
    const fallacyWarnings = await this.checkPotentialFallacies(draft, context);
    if (fallacyWarnings.length > 0) {
      insights.warnings.push(...fallacyWarnings);
    }

    // Check for missed rebuttals
    const missedRebuttals = await this.findMissedRebuttals(
      draft, 
      opponentTurns, 
      context
    );
    if (missedRebuttals.length > 0) {
      insights.opportunities.push(...missedRebuttals);
    }

    // Check for evidence
    if (!insights.stats.hasEvidence && draft.length > 100) {
      insights.suggestions.push({
        type: 'evidence',
        title: 'Consider adding evidence',
        message: 'Strong arguments are backed by data or citations',
        priority: 'medium'
      });
    }

    // Check for structure
    const structureSuggestions = this.checkStructure(draft);
    if (structureSuggestions) {
      insights.suggestions.push(structureSuggestions);
    }

    return insights;
  }

  /**
   * Check for potential logical fallacies
   */
  async checkPotentialFallacies(draft, context) {
    const warnings = [];

    try {
      // Use retrieved fallacy definitions
      const fallacyPatterns = context.knowledge.filter(
        k => k.metadata?.category === 'fallacy'
      );

      // Simple pattern matching (not LLM call for speed)
      const draftLower = draft.toLowerCase();

      // Ad hominem indicators
      if (draftLower.includes('you') && 
          (draftLower.includes('stupid') || 
           draftLower.includes('idiot') || 
           draftLower.includes('ignorant') ||
           draftLower.includes('dumb'))) {
        warnings.push({
          type: 'fallacy',
          fallacyType: 'ad_hominem',
          title: 'Potential personal attack',
          message: 'Focus on the argument, not the person',
          priority: 'high'
        });
      }

      // Appeal to emotion indicators
      if (draftLower.match(/think (of |about )the children|won't someone/i)) {
        warnings.push({
          type: 'fallacy',
          fallacyType: 'appeal_to_emotion',
          title: 'Potential appeal to emotion',
          message: 'Strengthen with logical reasoning',
          priority: 'medium'
        });
      }

      // Hasty generalization
      if (draftLower.match(/\b(all|every|always|never|everyone|no one)\b/)) {
        warnings.push({
          type: 'fallacy',
          fallacyType: 'hasty_generalization',
          title: 'Absolute language detected',
          message: 'Consider if this applies universally',
          priority: 'low'
        });
      }

    } catch (error) {
      console.error('Fallacy check error:', error.message);
    }

    return warnings;
  }

  /**
   * Find opportunities for rebuttals
   */
  async findMissedRebuttals(draft, opponentTurns, context) {
    const opportunities = [];

    try {
      if (!opponentTurns || opponentTurns.length === 0) {
        return opportunities;
      }

      // Get opponent's main claims
      const opponentClaims = opponentTurns
        .map(turn => turn.content)
        .join(' ')
        .toLowerCase();

      // Check if draft addresses opponent
      const draftLower = draft.toLowerCase();
      const rebuttalIndicators = [
        'however', 'but', 'although', 'contrary', 'disagree',
        'wrong', 'incorrect', 'mistaken', 'overlook'
      ];

      const hasRebuttalLanguage = rebuttalIndicators.some(
        indicator => draftLower.includes(indicator)
      );

      if (!hasRebuttalLanguage && opponentTurns.length > 0) {
        const latestOpponent = opponentTurns[opponentTurns.length - 1];
        opportunities.push({
          type: 'rebuttal',
          title: 'Consider addressing opponent',
          message: `Your opponent argued: "${latestOpponent.content.substring(0, 100)}..."`,
          priority: 'high'
        });
      }

    } catch (error) {
      console.error('Rebuttal check error:', error.message);
    }

    return opportunities;
  }

  /**
   * Detect evidence indicators
   */
  detectEvidenceIndicators(text) {
    const indicators = [
      'study', 'research', 'data', 'statistics', 'source',
      'according to', 'shows that', 'evidence', 'proven',
      'report', 'analysis', 'survey', 'experiment', 'found that',
      'peer-reviewed', 'journal', 'published'
    ];

    const textLower = text.toLowerCase();
    return indicators.some(indicator => textLower.includes(indicator));
  }

  /**
   * Check argument structure
   */
  checkStructure(draft) {
    const sentences = draft.split(/[.!?]+/).filter(s => s.trim().length > 0);

    if (sentences.length < 2 && draft.length > 100) {
      return {
        type: 'structure',
        title: 'Consider breaking into sentences',
        message: 'Multiple sentences improve clarity',
        priority: 'low'
      };
    }

    return null;
  }

  /**
   * Quick fact check (pattern matching only - fast!)
   */
  async quickFactCheck(claim, context) {
    // Use retrieved knowledge to verify patterns
    const knowledgeText = context.knowledge
      .map(k => k.content)
      .join(' ')
      .toLowerCase();

    const claimLower = claim.toLowerCase();
    const words = claimLower.split(/\s+/).filter(w => w.length > 3);

    const matchCount = words.filter(word => 
      knowledgeText.includes(word)
    ).length;

    const confidence = matchCount / words.length;

    return {
      claim,
      supported: confidence > 0.3,
      confidence: Math.round(confidence * 100),
      message: confidence > 0.3 
        ? 'Pattern matches knowledge base'
        : 'No supporting patterns found'
    };
  }
}

const debateAssistantService = new DebateAssistantService();
export default debateAssistantService;