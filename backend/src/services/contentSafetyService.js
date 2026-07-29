import axios from 'axios';
import grokService from './grokService.js';

/**
 * CONTENT SAFETY
 *
 * Replaces keyword matching for toxicity with graded scoring.
 *
 * A fixed word list only catches the exact insults someone thought to write down.
 * It misses everything phrased differently, every language other than English,
 * and every polite-sounding contemptuous remark — while flagging quoted or
 * discussed slurs that are not attacks at all. Toxicity is a property of intent
 * and context, not vocabulary.
 *
 * Three tiers, each degrading to the next:
 *   1. Perspective API — purpose-built, multilingual, returns 0-1 probabilities
 *   2. LLM — no API key required beyond the one already used elsewhere
 *   3. Keyword heuristic — the original behaviour, never worse than before
 */

const PERSPECTIVE_URL = 'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze';
const PERSPECTIVE_ATTRIBUTES = ['TOXICITY', 'SEVERE_TOXICITY', 'INSULT', 'IDENTITY_ATTACK', 'THREAT'];

const TOXIC_PATTERNS = [
  /\b(idiot|moron|stupid|dumb|shut up|you('re| are) wrong|garbage|trash|pathetic|loser)\b/i,
  /\b(hate|disgusting|disgrace|embarrassing|delusional|brainwashed)\b/i,
];

// Model scores vary slightly between runs, so a threshold sitting exactly on a
// common output value makes borderline cases flip. Genuinely toxic content
// scores well above this; ambiguous cases — quoting an insult to complain about
// it, blunt disagreement — cluster around 0.5-0.6 and should not be actioned.
// Erring toward under-flagging is deliberate: a false positive silences someone
// who did nothing wrong.
const DEFAULT_THRESHOLD = 0.7;
const MAX_LENGTH = 3000;

class ContentSafetyService {
  constructor() {
    this.perspectiveKey = process.env.PERSPECTIVE_API_KEY || null;
    this.perspectiveDisabled = false;
    this.cache = new Map();
    this.cacheLimit = 2000;
  }

  get provider() {
    if (this.perspectiveKey && !this.perspectiveDisabled) return 'perspective';
    return grokService ? 'llm' : 'heuristic';
  }

  _cacheGet(text) {
    const hit = this.cache.get(text);
    if (!hit) return null;
    this.cache.delete(text);
    this.cache.set(text, hit);
    return hit;
  }

  _cacheSet(text, value) {
    this.cache.set(text, value);
    while (this.cache.size > this.cacheLimit) {
      this.cache.delete(this.cache.keys().next().value);
    }
  }

  /**
   * @returns {{ score: number, isToxic: boolean, categories: Object, method: string }}
   *          score is 0-1; anything at or above `threshold` is treated as toxic.
   */
  async analyse(text, { threshold = DEFAULT_THRESHOLD } = {}) {
    const trimmed = (text || '').trim().slice(0, MAX_LENGTH);
    if (!trimmed) return { score: 0, isToxic: false, categories: {}, method: 'empty' };

    const cached = this._cacheGet(trimmed);
    if (cached) return { ...cached, isToxic: cached.score >= threshold };

    const result =
      (await this._viaPerspective(trimmed)) ||
      (await this._viaLLM(trimmed)) ||
      this._viaHeuristic(trimmed);

    this._cacheSet(trimmed, result);
    return { ...result, isToxic: result.score >= threshold };
  }

  async _viaPerspective(text) {
    if (!this.perspectiveKey || this.perspectiveDisabled) return null;

    try {
      const requestedAttributes = Object.fromEntries(
        PERSPECTIVE_ATTRIBUTES.map(attr => [attr, {}])
      );

      const { data } = await axios.post(
        `${PERSPECTIVE_URL}?key=${this.perspectiveKey}`,
        { comment: { text }, languages: [], requestedAttributes, doNotStore: true },
        { timeout: 4000 },
      );

      const categories = {};
      for (const attr of PERSPECTIVE_ATTRIBUTES) {
        const value = data.attributeScores?.[attr]?.summaryScore?.value;
        if (typeof value === 'number') categories[attr.toLowerCase()] = Number(value.toFixed(3));
      }

      const score = categories.toxicity ?? Math.max(0, ...Object.values(categories), 0);
      return { score, categories, method: 'perspective' };

    } catch (error) {
      const status = error.response?.status;

      // A bad key or disabled API will fail identically on every call — stop
      // paying the timeout on each one and fall through permanently.
      if (status === 400 || status === 403) {
        this.perspectiveDisabled = true;
        console.warn(`⚠️  Perspective API unavailable (${status}) — using LLM/heuristic instead`);
      }
      return null;
    }
  }

  async _viaLLM(text) {
    try {
      const prompt = `Rate how toxic this message is, as a debate/forum moderator would.

Message:
"""
${text}
"""

Score how hostile the message is TOWARDS ITS READER.

TOXIC (0.7-1.0): insults aimed at a person, contempt, harassment, threats,
telling someone they are worthless or unwanted, demeaning language.

NOT TOXIC (0.0-0.3):
- disagreeing forcefully or bluntly criticising an argument
- REPORTING or QUOTING an insult someone else made ("he called me stupid")
  — the speaker is describing hostility, not committing it
- discussing offensive language as a topic

Ask: is the writer attacking someone, or describing an attack? Only attacking is toxic.

Return ONLY JSON in exactly this shape, filling in your own values:
{"score": <0.0-1.0>, "insult": <0.0-1.0>, "threat": <0.0-1.0>, "identity_attack": <0.0-1.0>}`;

      // Fast model. This was moved to the smart model to fix unstable scoring,
      // but the explicit stance instructions in the prompt above turned out to
      // carry most of that improvement — and the 70B daily token budget is
      // better spent on fallacy detection and turn scoring, which users see.
      const raw = await grokService.generateFast(prompt, {
        operation: 'content_safety',
        systemRole: 'You are a content moderation classifier. Return only valid JSON.',
      });

      const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*?\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : clean);

      const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));

      return {
        score: clamp(parsed.score),
        categories: {
          insult: clamp(parsed.insult),
          threat: clamp(parsed.threat),
          identity_attack: clamp(parsed.identity_attack),
        },
        method: 'llm',
      };

    } catch (error) {
      // Logged rather than swallowed: a silent failure here degrades every
      // moderation decision to keyword matching with no indication why.
      if (!this.llmErrorLogged) {
        console.warn(`⚠️  Toxicity model unavailable, using keyword fallback: ${error.message}`);
        this.llmErrorLogged = true;
      }
      return null;
    }
  }

  /** Original keyword behaviour, retained as the last resort. */
  _viaHeuristic(text) {
    const hits = TOXIC_PATTERNS.filter(p => p.test(text)).length;
    return {
      score: hits === 0 ? 0 : Math.min(1, 0.5 + hits * 0.25),
      categories: { keyword_hits: hits },
      method: 'heuristic',
    };
  }

  /** Convenience for callers that only need a boolean. */
  async isToxic(text, options) {
    const { isToxic } = await this.analyse(text, options);
    return isToxic;
  }

  /**
   * Scores many texts with bounded concurrency — analytics passes over a
   * community's comments would otherwise issue hundreds of parallel requests.
   */
  async analyseMany(texts, { threshold = DEFAULT_THRESHOLD, concurrency = 5 } = {}) {
    const results = new Array(texts.length);

    for (let i = 0; i < texts.length; i += concurrency) {
      const slice = texts.slice(i, i + concurrency);
      const scored = await Promise.all(slice.map(t => this.analyse(t, { threshold })));
      scored.forEach((r, j) => { results[i + j] = r; });
    }

    return results;
  }
}

export default new ContentSafetyService();
export { TOXIC_PATTERNS };
