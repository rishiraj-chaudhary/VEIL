import natural from 'natural';
import grokService from '../grokService.js';
import structuredParserService from '../structuredParserService.js';

/**
 * FALLACY GRAPH — Step 6 of AI Maturity Roadmap
 *
 * Replaces regex-only detection with a layered reasoning system.
 *
 * Architecture (hybrid strategy):
 *   Layer 1 — Regex pre-filter (fast, free, always runs)
 *     → Catches obvious surface-level patterns
 *     → Decides whether LLM layer is needed
 *
 *   Layer 2 — LLM reasoning (contextual, only when triggered)
 *     → Understands INTENT behind the argument
 *     → Detects implicit fallacies regex cannot see
 *     → Returns structured output via Zod schema
 *     → Confidence-scored per fallacy
 *
 * When does Layer 2 trigger?
 *   - Regex found a hit (verify + enrich)
 *   - Tone is aggressive (potential ad hominem)
 *   - Argument is complex (>100 words)
 *   - High-tier user (pro/team/enterprise)
 *   - Debate round > 1 (rebuttals have more fallacy risk)
 *
 * Cost: ~50-80 tokens per analysis (fast model only)
 */
class FallacyGraph {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();

    // Confidence threshold — below this, discard LLM fallacy
    this.minConfidence = 0.55;

    // Regex triggers (same patterns as before, but now just signals)
    this.quickPatterns = {
      adHominem: [
        /\b(you are|you're)\s+(stupid|dumb|idiot|ignorant|fool|moron)\b/i,
        /\byou\s+(clearly\s+)?don't\s+(understand|know)\b/i,
        /\bonly an?\s+(idiot|fool|moron)\s+would\b/i,
      ],
      strawMan: [
        /\bso you('re| are) saying\b/i,
        /\bwhat you really mean is\b/i,
      ],
      appealToEmotion: [
        /\bthink (of|about) the children\b/i,
        /\bshame on you\b/i,
        /\bhow can you\b.*\b(sleep|live)\b/i,
      ],
      falseDilemma: [
        /\byou('re| are) (either )?with (us|me) or against (us|me)\b/i,
        /\bonly two (options|choices|possibilities)\b/i,
      ],
      slipperySlope: [
        /\bnext thing you know\b/i,
        /\bwhere (does|will) it (end|stop)\b/i,
      ],
      circularReasoning: [
        /\bit('s| is) true because (it('s| is) true|I (say|said) so)\b/i,
      ],
    };

    this.aggressiveWords = new Set([
      'stupid', 'idiot', 'dumb', 'fool', 'moron', 'ignorant',
      'ridiculous', 'absurd', 'nonsense', 'pathetic', 'disgusting',
      'horrible', 'terrible', 'awful', 'worthless', 'useless',
    ]);
  }

  /**
   * Main entry point — runs the full fallacy detection graph.
   *
   * @param {string} content - The debate turn text
   * @param {Object} options
   * @param {string} options.context - Previous turns context
   * @param {string} options.side - 'for' | 'against'
   * @param {number} options.round - Current debate round
   * @param {string} options.userTier - 'free' | 'pro' | 'team' | 'enterprise'
   * @param {Object} options.aiContext - { userId, debateId }
   * @param {Array}  options.retrievedKnowledge - Knowledge docs for context
   * @returns {Array} Validated fallacy objects
   */
  async detect(content, options = {}) {
    const {
      context = '',
      side = 'for',
      round = 1,
      userTier = 'free',
      aiContext = {},
      retrievedKnowledge = [],
    } = options;

    // ── Node 1: Regex pre-filter ──────────────────────────────────
    const regexSignals = this._runRegexLayer(content);
    const shouldRunLLM = this._shouldTriggerLLM(content, regexSignals, round, userTier);

    console.log(`🔍 Fallacy graph: regex=${regexSignals.length} signals, LLM=${shouldRunLLM}`);

    if (!shouldRunLLM || !grokService.isReady()) {
      // Layer 1 only — convert regex signals to fallacy objects
      const fallacies = regexSignals.map(signal => ({
        type: signal.type,
        explanation: signal.explanation,
        severity: signal.severity,
        confidence: 0.7,
        detectionMethod: 'regex',
      }));
      return this._finalize(fallacies);
    }

    // ── Node 2: Build knowledge context ──────────────────────────
    const knowledgeContext = this._buildKnowledgeContext(retrievedKnowledge);

    // ── Node 3: LLM reasoning ────────────────────────────────────
    const llmFallacies = await this._runLLMLayer(
      content,
      context,
      regexSignals,
      knowledgeContext,
      aiContext
    );

    // ── Node 4: Merge + deduplicate ───────────────────────────────
    const merged = this._mergeResults(regexSignals, llmFallacies);

    // ── Node 5: Filter by confidence ─────────────────────────────
    const filtered = merged.filter(f => f.confidence >= this.minConfidence);

    // ── Node 6: Finalize ─────────────────────────────────────────
    return this._finalize(filtered);
  }

  // ── Node 1: Regex pre-filter ─────────────────────────────────────

  _runRegexLayer(text) {
    const signals = [];

    for (const [fallacyKey, patterns] of Object.entries(this.quickPatterns)) {
      if (patterns.some(p => p.test(text))) {
        signals.push(this._buildSignal(fallacyKey));
      }
    }

    // Hasty generalization — count absolute language
    const absoluteCount = (text.match(/\b(all|every|everyone|nobody|no one|none|always|never)\b/gi) || []).length;
    if (absoluteCount >= 3) {
      signals.push({
        type: 'hasty generalization',
        explanation: 'Uses absolute language without sufficient evidence',
        severity: 4,
        confidence: 0.65,
        detectionMethod: 'regex',
      });
    }

    // Appeal to authority without evidence
    const authorityPattern = /\b(experts? (say|agree|believe)|studies show|everyone knows|it('s| is) common knowledge)\b/i;
    if (authorityPattern.test(text) && !this._hasEvidenceIndicators(text)) {
      signals.push({
        type: 'appeal to authority',
        explanation: 'References authority figures without specific citations',
        severity: 4,
        confidence: 0.6,
        detectionMethod: 'regex',
      });
    }

    return signals;
  }

  // ── Trigger decision ─────────────────────────────────────────────

  _shouldTriggerLLM(content, regexSignals, round, userTier) {
    // Always trigger if regex found something (verify + enrich)
    if (regexSignals.length > 0) return true;

    const words = content.trim().split(/\s+/);

    // Trigger for complex arguments (more fallacy surface area)
    if (words.length > 100) return true;

    // Trigger if aggressive tone detected
    const wordSet = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, '')));
    const aggressiveHits = [...wordSet].filter(w => this.aggressiveWords.has(w)).length;
    if (aggressiveHits > 0) return true;

    // Trigger for paying users on all rounds
    if (['pro', 'team', 'enterprise'].includes(userTier)) return true;

    // Trigger on rebuttal rounds (higher fallacy risk)
    if (round > 1) return true;

    return false;
  }

  // ── Node 3: LLM reasoning ────────────────────────────────────────

  async _runLLMLayer(content, context, regexSignals, knowledgeContext, aiContext) {
    const regexHints = regexSignals.length > 0
      ? `\nPossible issues already detected: ${regexSignals.map(s => s.type).join(', ')}`
      : '';

    const prompt = `You are a logical fallacy expert analyzing a debate argument.

${context ? `Previous debate context:\n${context.substring(0, 600)}\n` : ''}
Argument to analyze:
"${content.substring(0, 800)}"
${regexHints}
${knowledgeContext ? `\nRelevant fallacy knowledge:\n${knowledgeContext}` : ''}

Identify logical fallacies in this argument. For each fallacy:
- type: the fallacy name (e.g. "ad hominem", "straw man", "false dilemma")
- explanation: why this specific text is a fallacy (be specific, reference the argument)
- severity: 1-10 (10 = most damaging to argument quality)
- confidence: 0.0-1.0 (how certain you are this is actually a fallacy)
- quote: the specific phrase that contains the fallacy (optional, max 100 chars)

Only report genuine fallacies. If the argument is logically sound, return [].
Limit to 3 most significant fallacies.

Return ONLY a JSON array:
[{"type": "...", "explanation": "...", "severity": 7, "confidence": 0.85, "quote": "..."}]`;

    try {
      const response = await grokService.generateFast(prompt, {
        ...aiContext,
        operation: 'fallacy_detection',
        temperature: 0.2,
      });

      const fallacies = await structuredParserService.parse(
        'fallacies',
        response,
        prompt,
        aiContext
      );

      if (!Array.isArray(fallacies)) return [];

      return fallacies.map(f => ({
        ...f,
        detectionMethod: 'llm',
      }));

    } catch (error) {
      console.error('❌ LLM fallacy detection failed:', error.message);
      return [];
    }
  }

  // ── Node 4: Merge + deduplicate ──────────────────────────────────

  _mergeResults(regexSignals, llmFallacies) {
    const merged = [];
    const seenTypes = new Set();

    // LLM results take priority — higher confidence, richer explanation
    for (const llmFallacy of llmFallacies) {
      const normalizedType = llmFallacy.type.toLowerCase().trim();
      if (!seenTypes.has(normalizedType)) {
        seenTypes.add(normalizedType);
        merged.push({
          ...llmFallacy,
          confidence: llmFallacy.confidence ?? 0.8,
        });
      }
    }

    // Add regex signals not covered by LLM
    for (const signal of regexSignals) {
      const normalizedType = signal.type.toLowerCase().trim();
      if (!seenTypes.has(normalizedType)) {
        seenTypes.add(normalizedType);
        merged.push(signal);
      }
    }

    return merged;
  }

  // ── Node 6: Finalize ─────────────────────────────────────────────

  _finalize(fallacies) {
    return fallacies
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 3)
      .map(f => ({
        type: f.type,
        explanation: f.explanation,
        severity: f.severity,
        confidence: f.confidence ?? 0.7,
        detectionMethod: f.detectionMethod ?? 'hybrid',
        ...(f.quote && { quote: f.quote }),
      }));
  }

  // ── Helpers ──────────────────────────────────────────────────────

  _buildSignal(fallacyKey) {
    const signals = {
      adHominem: {
        type: 'ad hominem',
        explanation: 'Attacks the person rather than addressing their argument',
        severity: 8,
        confidence: 0.75,
        detectionMethod: 'regex',
      },
      strawMan: {
        type: 'straw man',
        explanation: 'Potentially misrepresenting the opponent\'s position',
        severity: 6,
        confidence: 0.65,
        detectionMethod: 'regex',
      },
      appealToEmotion: {
        type: 'appeal to emotion',
        explanation: 'Uses emotional manipulation rather than logical reasoning',
        severity: 5,
        confidence: 0.7,
        detectionMethod: 'regex',
      },
      falseDilemma: {
        type: 'false dilemma',
        explanation: 'Presents limited options when more alternatives exist',
        severity: 5,
        confidence: 0.7,
        detectionMethod: 'regex',
      },
      slipperySlope: {
        type: 'slippery slope',
        explanation: 'Assumes a chain of events without demonstrating causation',
        severity: 5,
        confidence: 0.65,
        detectionMethod: 'regex',
      },
      circularReasoning: {
        type: 'circular reasoning',
        explanation: 'Uses the conclusion as a premise',
        severity: 6,
        confidence: 0.7,
        detectionMethod: 'regex',
      },
    };
    return signals[fallacyKey] || {
      type: fallacyKey,
      explanation: 'Logical inconsistency detected',
      severity: 4,
      confidence: 0.6,
      detectionMethod: 'regex',
    };
  }

  _buildKnowledgeContext(retrievedKnowledge) {
    if (!retrievedKnowledge || retrievedKnowledge.length === 0) return '';

    const fallacyDocs = retrievedKnowledge.filter(
      doc => doc?.metadata?.category === 'fallacy'
    );

    if (fallacyDocs.length === 0) return '';

    return fallacyDocs
      .slice(0, 2)
      .map(doc => doc.text || doc.content || '')
      .filter(Boolean)
      .join('\n');
  }

  _hasEvidenceIndicators(text) {
    const indicators = [
      'study', 'research', 'data', 'statistics', 'according to',
      'evidence', 'report', 'analysis', 'journal', 'published',
      'peer-reviewed', 'found that', 'shows that',
    ];
    const lower = text.toLowerCase();
    return indicators.some(ind => lower.includes(ind));
  }
}

const fallacyGraph = new FallacyGraph();
export default fallacyGraph;