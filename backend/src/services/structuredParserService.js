import { z } from 'zod';
import grokService from './grokService.js';

/**
 * STRUCTURED OUTPUT PARSER SERVICE — Step 5 of AI Maturity Roadmap
 *
 * Problems this solves:
 *   - LLM returns malformed JSON → silent empty array failures
 *   - No validation → bad data enters the pipeline
 *   - No retry → one bad response kills the analysis
 *   - Inconsistent parsing scattered across 6+ methods
 *
 * Solution:
 *   - Zod schemas define exact expected shape
 *   - Auto-retry up to 3 times with self-healing prompt
 *   - Centralized parsing for all LLM structured outputs
 *   - Graceful fallback values when all retries fail
 */
class StructuredParserService {
  constructor() {
    this.maxRetries = 3;
    this.retryDelay = 300; // ms between retries

    // ── Zod Schemas ──────────────────────────────────────────────
    // These are the single source of truth for all LLM output shapes.

    this.schemas = {

      /**
       * Claims extracted from a debate turn.
       * ["Climate change is accelerating", "Renewable energy is cheaper"]
       */
      claims: z.array(z.string().min(5).max(300)).max(10),

      /**
       * Rebuttals identified in a turn.
       */
      rebuttals: z.array(z.string().min(5).max(300)).max(10),

      /**
       * Fallacy detection result from LLM.
       */
      fallacies: z.array(z.object({
        type: z.string().min(2).max(60),
        explanation: z.string().min(10).max(400),
        severity: z.number().int().min(1).max(10),
        confidence: z.number().min(0).max(1).optional().default(0.8),
        quote: z.string().max(200).optional(), // the offending text
      })).max(5),

      /**
       * LLM reranker scores — one float per document.
       */
      rerankScores: z.array(z.number().min(0).max(10)),

      /**
       * Persona trait extraction output.
       */
      personaTraits: z.object({
        tone: z.enum([
          'analytical', 'emotional', 'sarcastic', 'supportive',
          'aggressive', 'neutral', 'humorous'
        ]),
        vocabularyComplexity: z.number().int().min(0).max(100),
        aggressiveness: z.number().int().min(0).max(100),
        empathy: z.number().int().min(0).max(100),
        formality: z.number().int().min(0).max(100),
        humor: z.number().int().min(0).max(100),
        argumentativeStyle: z.enum([
          'evidence-based', 'logical', 'emotional', 'rhetorical', 'balanced'
        ]),
      }),

      /**
       * Topic extraction output.
       */
      topics: z.array(z.string().min(2).max(50)).max(10),

      /**
       * Live assistant insight — warnings, suggestions, opportunities.
       */
      liveInsight: z.object({
        warnings: z.array(z.object({
          type: z.string(),
          title: z.string(),
          message: z.string(),
          priority: z.enum(['high', 'medium', 'low']),
        })).max(5),
        suggestions: z.array(z.object({
          type: z.string(),
          title: z.string(),
          message: z.string(),
          priority: z.enum(['high', 'medium', 'low']),
        })).max(5),
        opportunities: z.array(z.object({
          type: z.string(),
          title: z.string(),
          message: z.string(),
          priority: z.enum(['high', 'medium', 'low']),
        })).max(5),
      }),
    };

    // Fallback values when all retries fail
    this.fallbacks = {
      claims: [],
      rebuttals: [],
      fallacies: [],
      rerankScores: null, // null = use uniform scores
      personaTraits: {
        tone: 'neutral',
        vocabularyComplexity: 50,
        aggressiveness: 50,
        empathy: 50,
        formality: 50,
        humor: 50,
        argumentativeStyle: 'balanced',
      },
      topics: [],
      liveInsight: { warnings: [], suggestions: [], opportunities: [] },
    };
  }

  /**
   * Parse + validate an LLM response against a named schema.
   * Retries up to maxRetries times with a self-healing prompt.
   *
   * @param {string} schemaName - key in this.schemas
   * @param {string} rawResponse - raw LLM output string
   * @param {string} originalPrompt - the prompt that generated rawResponse
   * @param {Object} aiContext - { userId, debateId, userTier, operation }
   * @returns {any} Validated data or fallback value
   */
  async parse(schemaName, rawResponse, originalPrompt = '', aiContext = {}) {
    const schema = this.schemas[schemaName];
    if (!schema) {
      console.error(`❌ Unknown schema: ${schemaName}`);
      return this.fallbacks[schemaName] ?? null;
    }

    // Attempt 1: parse the original response
    const firstAttempt = this._tryParse(schema, rawResponse);
    if (firstAttempt.success) {
      return firstAttempt.data;
    }

    console.warn(`⚠️ [${schemaName}] Parse failed: ${firstAttempt.error}`);

    // Attempts 2-N: ask LLM to fix its output
    for (let attempt = 2; attempt <= this.maxRetries; attempt++) {
      console.log(`🔄 [${schemaName}] Retry ${attempt}/${this.maxRetries}...`);

      await this._delay(this.retryDelay * (attempt - 1));

      try {
        const fixedResponse = await this._selfHeal(
          schemaName,
          rawResponse,
          firstAttempt.error,
          aiContext
        );

        const retryAttempt = this._tryParse(schema, fixedResponse);
        if (retryAttempt.success) {
          console.log(`✅ [${schemaName}] Self-healed on attempt ${attempt}`);
          return retryAttempt.data;
        }

        console.warn(`⚠️ [${schemaName}] Attempt ${attempt} still failed: ${retryAttempt.error}`);
        rawResponse = fixedResponse; // use fixed version for next retry

      } catch (error) {
        console.error(`❌ [${schemaName}] Self-heal error on attempt ${attempt}:`, error.message);
      }
    }

    // All retries exhausted
    console.error(`❌ [${schemaName}] All ${this.maxRetries} attempts failed. Using fallback.`);
    return this.fallbacks[schemaName] ?? null;
  }

  /**
   * Parse a raw string directly without LLM retry.
   * Use this when you just need clean JSON extraction + validation.
   * Does NOT call the LLM again on failure.
   *
   * @param {string} schemaName
   * @param {string} rawResponse
   * @returns {{ success: boolean, data: any, error: string|null }}
   */
  parseSync(schemaName, rawResponse) {
    const schema = this.schemas[schemaName];
    if (!schema) {
      return { success: false, data: this.fallbacks[schemaName] ?? null, error: `Unknown schema: ${schemaName}` };
    }

    const result = this._tryParse(schema, rawResponse);
    if (!result.success) {
      return { success: false, data: this.fallbacks[schemaName] ?? null, error: result.error };
    }

    return { success: true, data: result.data, error: null };
  }

  /**
   * Internal: attempt to extract + validate JSON from a raw string.
   */
  _tryParse(schema, rawResponse) {
    try {
      const extracted = this._extractJSON(rawResponse);
      const parsed = JSON.parse(extracted);
      const validated = schema.parse(parsed);
      return { success: true, data: validated };
    } catch (error) {
      return {
        success: false,
        error: error instanceof z.ZodError
          ? error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
          : error.message,
      };
    }
  }

  /**
   * Extract JSON from messy LLM output.
   * Handles: markdown fences, leading text, trailing text.
   */
  _extractJSON(text) {
    if (!text || typeof text !== 'string') throw new Error('Empty response');

    // Remove markdown code fences
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Try to extract array
    const arrayMatch = cleaned.match(/(\[[\s\S]*\])/);
    if (arrayMatch) return arrayMatch[1];

    // Try to extract object
    const objectMatch = cleaned.match(/(\{[\s\S]*\})/);
    if (objectMatch) return objectMatch[1];

    // Return cleaned text as last resort
    return cleaned;
  }

  /**
   * Ask the LLM to fix its own malformed output.
   * Single focused prompt: "your output was wrong, here's why, fix it."
   */
  async _selfHeal(schemaName, badResponse, errorMessage, aiContext = {}) {
    const schemaDescription = this._getSchemaDescription(schemaName);

    const healPrompt = `Your previous response was malformed. Fix it.

Error: ${errorMessage}

Expected format:
${schemaDescription}

Your bad response was:
${badResponse.substring(0, 500)}

Return ONLY valid JSON matching the expected format. No explanation, no markdown.`;

    return await grokService.generateFast(healPrompt, {
      ...aiContext,
      operation: aiContext.operation || 'structured_output',
      temperature: 0.1, // low temperature for deterministic formatting
    });
  }

  /**
   * Human-readable schema descriptions for the self-heal prompt.
   */
  _getSchemaDescription(schemaName) {
    const descriptions = {
      claims: '["claim text 1", "claim text 2"]  (array of strings)',
      rebuttals: '["rebuttal 1", "rebuttal 2"]  (array of strings)',
      fallacies: `[{"type": "ad hominem", "explanation": "...", "severity": 7, "confidence": 0.85}]`,
      rerankScores: '[7, 2, 9, 4]  (array of numbers 0-10, one per document)',
      personaTraits: `{"tone": "analytical", "vocabularyComplexity": 65, "aggressiveness": 30, "empathy": 70, "formality": 60, "humor": 20, "argumentativeStyle": "evidence-based"}`,
      topics: '["climate change", "economics", "policy"]  (array of topic strings)',
      liveInsight: `{"warnings": [], "suggestions": [], "opportunities": []}`,
    };
    return descriptions[schemaName] || 'Valid JSON matching the requested schema.';
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics about parse success/failure rates.
   * Useful for monitoring in production.
   */
  getSchemaNames() {
    return Object.keys(this.schemas);
  }
}

const structuredParserService = new StructuredParserService();
export default structuredParserService;