import PersonaSnapshot from '../../models/PersonaSnapshot.js';
import Slick from '../../models/slick.js';
import embeddingService from '../embeddingService.js';
import grokService from '../grokService.js';
import structuredParserService from '../structuredParserService.js';

/**
 * PERCEPTION GRAPH — Step 10 of AI Maturity Roadmap
 *
 * Transforms the Slick system from a compliment tool into a
 * perception engine — tracking how OTHER users see you over time.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Two complementary signals:                                      │
 * │                                                                  │
 * │  Persona Drift   = how YOU are changing (your own content)      │
 * │  Perception      = how OTHERS see you (their Slicks to you)     │
 * │                                                                  │
 * │  The GAP between these two is the coaching insight.             │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Graph nodes:
 *   1. collectSignals       — gather recent received Slicks
 *   2. classifyTraits       — LLM extracts perception traits from Slick content
 *   3. applyRecencyWeight   — recent Slicks weighted more heavily
 *   4. computeEmbedding     — generate perception vector
 *   5. compareToPrevious    — diff against last perception snapshot
 *   6. computeSelfGap       — compare perception vs persona drift (NEW insight)
 *   7. generateSummary      — LLM produces human-readable perception summary
 *   8. persist              — save to User model perception fields
 *
 * Output stored on User (patch required — see User_patch.js):
 *   perceptionTraits    — qualities others associate with you
 *   perceptionEmbedding — vector of public perception
 *   perceptionTrend     — 'improving' | 'stable' | 'declining' | 'shifting'
 *   perceptionSummary   — "Others see you as increasingly authoritative..."
 *   perceptionUpdatedAt — timestamp of last perception update
 *
 * Persona drift integration:
 *   After computing perception traits, the graph loads the user's latest
 *   PersonaSnapshot and computes the SELF-GAP:
 *     - You think you're empathetic (high empathy trait in persona snapshot)
 *     - Others are sending you "sharp and blunt" Slicks
 *     → Gap surfaced as a coaching insight in the summary
 */
class PerceptionGraph {

  // ─────────────────────────────────────────────────────────────────
  // MAIN ENTRY POINT
  // ─────────────────────────────────────────────────────────────────

  /**
   * Run the full perception analysis graph for a user.
   *
   * @param {string} userId        - Target user ID
   * @param {Object} options
   * @param {number} options.lookbackDays  - How many days of Slicks to analyze (default: 30)
   * @param {boolean} options.persist      - Whether to save results to User model (default: true)
   * @returns {Object} perceptionResult
   */
  async run(userId, options = {}) {
    const { lookbackDays = 90, persist = true } = options;

    const state = {
      userId,
      lookbackDays,
      slicks: [],
      weightedSlicks: [],
      perceptionTraits: null,
      perceptionEmbedding: [],
      previousPerception: null,
      trend: 'stable',
      selfGap: null,
      summary: '',
      coachingInsights: [],
    };

    try {
      await this._node_collectSignals(state);

      if (state.slicks.length === 0) {
        return this._emptyResult(userId);
      }

      await this._node_applyRecencyWeight(state);
      await this._node_classifyTraits(state);
      await this._node_computeEmbedding(state);
      await this._node_compareToPrevious(state);
      await this._node_computeSelfGap(state);
      await this._node_generateSummary(state);

      if (persist) {
        await this._node_persist(state);
      }

      return this._assembleResult(state);

    } catch (error) {
      console.error('❌ PerceptionGraph error:', error.message);
      return this._emptyResult(userId);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 1 — COLLECT SIGNALS
  // ─────────────────────────────────────────────────────────────────

  async _node_collectSignals(state) {
    const { userId, lookbackDays } = state;

    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const slicks = await Slick.find({
      targetUser: userId,
      isActive: true,
      isFlagged: false,
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('content tone credibilityScore reactions createdAt aiAnalysis')
      .lean();

    state.slicks = slicks;
    console.log(`🔷 [Perception:1] Collected ${slicks.length} Slicks for user ${userId}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 2 — APPLY RECENCY WEIGHT
  // ─────────────────────────────────────────────────────────────────

  async _node_applyRecencyWeight(state) {
    const now = Date.now();

    state.weightedSlicks = state.slicks.map(slick => {
      const daysDiff = (now - new Date(slick.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      // Exponential decay: recent = weight ~1.0, 30 days old = weight ~0.05
      const recencyWeight = Math.exp(-0.1 * daysDiff);

      // Credibility weight: high-credibility Slicks matter more
      const credibilityWeight = (slick.credibilityScore || 50) / 100;

      // Community agreement weight: agree reactions boost signal
      const totalReactions = Object.values(slick.reactions || {}).reduce((s, v) => s + v, 0);
      const agreeRate = totalReactions > 0
        ? (slick.reactions?.agree || 0) / totalReactions
        : 0.5;

      const finalWeight = recencyWeight * 0.5 + credibilityWeight * 0.3 + agreeRate * 0.2;

      return { ...slick, weight: finalWeight };
    });

    // Sort by final weight descending — top signals first
    state.weightedSlicks.sort((a, b) => b.weight - a.weight);

    console.log(`🔷 [Perception:2] Weighted ${state.weightedSlicks.length} Slicks`);
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 3 — CLASSIFY TRAITS (LLM)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Uses LLM to extract what qualities others are attributing to this user
   * based on the content of Slicks they've received.
   *
   * Uses the existing personaTraits Zod schema from structuredParserService
   * so we get the same shape as persona drift — enabling direct comparison.
   */
  async _node_classifyTraits(state) {
    try {
      // Use top 15 weighted Slicks for LLM analysis
      const topSlicks = state.weightedSlicks.slice(0, 15);

      // Weight-sorted content sample
      const contentSample = topSlicks
        .map((s, i) => `[${i + 1}] (${s.tone?.category || 'general'}, weight: ${s.weight.toFixed(2)}): "${s.content}"`)
        .join('\n');

      const toneBreakdown = this._computeToneBreakdown(state.slicks);

      const prompt = `Analyze these anonymous Slicks (feedback messages) received by a user and extract how OTHERS perceive them.

Slicks received (sorted by signal strength):
${contentSample}

Tone breakdown: ${JSON.stringify(toneBreakdown)}

Based on what others are saying about this person, extract perception traits.
Return ONLY valid JSON:

{
  "tone": "<dominant tone others perceive: analytical|emotional|sarcastic|supportive|aggressive|neutral|humorous>",
  "vocabularyComplexity": <0-100: how intellectually complex others perceive this user>,
  "aggressiveness": <0-100: how aggressive/assertive others perceive this user>,
  "empathy": <0-100: how empathetic others perceive this user>,
  "formality": <0-100: how formal others perceive this user>,
  "humor": <0-100: how humorous others perceive this user>,
  "argumentativeStyle": "<evidence-based|logical|emotional|rhetorical|balanced>"
}

Choose ONE value per field. Base this on the CONTENT of what others say, not what the user says about themselves.`;

      const response = await grokService.generateFast(prompt, {
        operation: 'perception_classification',
        temperature: 0.3,
      });

      const result = structuredParserService.parseSync('personaTraits', response);

      if (result.success) {
        state.perceptionTraits = result.data;
        console.log(`🔷 [Perception:3] Traits classified — perceived as: ${result.data.tone}`);
      } else {
        // Fallback: derive basic traits from tone breakdown
        state.perceptionTraits = this._fallbackTraits(toneBreakdown);
        console.log(`🔷 [Perception:3] Using fallback traits`);
      }

    } catch (error) {
      console.error('❌ [Perception:3] Trait classification error:', error.message);
      state.perceptionTraits = this._fallbackTraits(this._computeToneBreakdown(state.slicks));
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 4 — COMPUTE EMBEDDING
  // ─────────────────────────────────────────────────────────────────

  async _node_computeEmbedding(state) {
    try {
      const contentText = state.weightedSlicks
        .slice(0, 10)
        .map(s => s.content)
        .join(' ')
        .substring(0, 2000);

      const traitSummary = state.perceptionTraits
        ? `Perceived as: ${state.perceptionTraits.tone}. Style: ${state.perceptionTraits.argumentativeStyle}. Empathy: ${state.perceptionTraits.empathy}/100.`
        : '';

      const embeddingText = `${traitSummary} ${contentText}`.trim();

      const embeddings = embeddingService.getEmbeddings();
      if (embeddings) {
        state.perceptionEmbedding = await embeddings.embedQuery(embeddingText);
        console.log(`🔷 [Perception:4] Embedding computed (dim: ${state.perceptionEmbedding.length})`);
      } else {
        state.perceptionEmbedding = [];
        console.log(`🔷 [Perception:4] Embedding skipped — embedding service not ready`);
      }

    } catch (error) {
      console.error('❌ [Perception:4] Embedding error:', error.message);
      state.perceptionEmbedding = [];
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 5 — COMPARE TO PREVIOUS
  // ─────────────────────────────────────────────────────────────────

  async _node_compareToPrevious(state) {
    try {
      const User = (await import('../../models/user.js')).default;
      const user = await User.findById(state.userId)
        .select('perceptionTraits perceptionEmbedding perceptionUpdatedAt')
        .lean();

      if (!user?.perceptionTraits) {
        state.previousPerception = null;
        state.trend = 'stable';
        console.log(`🔷 [Perception:5] No previous perception — first run`);
        return;
      }

      state.previousPerception = {
        traits: user.perceptionTraits,
        embedding: user.perceptionEmbedding || [],
        updatedAt: user.perceptionUpdatedAt,
      };

      // ── Compute embedding similarity ──────────────────────────────
      let embeddingSimilarity = 1;
      if (state.perceptionEmbedding.length > 0 && state.previousPerception.embedding.length > 0) {
        embeddingSimilarity = this._cosineSimilarity(
          state.perceptionEmbedding,
          state.previousPerception.embedding
        );
      }

      // ── Compute trait delta ───────────────────────────────────────
      const traitDelta = this._computeTraitDelta(
        state.perceptionTraits,
        state.previousPerception.traits
      );

      // ── Classify trend ────────────────────────────────────────────
      state.trend = this._classifyTrend(embeddingSimilarity, traitDelta);

      console.log(`🔷 [Perception:5] Trend: ${state.trend} (similarity: ${embeddingSimilarity.toFixed(3)})`);

    } catch (error) {
      console.error('❌ [Perception:5] Compare error:', error.message);
      state.trend = 'stable';
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 6 — COMPUTE SELF-GAP (Persona Drift vs Perception)
  // ─────────────────────────────────────────────────────────────────

  /**
   * This is the core insight of the PerceptionGraph.
   *
   * Loads the user's latest PersonaSnapshot (how they see themselves /
   * how their own content describes them) and compares it to the
   * perceptionTraits (how others see them via Slicks).
   *
   * Large gaps surface as coaching insights:
   *   "You consider yourself empathetic (empathy: 78) but others perceive
   *    you as aggressive (aggressiveness: 71). Consider your tone in debates."
   */
  async _node_computeSelfGap(state) {
    try {
      const snapshot = await PersonaSnapshot.findOne({ userId: state.userId })
        .sort({ timestamp: -1 })
        .select('traits summary')
        .lean();

      if (!snapshot?.traits || !state.perceptionTraits) {
        state.selfGap = null;
        console.log(`🔷 [Perception:6] Self-gap skipped — missing persona or perception`);
        return;
      }

      const selfTraits = snapshot.traits;
      const perceivedTraits = state.perceptionTraits;

      const gaps = [];
      const insights = [];

      // ── Compare numeric traits ────────────────────────────────────
      const numericTraits = ['aggressiveness', 'empathy', 'formality', 'humor', 'vocabularyComplexity'];

      for (const trait of numericTraits) {
        const selfVal = selfTraits[trait] || 50;
        const perceivedVal = perceivedTraits[trait] || 50;
        const delta = perceivedVal - selfVal;
        const absDelta = Math.abs(delta);

        if (absDelta >= 20) {
          const direction = delta > 0 ? 'higher' : 'lower';
          const label = this._traitLabel(trait);

          gaps.push({ trait, selfVal, perceivedVal, delta });

          // Generate specific insight based on which trait and direction
          const insight = this._buildGapInsight(trait, selfVal, perceivedVal, delta, label);
          if (insight) insights.push(insight);
        }
      }

      // ── Compare tone ──────────────────────────────────────────────
      if (selfTraits.tone !== perceivedTraits.tone) {
        insights.push(
          `💡 You come across as **${selfTraits.tone}** in your own writing, but others perceive you as **${perceivedTraits.tone}**. This gap may affect how your arguments land.`
        );
      }

      // ── Compare argumentative style ───────────────────────────────
      if (selfTraits.argumentativeStyle !== perceivedTraits.argumentativeStyle) {
        insights.push(
          `💡 You debate in a **${selfTraits.argumentativeStyle}** style, but others perceive your style as **${perceivedTraits.argumentativeStyle}**.`
        );
      }

      state.selfGap = {
        gaps,
        insights,
        selfTone: selfTraits.tone,
        perceivedTone: perceivedTraits.tone,
        gapScore: gaps.length > 0
          ? Math.round(gaps.reduce((sum, g) => sum + Math.abs(g.delta), 0) / gaps.length)
          : 0,
      };

      state.coachingInsights = insights;

      console.log(`🔷 [Perception:6] Self-gap: ${gaps.length} significant gaps found`);

    } catch (error) {
      console.error('❌ [Perception:6] Self-gap error:', error.message);
      state.selfGap = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 7 — GENERATE SUMMARY (LLM)
  // ─────────────────────────────────────────────────────────────────

  async _node_generateSummary(state) {
    try {
      const { perceptionTraits, trend, selfGap, slicks } = state;
      const toneBreakdown = this._computeToneBreakdown(slicks);

      const gapSection = selfGap?.insights?.length > 0
        ? `\nSelf-perception gaps:\n${selfGap.insights.slice(0, 2).join('\n')}`
        : '';

      const prompt = `Write a 2-sentence summary of how this person is perceived by others based on anonymous feedback.

Perceived traits:
- Tone: ${perceptionTraits?.tone}
- Aggressiveness: ${perceptionTraits?.aggressiveness}/100
- Empathy: ${perceptionTraits?.empathy}/100
- Argumentative style: ${perceptionTraits?.argumentativeStyle}

Feedback breakdown: ${JSON.stringify(toneBreakdown)}
Perception trend: ${trend}
${gapSection}

Write a summary that:
1. Describes how others see this person (not how they see themselves)
2. Is honest but constructive
3. References the trend if it's not 'stable'
4. Is exactly 2 sentences

Return only the summary text, no JSON.`;

      const response = await grokService.generateFast(prompt, {
        operation: 'perception_summary',
        temperature: 0.5,
      });

      state.summary = response.trim();
      console.log(`🔷 [Perception:7] Summary generated`);

    } catch (error) {
      console.error('❌ [Perception:7] Summary error:', error.message);
      state.summary = `Others perceive you as ${state.perceptionTraits?.tone || 'neutral'} with a ${state.perceptionTraits?.argumentativeStyle || 'balanced'} style.`;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 8 — PERSIST
  // ─────────────────────────────────────────────────────────────────

  async _node_persist(state) {
    try {
      const User = (await import('../../models/user.js')).default;

      await User.updateOne(
        { _id: state.userId },
        {
          $set: {
            perceptionTraits: state.perceptionTraits,
            perceptionEmbedding: state.perceptionEmbedding,
            perceptionTrend: state.trend,
            perceptionSummary: state.summary,
            perceptionUpdatedAt: new Date(),
          },
        }
      );

      console.log(`🔷 [Perception:8] Persisted to User model`);

    } catch (error) {
      console.error('❌ [Perception:8] Persist error:', error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────

  _computeToneBreakdown(slicks) {
    const breakdown = { praise: 0, tease: 0, constructive: 0, observation: 0 };
    slicks.forEach(s => {
      const cat = s.tone?.category;
      if (cat && breakdown.hasOwnProperty(cat)) breakdown[cat]++;
    });
    return breakdown;
  }

  _fallbackTraits(toneBreakdown) {
    const dominant = Object.entries(toneBreakdown)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'observation';

    return {
      tone: dominant === 'praise' ? 'supportive' : dominant === 'tease' ? 'humorous' : 'neutral',
      vocabularyComplexity: 50,
      aggressiveness: 40,
      empathy: 55,
      formality: 50,
      humor: dominant === 'tease' ? 65 : 40,
      argumentativeStyle: 'balanced',
    };
  }

  _computeTraitDelta(current, previous) {
    const traits = ['aggressiveness', 'empathy', 'formality', 'humor', 'vocabularyComplexity'];
    let totalDelta = 0;
    let count = 0;

    traits.forEach(t => {
      if (current[t] != null && previous[t] != null) {
        totalDelta += Math.abs(current[t] - previous[t]);
        count++;
      }
    });

    return count > 0 ? totalDelta / count : 0;
  }

  _classifyTrend(embeddingSimilarity, traitDelta) {
    if (embeddingSimilarity > 0.92 && traitDelta < 10) return 'stable';
    if (traitDelta > 25) return 'shifting';
    if (embeddingSimilarity < 0.7) return 'shifting';

    // Use empathy/aggressiveness direction to determine improving vs declining
    // (handled more precisely in generateSummary via LLM)
    return traitDelta > 15 ? 'shifting' : 'stable';
  }

  _cosineSimilarity(vecA, vecB) {
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

  _traitLabel(trait) {
    const labels = {
      aggressiveness: 'aggressiveness',
      empathy: 'empathy',
      formality: 'formality',
      humor: 'humor',
      vocabularyComplexity: 'perceived intellectual complexity',
    };
    return labels[trait] || trait;
  }

  _buildGapInsight(trait, selfVal, perceivedVal, delta, label) {
    const direction = delta > 0 ? 'higher' : 'lower';

    const insightMap = {
      aggressiveness: delta > 0
        ? `💡 Others perceive you as more aggressive (${perceivedVal}/100) than you may realize (self: ${selfVal}/100). Your debate turns may read as combative even when you don't intend it.`
        : `💡 Others see you as calmer (${perceivedVal}/100) than you feel internally (self: ${selfVal}/100). Your composed presentation is working in your favor.`,

      empathy: delta > 0
        ? `💡 Others perceive you as more empathetic (${perceivedVal}/100) than you give yourself credit for (self: ${selfVal}/100). Lean into this strength.`
        : `💡 You consider yourself empathetic (${selfVal}/100) but others perceive you as less so (${perceivedVal}/100). Your arguments may benefit from more acknowledgment of opposing views.`,

      formality: delta > 0
        ? `💡 Others see you as more formal (${perceivedVal}/100) than your self-image (${selfVal}/100). Consider whether this creates distance in community discussions.`
        : `💡 You come across as more casual (${perceivedVal}/100) than intended (${selfVal}/100). This can help approachability but may reduce perceived authority.`,

      humor: delta > 0
        ? `💡 Others enjoy your humor more than you might expect (perceived: ${perceivedVal}/100 vs self: ${selfVal}/100). This is a strong community-building asset.`
        : null,

      vocabularyComplexity: delta > 0
        ? `💡 Others perceive your arguments as more complex (${perceivedVal}/100) than you intend (${selfVal}/100). Consider simplifying key points for broader impact.`
        : `💡 Your arguments may be perceived as simpler (${perceivedVal}/100) than the nuance you put in (${selfVal}/100). Adding explicit signposting can help.`,
    };

    return insightMap[trait] || null;
  }

  _assembleResult(state) {
    return {
      userId: state.userId,
      slickCount: state.slicks.length,
      perceptionTraits: state.perceptionTraits,
      perceptionEmbedding: state.perceptionEmbedding,
      trend: state.trend,
      summary: state.summary,
      selfGap: state.selfGap ? {
        gapScore: state.selfGap.gapScore,
        gaps: state.selfGap.gaps,
        selfTone: state.selfGap.selfTone,
        perceivedTone: state.selfGap.perceivedTone,
      } : null,
      coachingInsights: state.coachingInsights,
      toneBreakdown: this._computeToneBreakdown(state.slicks),
      updatedAt: new Date(),
    };
  }

  _emptyResult(userId) {
    return {
      userId,
      slickCount: 0,
      perceptionTraits: null,
      perceptionEmbedding: [],
      trend: 'stable',
      summary: 'Not enough Slicks received yet to build a perception profile.',
      selfGap: null,
      coachingInsights: [],
      toneBreakdown: { praise: 0, tease: 0, constructive: 0, observation: 0 },
      updatedAt: new Date(),
    };
  }
}

const perceptionGraph = new PerceptionGraph();
export default perceptionGraph;