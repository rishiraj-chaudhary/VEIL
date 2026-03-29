/**
 * LIVE DEBATE ASSISTANT SERVICE — Phase 13
 *
 * Fixed:
 *   - vectorStoreService.retrieveContext → correct LangChain retriever pattern
 *   - Added LLM-powered fallacy detection (not just regex)
 *   - Added evidence quality suggestions
 *   - Added argument strength scoring
 *
 * Place at: backend/src/services/debateAssistantService.js
 */

import Debate from '../models/debate.js';
import DebateTurn from '../models/debateTurn.js';
import grokService from './grokService.js';
import vectorStoreService from './vectorStoreService.js';

class DebateAssistantService {
  constructor() {
    this.MIN_CHARS   = 20;
    this.THROTTLE_MS = 2000;
    this.lastAnalysis = new Map();
  }

  // ── Main entry ──────────────────────────────────────────────────────────────

  async getLiveDebateInsights({ debateId, userId, currentDraft, side }) {
    try {
      if (!currentDraft || currentDraft.trim().length < this.MIN_CHARS) {
        return this._empty('Keep writing…');
      }

      // Throttle
      const key  = `${debateId}_${userId}`;
      const now  = Date.now();
      if (now - (this.lastAnalysis.get(key) || 0) < this.THROTTLE_MS) {
        return { ...this._empty(), throttled: true, stats: { wordCount: currentDraft.split(/\s+/).length, hasEvidence: false } };
      }
      this.lastAnalysis.set(key, now);

      // Debate context
      const debate = await Debate.findById(debateId).populate('participants.user', 'username');
      if (!debate) throw new Error('Debate not found');

      const opponentSide  = side === 'for' ? 'against' : 'for';
      const opponentTurns = await DebateTurn.find({ debate: debateId, side: opponentSide, isDeleted: false })
        .sort({ turnNumber: 1 }).limit(5).lean();

      // ── FIX: use correct retrieval pattern ───────────────────────────────────
      const knowledgeDocs = await this._retrieveKnowledge(currentDraft);

      const insights = await this.analyzeDraft({
        draft: currentDraft,
        opponentTurns,
        knowledgeDocs,
        side,
        topic: debate.topic,
      });

      return insights;

    } catch (error) {
      console.error('Live assistant error:', error.message);
      return { ...this._empty(), error: error.message };
    }
  }

  // ── Retrieve knowledge docs via LangChain retriever ──────────────────────────

  async _retrieveKnowledge(query) {
    try {
      // Use the correct method from vectorStoreService
      const docs = await vectorStoreService.retrieveKnowledgeHybrid(query, 5);
      return docs;
    } catch (error) {
      console.error('Knowledge retrieval error:', error.message);
      return [];
    }
  }

  // ── Core analysis ────────────────────────────────────────────────────────────

  async analyzeDraft({ draft, opponentTurns = [], knowledgeDocs = [], side, topic }) {
    const insights = {
      suggestions:  [],
      warnings:     [],
      opportunities: [],
      stats: {
        wordCount:   draft.split(/\s+/).filter(Boolean).length,
        hasEvidence: this._detectEvidence(draft),
        strengthScore: 0,
      },
    };

    // Run checks in parallel for speed
    const [fallacyWarnings, rebuttals, strengthScore] = await Promise.all([
      this._checkFallaciesLLM(draft, knowledgeDocs),
      this._findMissedRebuttals(draft, opponentTurns),
      this._scoreArgumentStrength(draft, knowledgeDocs, topic),
    ]);

    insights.warnings.push(...fallacyWarnings);
    insights.opportunities.push(...rebuttals);
    insights.stats.strengthScore = strengthScore;

    // Evidence suggestion
    if (!insights.stats.hasEvidence && draft.length > 80) {
      insights.suggestions.push({
        type:    'evidence',
        title:   'Add evidence',
        message: 'Back your claim with data, studies, or examples — it significantly increases your score.',
        priority: 'medium',
      });
    }

    // Structure suggestion
    const structureTip = this._checkStructure(draft);
    if (structureTip) insights.suggestions.push(structureTip);

    // Strength feedback
    if (strengthScore < 40 && draft.length > 100) {
      insights.suggestions.push({
        type:    'strength',
        title:   'Strengthen your argument',
        message: strengthScore < 20
          ? 'Try to make a clearer, more specific claim.'
          : 'Consider addressing the opposing perspective directly.',
        priority: 'low',
      });
    }

    return insights;
  }

  // ── LLM fallacy detection ─────────────────────────────────────────────────────

  async _checkFallaciesLLM(draft, knowledgeDocs) {
    const warnings = [];

    // Fast regex pre-filter (skip LLM call if nothing suspicious)
    const draftLower = draft.toLowerCase();
    const suspiciousPatterns = [
      /\b(you|they).{0,20}(stupid|idiot|ignorant|dumb|fool)/i,
      /\b(all|every|always|never|everyone|no one)\b/,
      /\bthink of the children\b/i,
      /\bslippery slope\b/i,
      /\b(ad hominem|straw man|false dilemma)\b/i,
      /\b(obviously|clearly|everyone knows)\b/i,
    ];

    const hasSuspicious = suspiciousPatterns.some(p => p.test(draft));

    if (hasSuspicious) {
      try {
        // Use fast model for speed
        const prompt = `You are a debate coach. Analyze this argument for logical fallacies.

Argument: "${draft.substring(0, 500)}"

Identify any fallacies present. Return ONLY valid JSON array (empty if none):
[
  {
    "fallacyType": "ad_hominem|hasty_generalization|straw_man|appeal_to_emotion|false_dilemma|slippery_slope|appeal_to_authority|circular_reasoning",
    "title": "short name",
    "message": "one sentence coaching tip",
    "priority": "high|medium|low"
  }
]

Return [] if no clear fallacies. Max 2 items.`;

        const response = await grokService.generateFast(prompt, { temperature: 0.2, maxTokens: 300 });
        const clean    = response.replace(/```json|```/g, '').trim();
        const parsed   = JSON.parse(clean);

        if (Array.isArray(parsed)) {
          warnings.push(...parsed.slice(0, 2).map(f => ({ type: 'fallacy', ...f })));
        }
      } catch {
        // Fall back to regex-based detection
        warnings.push(...this._regexFallacies(draftLower));
      }
    }

    return warnings;
  }

  _regexFallacies(draftLower) {
    const warnings = [];
    if (/\b(you|they).{0,20}(stupid|idiot|ignorant|dumb|fool)/i.test(draftLower)) {
      warnings.push({ type: 'fallacy', fallacyType: 'ad_hominem', title: 'Personal attack detected', message: 'Focus on the argument, not the person.', priority: 'high' });
    }
    if (/\b(all|every|always|never|everyone|no one)\b/.test(draftLower)) {
      warnings.push({ type: 'fallacy', fallacyType: 'hasty_generalization', title: 'Absolute language', message: 'Consider whether this truly applies universally.', priority: 'low' });
    }
    return warnings;
  }

  // ── Missed rebuttals ──────────────────────────────────────────────────────────

  async _findMissedRebuttals(draft, opponentTurns) {
    const opportunities = [];
    if (!opponentTurns?.length) return opportunities;

    const draftLower = draft.toLowerCase();
    const rebuttalWords = ['however', 'but', 'although', 'contrary', 'disagree', 'wrong', 'incorrect', 'overlook', 'actually', 'on the other hand'];
    const hasRebuttal   = rebuttalWords.some(w => draftLower.includes(w));

    if (!hasRebuttal) {
      const latest  = opponentTurns[opponentTurns.length - 1];
      const preview = latest.content?.substring(0, 120) || '';
      opportunities.push({
        type:    'rebuttal',
        title:   'Address your opponent',
        message: `Your opponent argued: "${preview}…" — consider directly countering this.`,
        priority: 'high',
      });
    }

    return opportunities;
  }

  // ── Argument strength scoring ─────────────────────────────────────────────────

  async _scoreArgumentStrength(draft, knowledgeDocs, topic) {
    try {
      const wordCount    = draft.split(/\s+/).filter(Boolean).length;
      const hasEvidence  = this._detectEvidence(draft);
      const hasStructure = draft.split(/[.!?]+/).filter(s => s.trim()).length >= 2;

      // Base score from structural signals
      let score = 20;
      if (wordCount > 30)  score += 15;
      if (wordCount > 80)  score += 10;
      if (hasEvidence)     score += 25;
      if (hasStructure)    score += 10;

      // Knowledge relevance boost
      if (knowledgeDocs.length > 0) {
        const knowledgeText = knowledgeDocs.map(d => d.text || d.content || d.pageContent || '').join(' ').toLowerCase();
        const draftWords    = draft.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        const matches       = draftWords.filter(w => knowledgeText.includes(w)).length;
        const relevance     = Math.min(20, Math.round((matches / Math.max(draftWords.length, 1)) * 100));
        score += relevance;
      }

      return Math.min(100, score);
    } catch {
      return 50;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  _detectEvidence(text) {
    const indicators = [
      'study', 'research', 'data', 'statistics', 'source', 'according to',
      'shows that', 'evidence', 'proven', 'report', 'analysis', 'survey',
      'experiment', 'found that', 'peer-reviewed', 'journal', 'published', '%',
    ];
    const lower = text.toLowerCase();
    return indicators.some(i => lower.includes(i));
  }

  _checkStructure(draft) {
    const sentences = draft.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length < 2 && draft.length > 120) {
      return {
        type:    'structure',
        title:   'Break into sentences',
        message: 'Multiple sentences improve clarity and readability.',
        priority: 'low',
      };
    }
    return null;
  }

  _empty(message = '') {
    return {
      suggestions:   [],
      warnings:      [],
      opportunities: [],
      stats:         { wordCount: 0, hasEvidence: false, strengthScore: 0 },
      ...(message ? { message } : {}),
    };
  }
}

const debateAssistantService = new DebateAssistantService();
export default debateAssistantService;