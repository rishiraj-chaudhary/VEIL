import Claim from '../models/Claim.js';
import embeddingService from './embeddingService.js';
import grokService from './grokService.js';
import knowledgeGraphService from './knowledgeGraphService.js';

/**
 * REFUTATION DETECTION
 *
 * Identifies which of an opponent's claims a rebuttal actually attacks, and how
 * effectively. This is what makes a claim's track record real: without it every
 * claim keeps its starting resilience forever and the reputation system has no
 * input.
 *
 * Matching is semantic rather than literal. A rebuttal never restates the claim
 * it targets word-for-word, so the previous text-equality lookup could not match
 * anything in practice.
 *
 * Three tiers, degrading rather than failing:
 *   1. LLM judges which claims are addressed and scores effectiveness 0-10
 *   2. Embedding similarity picks the most likely target if the LLM is down
 *   3. Nothing recorded — never guesses, since a wrong refutation permanently
 *      corrupts a user's reputation
 */

const SIMILARITY_FLOOR = 0.55;
const MAX_TARGETS = 3;

// The LLM is willing to invent a connection between any two texts, so its
// proposals are checked against embedding similarity before being recorded.
// A refutation wrongly attributed permanently damages someone's reputation,
// which makes false positives much more costly than misses here.
const RELEVANCE_FLOOR = 0.25;
const MIN_EFFECTIVENESS = 3;

class RefutationDetectionService {
  /**
   * @param {Object} params
   * @param {string} params.rebuttalText   - The turn's content
   * @param {Array}  params.opposingClaims - Claim docs the opponent has advanced
   * @param {number} params.rebuttalQuality - 0-100 AI quality score of the turn
   * @returns {Array} [{ claim, effectiveness, reason, method }]
   */
  async detectTargets({ rebuttalText, opposingClaims, rebuttalQuality = 50 }) {
    if (!rebuttalText?.trim() || !opposingClaims?.length) return [];

    const viaLLM = await this._detectWithLLM(rebuttalText, opposingClaims);
    if (viaLLM.length > 0) {
      return this._filterIrrelevant(rebuttalText, viaLLM);
    }

    return this._detectWithEmbeddings(rebuttalText, opposingClaims);
  }

  /**
   * Drops proposed targets whose text bears no semantic relation to the
   * rebuttal. Without this the judge will happily rate unrelated prose as a
   * confident refutation of whatever it is shown.
   */
  async _filterIrrelevant(rebuttalText, targets) {
    const scored = targets.filter(t => t.effectiveness >= MIN_EFFECTIVENESS);
    if (scored.length === 0) return [];

    try {
      // embedQuery lazily initialises the client; checking isReady() first would
      // skip the guard entirely on the first call of a process.
      const rebuttalVector = await embeddingService.embedQuery(rebuttalText.slice(0, 2000));
      if (!rebuttalVector?.length) return scored;

      const kept = [];
      for (const target of scored) {
        const claimVector = target.claim.embedding?.length
          ? target.claim.embedding
          : await embeddingService.embedQuery(target.claim.originalText);

        const similarity = knowledgeGraphService.cosineSimilarity(rebuttalVector, claimVector);

        if (similarity >= RELEVANCE_FLOOR) {
          kept.push({ ...target, relevance: Number(similarity.toFixed(3)) });
        } else {
          console.log(`🚫 Rejected refutation target (relevance ${similarity.toFixed(2)} < ${RELEVANCE_FLOOR})`);
        }
      }

      return kept;

    } catch (error) {
      console.warn('Relevance filter failed, keeping LLM targets:', error.message);
      return scored;
    }
  }

  async _detectWithLLM(rebuttalText, opposingClaims) {
    try {
      const numbered = opposingClaims
        .map((c, i) => `${i + 1}. ${c.originalText}`)
        .join('\n');

      const prompt = `A debater made this rebuttal:
"""
${rebuttalText.slice(0, 2000)}
"""

Their opponent previously made these claims:
${numbered}

Which of those claims does the rebuttal directly challenge?

For EACH claim, decide the rebuttal's stance towards it:
  "refutes"   — argues the claim is wrong, unsupported, or insufficient
  "supports"  — agrees with or reinforces the claim
  "unrelated" — says nothing about this claim's subject

Be strict and default to "unrelated". Restating a claim approvingly is "supports", not "refutes". Sounding argumentative is not refuting. Being on a vaguely adjacent topic is not refuting.

Score effectiveness 0-10 (0 unless stance is "refutes"):
  0-3  mentions the claim but does not undermine it
  4-6  raises a real objection without settling it
  7-10 substantially undermines the claim with reasoning or evidence

Examples:
  "I like pizza and my favourite colour is blue" → stance "unrelated"
  "I completely agree, correlation does not equal causation" against the claim "Correlation does not equal causation" → stance "supports", effectiveness 0
  "Your study had 12 participants, far too few to generalise" against a claim citing that study → stance "refutes", effectiveness 7

Return ONLY a JSON array covering every claim you judge relevant, no preamble:
[{ "index": 1, "stance": "refutes", "effectiveness": 7, "reason": "one short clause" }]
Return [] if none are refuted.`;

      const raw = await grokService.generateFast(prompt, {
        operation: 'refutation_detection',
        systemRole: 'You are a debate judge. Return only valid JSON.',
      });

      const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map(entry => {
          const claim = opposingClaims[entry.index - 1];
          if (!claim) return null;

          // Only an explicit "refutes" counts. Agreement is semantically near
          // identical to the claim it echoes, so similarity cannot separate the
          // two — the stance label is the only reliable signal.
          if (String(entry.stance || '').toLowerCase() !== 'refutes') return null;

          const effectiveness = Math.max(0, Math.min(10, Number(entry.effectiveness) || 0));
          return {
            claim,
            effectiveness,
            reason: String(entry.reason || '').slice(0, 200),
            method: 'llm',
          };
        })
        .filter(Boolean)
        .slice(0, MAX_TARGETS);

    } catch (error) {
      console.warn('Refutation LLM detection failed, falling back:', error.message);
      return [];
    }
  }

  /**
   * Similarity alone cannot tell "I disagree with X" from "I also believe X",
   * so effectiveness is capped at the neutral midpoint on this path — it should
   * never be able to mark a claim as decisively broken.
   */
  async _detectWithEmbeddings(rebuttalText, opposingClaims) {
    try {
      const rebuttalVector = await embeddingService.embedQuery(rebuttalText.slice(0, 2000));
      if (!rebuttalVector?.length) return [];

      const scored = opposingClaims
        .filter(c => c.embedding?.length > 0)
        .map(claim => ({
          claim,
          similarity: knowledgeGraphService.cosineSimilarity(rebuttalVector, claim.embedding),
        }))
        .filter(entry => entry.similarity >= SIMILARITY_FLOOR)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 1);

      return scored.map(({ claim, similarity }) => ({
        claim,
        effectiveness: 5,
        reason: `topically engaged (similarity ${similarity.toFixed(2)})`,
        method: 'embedding',
      }));

    } catch (error) {
      console.warn('Refutation embedding fallback failed:', error.message);
      return [];
    }
  }

  /**
   * Full pass for one submitted turn: find the opponent's claims in this debate,
   * detect which are refuted, and persist the outcome.
   */
  async processTurn({ debateId, authorSide, rebuttalText, rebuttalQuality = 50 }) {
    try {
      const opposingSide = authorSide === 'for' ? 'against' : 'for';

      const opposingClaims = await Claim.find({
        'debates.debate': debateId,
        'debates.side': opposingSide,
      })
        .select('originalText embedding stats counterClaims')
        .limit(20);

      if (opposingClaims.length === 0) return [];

      const targets = await this.detectTargets({
        rebuttalText,
        opposingClaims,
        rebuttalQuality,
      });

      const recorded = [];
      for (const target of targets) {
        const result = await knowledgeGraphService.recordRefutation(
          target.claim,
          null,
          target.effectiveness,
          rebuttalQuality,
        );

        if (result) {
          recorded.push({
            claimId: target.claim._id,
            claimText: target.claim.originalText,
            effectiveness: target.effectiveness,
            reason: target.reason,
            method: target.method,
            resilienceScore: result.resilienceScore,
            survived: !result.isSuccessful,
          });
        }
      }

      if (recorded.length > 0) {
        console.log(`⚔️  Refutations recorded: ${recorded.length} claim(s) challenged`);
      }

      return recorded;

    } catch (error) {
      console.error('Refutation processing error:', error.message);
      return [];
    }
  }
}

export default new RefutationDetectionService();
