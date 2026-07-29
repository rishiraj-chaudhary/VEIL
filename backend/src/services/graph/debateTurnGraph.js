import PersonaSnapshot from '../../models/PersonaSnapshot.js';
import factCheckService from '../factCheckService.js';
import grokService from '../grokService.js';
import structuredParserService from '../structuredParserService.js';
import { theoryFor } from '../debateTheory.js';
import fallacyGraph from './fallacyGraph.js';
import {
  calculateQuality,
  scoreClarity,
  scoreEvidence,
  scoreRubric,
  scoreTone,
} from './scoring/argumentScorer.js';

/**
 * DEBATE TURN GRAPH — Step 7 of AI Maturity Roadmap
 *
 * Converts the procedural analyzeTurn() into a stateful, inspectable graph.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     GRAPH STATE                                  │
 * │  content, side, round, userId, userTier, debateId               │
 * │  + personaContext (NEW) → personalizes ALL Grok AI calls        │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Node execution order:
 *   1.  buildContext         — assembles previous turns into context string
 *   2.  loadPersona          — fetches latest PersonaSnapshot for this user (NEW)
 *   3.  retrieveKnowledge    — hybrid RAG retrieval (knowledge + memory)
 *   4.  detectFallacies      — FallacyGraph (LLM + regex hybrid)
 *   5.  extractClaims        — structured claim extraction, persona-tuned
 *   6.  extractRebuttals     — rebuttal identification, persona-tuned
 *   7.  analyzeTone          — heuristic fallback: fallacy-aware tone scoring
 *   8.  analyzeClarity       — heuristic fallback: structure + readability
 *   9.  analyzeEvidence      — heuristic fallback: evidence indicators
 *   9b. analyzeRubric        — model grades substance/evidence/clarity/tone,
 *                              overriding the heuristics above when available
 *   10. calculateQuality     — weighted final score
 *   11. factCheck            — optional RAG fact verification
 *   12. storeMemory          — persist turn to vector memory
 *   13. buildResult          — assemble final return object + decision trace
 *
 * Persona drift integration points:
 *   - loadPersona injects traits + drift direction into state
 *   - extractClaims: vocab complexity tunes suggestion depth
 *   - extractRebuttals: argumentativeStyle shapes rebuttal prompts
 *   - analyzeTone: aggressiveness drift triggers targeted warnings
 *   - calculateQuality: persona baseline adjusts feedback framing
 *   - buildResult: drift-aware coaching tips appended to decision trace
 */
class DebateTurnGraph {
  constructor() {
    this.useRAG = false;
    this.vectorStore = null;
  }

  setVectorStore(vectorStore, useRAG) {
    this.vectorStore = vectorStore;
    this.useRAG = useRAG;
  }

  // ─────────────────────────────────────────────────────────────────
  // MAIN ENTRY POINT
  // ─────────────────────────────────────────────────────────────────

  /**
   * Run the full debate turn analysis graph.
   *
   * @param {string}   content        - The debate turn text
   * @param {string}   side           - 'for' | 'against'
   * @param {Array}    previousTurns  - Prior turns in this debate
   * @param {string}   userId         - Author's user ID
   * @param {string}   debateId       - Current debate ID
   * @param {string}   userTier       - 'free' | 'pro' | 'team' | 'enterprise'
   * @returns {Object} Full analysis result with decisionTrace
   */
  async run(content, side, previousTurns = [], userId = null, debateId = null, userTier = 'free') {
    // ── Initialize shared state ───────────────────────────────────
    const state = {
      // Inputs
      content,
      side,
      previousTurns,
      userId,
      debateId,
      userTier,
      // Published onto state because scoring lives outside this class now and
      // must not depend on `this`.
      useRAG: this.useRAG,

      // Built during execution
      contextString: '',
      personaContext: null,       // ← persona drift lives here
      aiContext: {
        userId,
        debateId,
        userTier,
        temperature: 0.3,
      },

      // Node outputs
      retrievedKnowledge: { sources: [], context: '', knowledgeDocs: [], memoryDocs: [] },
      fallacies: [],
      claims: [],
      rebuttals: [],
      toneScore: 50,
      clarityScore: 50,
      substanceScore: 50,
      substanceReason: '',
      evidenceAnalysis: { hasEvidence: false, verified: false, score: 50, indicatorCount: 0, sources: [] },
      overallQuality: 50,
      factCheckResult: null,

      // Trace
      decisionTrace: [],
    };

    try {
      // ── Execute nodes in order ────────────────────────────────
      await this._node_buildContext(state);
      await this._node_loadPersona(state);
      await this._node_retrieveKnowledge(state);
      await this._node_detectFallacies(state);

      // Claims + rebuttals run in parallel — independent of each other
      await Promise.all([
        this._node_extractClaims(state),
        this._node_extractRebuttals(state),
      ]);

      // Heuristics run first and establish baseline scores...
      await Promise.all([
        scoreTone(state),
        scoreClarity(state),
        scoreEvidence(state),
      ]);

      // ...then the model rubric refines them. Ordered rather than parallel so
      // the heuristics cannot overwrite the model's judgment in a race.
      await scoreRubric(state);

      await calculateQuality(state);
      await this._node_factCheck(state);
      await this._node_storeMemory(state);
      await this._node_buildResult(state);

      return this._assembleResult(state);

    } catch (error) {
      console.error('❌ DebateTurnGraph error:', error);
      state.decisionTrace.push({
        step: 'error',
        message: `Graph execution failed: ${error.message}`,
        impact: 'negative',
        data: { error: error.message },
      });
      return this._assembleErrorResult(state);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 1 — BUILD CONTEXT
  // ─────────────────────────────────────────────────────────────────

  async _node_buildContext(state) {
    const { previousTurns, content } = state;

    state.contextString = previousTurns.length > 0
      ? previousTurns.map(t => `[${t.side.toUpperCase()}]: ${t.content}`).join('\n\n')
      : '';

    state.decisionTrace.push({
      step: 'initialization',
      message: 'Starting AI analysis of debate turn',
      timestamp: new Date().toISOString(),
      impact: 'neutral',
      data: {
        side: state.side,
        wordCount: content.split(/\s+/).length,
        roundContext: `Round ${previousTurns.length + 1}`,
        useRAG: this.useRAG,
        previousTurnCount: previousTurns.length,
      },
    });

    console.log(`🔷 [Graph:1] Context built — ${previousTurns.length} prior turns`);
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 2 — LOAD PERSONA (NEW — Persona Drift Integration)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Fetches the user's latest PersonaSnapshot and distills it into
   * a personaContext object that all downstream nodes can read.
   *
   * personaContext shape:
   * {
   *   traits: { tone, aggressiveness, empathy, formality, vocabularyComplexity, argumentativeStyle },
   *   drift: { overallDriftScore, significantChanges, direction },
   *   summary: string,
   *   promptHint: string,   ← pre-built string injected into Grok prompts
   *   coaching: string[],   ← drift-aware tips appended to decision trace
   * }
   */
  async _node_loadPersona(state) {
    const { userId } = state;

    if (!userId) {
      state.personaContext = null;
      console.log('🔷 [Graph:2] No userId — persona skipped');
      return;
    }

    try {
      const snapshot = await PersonaSnapshot.findOne({ userId })
        .sort({ timestamp: -1 })
        .select('traits driftAnalysis summary topics')
        .lean();

      if (!snapshot) {
        state.personaContext = null;
        console.log('🔷 [Graph:2] No persona snapshot found — using defaults');
        return;
      }

      const traits = snapshot.traits || {};
      const drift = snapshot.driftAnalysis || {};
      const significantChanges = drift.significantChanges || [];

      // ── Determine drift direction ─────────────────────────────
      const driftDirection = this._classifyDriftDirection(significantChanges, traits);

      // ── Build prompt hint injected into every Grok call ───────
      // Concise — keeps token cost low (~40 tokens)
      const promptHint = this._buildPersonaPromptHint(traits, driftDirection, significantChanges);

      // ── Build drift-aware coaching tips ───────────────────────
      const coaching = this._buildDriftCoachingTips(traits, driftDirection, significantChanges);

      state.personaContext = {
        traits,
        drift: {
          overallDriftScore: drift.overallDriftScore || 0,
          significantChanges,
          direction: driftDirection,
        },
        summary: snapshot.summary || '',
        topics: snapshot.topics?.primary || [],
        promptHint,
        coaching,
      };

      state.decisionTrace.push({
        step: 'persona_loaded',
        message: `Persona loaded — tone: ${traits.tone}, drift: ${drift.overallDriftScore || 0}/100`,
        impact: 'neutral',
        data: {
          tone: traits.tone,
          argumentativeStyle: traits.argumentativeStyle,
          aggressiveness: traits.aggressiveness,
          empathy: traits.empathy,
          driftScore: drift.overallDriftScore || 0,
          driftDirection,
          significantChanges: significantChanges.map(c => c.description),
        },
      });

      console.log(`🔷 [Graph:2] Persona loaded — ${traits.tone} / ${traits.argumentativeStyle} / drift: ${drift.overallDriftScore || 0}`);

    } catch (error) {
      console.error('❌ [Graph:2] Persona load error:', error.message);
      state.personaContext = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 3 — RETRIEVE KNOWLEDGE
  // ─────────────────────────────────────────────────────────────────

  async _node_retrieveKnowledge(state) {
    // Standard argumentation theory is now inlined rather than retrieved. It is
    // a fixed two-thousand-character reference that any competent model already
    // knows; embedding the turn and running a three-stage retrieval pipeline to
    // select two paragraphs from it bought nothing measurable.
    state.theory = theoryFor('fallacies', 'evidence');

    if (!this.useRAG || !this.vectorStore) {
      console.log('🔷 [Graph:3] Memory retrieval unavailable — using inlined theory only');
      return;
    }

    try {
      // Retrieval is now pointed entirely at this platform's own debate history,
      // which is the only thing here a pretrained model cannot already know.
      // Counter-arguments are filtered to the opposing side and to turns that
      // actually scored well, so what comes back is how this argument has been
      // successfully attacked before — not merely what sounds like it.
      const [counterArguments, weakAttempts] = await Promise.all([
        this.vectorStore.findCounterArguments(state.content, state.side, 3),
        this.vectorStore.findWeakArguments(state.content, 2),
      ]);

      const memoryDocs = [...counterArguments, ...weakAttempts];

      const retrievedContext = counterArguments
        .map(doc => `[${doc.side}, scored ${doc.quality}] ${doc.content || ''}`)
        .filter(Boolean)
        .join('\n\n');

      state.retrievedKnowledge = {
        sources: memoryDocs.map(d => `memory:${d.side ?? 'unknown'}`),
        context: retrievedContext,
        knowledgeDocs: [],
        memoryDocs,
        counterArguments,
        weakAttempts,
      };

      state.decisionTrace.push({
        step: 'memory_retrieval',
        message: `Retrieved ${counterArguments.length} prior counter-arguments, ${weakAttempts.length} weak attempts`,
        impact: 'neutral',
        data: {
          counterArguments: counterArguments.length,
          weakAttempts: weakAttempts.length,
          contextChars: retrievedContext.length,
        },
      });

      console.log(`🔷 [Graph:3] Memory — ${counterArguments.length} counter-arguments, ${weakAttempts.length} weak attempts`);

    } catch (error) {
      console.warn('🔷 [Graph:3] Memory retrieval failed:', error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 4 — DETECT FALLACIES
  // ─────────────────────────────────────────────────────────────────

  async _node_detectFallacies(state) {
    try {
      console.log('🔷 [Graph:4] Detecting fallacies...');

      state.fallacies = await fallacyGraph.detect(state.content, {
        context: state.contextString,
        side: state.side,
        round: state.previousTurns.length + 1,
        userTier: state.userTier,
        aiContext: state.aiContext,
        retrievedKnowledge: state.retrievedKnowledge.knowledgeDocs || [],
      });

      state.decisionTrace.push({
        step: 'fallacy_detection',
        message: state.fallacies.length > 0
          ? `Detected ${state.fallacies.length} logical fallacy(ies)`
          : 'No fallacies detected',
        impact: state.fallacies.length > 0 ? 'negative' : 'positive',
        score: -5 * state.fallacies.length,
        data: {
          fallacies: state.fallacies.map(f => ({
            type: f.type,
            severity: f.severity,
            explanation: f.explanation,
            detectionMethod: f.detectionMethod,
            confidence: f.confidence,
          })),
          deduction: -5 * state.fallacies.length,
          tips: state.fallacies.length > 0 ? [
            'Review common logical fallacies',
            'Focus on addressing arguments directly',
            'Avoid personal attacks and emotional manipulation',
          ] : [],
        },
      });

    } catch (error) {
      console.error('❌ [Graph:4] Fallacy detection error:', error.message);
      state.fallacies = [];
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 5 — EXTRACT CLAIMS (Persona-tuned)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Persona integration:
   *   - vocabularyComplexity < 40 → simpler claim framing in prompt
   *   - vocabularyComplexity > 70 → asks for nuanced/layered claims
   *   - argumentativeStyle → shapes what counts as a "strong" claim for this user
   *   - promptHint injected → Grok matches the user's register
   */
  async _node_extractClaims(state) {
    try {
      const { content, contextString, retrievedKnowledge, aiContext, personaContext } = state;

      // Budget raised from 500: the old blob was mostly generic theory, so
      // truncating it lost little. It now carries real prior counter-arguments,
      // and cutting 40% of what was just retrieved wastes the retrieval.
      const ragContext = retrievedKnowledge.context
        ? `\n\nHow this has been argued against before:\n${retrievedKnowledge.context.substring(0, 1200)}`
        : '';

      // ── Persona-tuned instruction ─────────────────────────────
      let personaInstruction = '';
      if (personaContext?.traits) {
        const { vocabularyComplexity, argumentativeStyle } = personaContext.traits;
        const complexity = vocabularyComplexity || 50;

        if (complexity < 40) {
          personaInstruction = '\nExpress claims in plain, accessible language.';
        } else if (complexity > 70) {
          personaInstruction = '\nCapture nuanced, layered claims with precise language.';
        }

        if (argumentativeStyle === 'evidence-based') {
          personaInstruction += '\nPrioritize claims that reference evidence or data.';
        } else if (argumentativeStyle === 'emotional') {
          personaInstruction += '\nNote which claims carry emotional weight.';
        }

        if (personaContext.promptHint) {
          personaInstruction += `\n${personaContext.promptHint}`;
        }
      }

      const prompt = `Extract the main claims from this debate argument.
Return ONLY a JSON array of strings. Each string is one claim.${personaInstruction}

${contextString ? `Previous context:\n${contextString}\n\n` : ''}Current argument:
${content}${ragContext}

Return format: ["claim 1", "claim 2"]`;

      const response = await grokService.generateFast(prompt, {
        ...aiContext,
        operation: 'claim_extraction',
        temperature: 0.3,
      });

      const claims = await structuredParserService.parse('claims', response, prompt, aiContext);
      state.claims = (claims || []).slice(0, 5);

      state.decisionTrace.push({
        step: 'claims_extraction',
        message: `Extracted ${state.claims.length} main claim(s)`,
        impact: state.claims.length > 0 ? 'positive' : 'neutral',
        data: {
          claims: state.claims.slice(0, 5),
          claimCount: state.claims.length,
          personaTuned: !!personaContext,
          tips: state.claims.length === 0 ? [
            'Make clear, specific claims',
            'State your main arguments explicitly',
          ] : [],
        },
      });

      console.log(`🔷 [Graph:5] Extracted ${state.claims.length} claims`);

    } catch (error) {
      console.error('❌ [Graph:5] Claim extraction error:', error.message);
      state.claims = [];
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 6 — EXTRACT REBUTTALS (Persona-tuned)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Persona integration:
   *   - argumentativeStyle === 'rhetorical' → prompt looks for rhetorical counters
   *   - argumentativeStyle === 'logical'    → prompt looks for logical refutations
   *   - driftDirection === 'aggressive'     → warns user their rebuttals may be combative
   */
  async _node_extractRebuttals(state) {
    try {
      const { content, contextString, retrievedKnowledge, aiContext, personaContext } = state;

      if (!contextString) {
        state.rebuttals = [];
        console.log('🔷 [Graph:6] No prior turns — rebuttals skipped');
        return;
      }

      const ragContext = retrievedKnowledge.context
        ? `\n\nRelevant knowledge:\n${retrievedKnowledge.context.substring(0, 500)}`
        : '';

      // ── Persona-tuned instruction ─────────────────────────────
      let personaInstruction = '';
      if (personaContext?.traits) {
        const { argumentativeStyle } = personaContext.traits;
        const driftDir = personaContext.drift?.direction;

        if (argumentativeStyle === 'logical') {
          personaInstruction = '\nFocus on logical refutations and counter-evidence.';
        } else if (argumentativeStyle === 'rhetorical') {
          personaInstruction = '\nInclude rhetorical and framing-based rebuttals.';
        } else if (argumentativeStyle === 'evidence-based') {
          personaInstruction = '\nHighlight where this argument challenges the opponent\'s evidence.';
        }

        if (driftDir === 'aggressive') {
          personaInstruction += '\nNote: flag any rebuttals that may come across as personal attacks.';
        }
      }

      const prompt = `Identify which previous points this argument is rebutting.
Return ONLY a JSON array of strings.${personaInstruction}

Previous arguments:
${contextString}

Current rebuttal:
${content}${ragContext}

Return format: ["rebuttal to X", "counter to Y"]`;

      const response = await grokService.generateFast(prompt, {
        ...aiContext,
        operation: 'debate_analysis',
        temperature: 0.3,
      });

      const rebuttals = await structuredParserService.parse('rebuttals', response, prompt, aiContext);
      state.rebuttals = (rebuttals || []).slice(0, 5);

      state.decisionTrace.push({
        step: 'rebuttal_analysis',
        message: `Found ${state.rebuttals.length} rebuttal(s)`,
        impact: state.rebuttals.length > 0 ? 'positive' : 'neutral',
        data: {
          rebuttals: state.rebuttals.slice(0, 5),
          rebuttalCount: state.rebuttals.length,
          personaTuned: !!personaContext,
          tips: state.rebuttals.length === 0 ? [
            'Directly address opponent\'s arguments',
            'Explain why their reasoning is flawed',
            'Provide counter-evidence',
          ] : [],
        },
      });

      console.log(`🔷 [Graph:6] Found ${state.rebuttals.length} rebuttals`);

    } catch (error) {
      console.error('❌ [Graph:6] Rebuttal extraction error:', error.message);
      state.rebuttals = [];
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 7 — ANALYZE TONE (Persona-aware scoring)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Persona integration:
   *   - If aggressiveness drift is upward (+15 pts) → additional tone penalty
   *     and a specific drift warning in the decision trace
   *   - If empathy drift is upward → small tone bonus (user improving)
   *   - Baseline: user's current aggressiveness score anchors expected tone
   */

  // ─────────────────────────────────────────────────────────────────
  // NODE 11 — FACT CHECK (optional, RAG only)
  // ─────────────────────────────────────────────────────────────────

  async _node_factCheck(state) {
    if (!this.useRAG) return;

    try {
      state.factCheckResult = await factCheckService.checkText(state.content, {
        sources: ['knowledge'],
        topK: 3,
      });

      if (state.factCheckResult.flags.length > 0) {
        state.decisionTrace.push({
          step: 'fact_check',
          message: `${state.factCheckResult.flags.length} claim(s) lack supporting patterns`,
          impact: 'negative',
          data: {
            flags: state.factCheckResult.flags,
            confidence: state.factCheckResult.overallConfidence,
          },
        });
      } else if (state.factCheckResult.checks.length > 0) {
        state.decisionTrace.push({
          step: 'fact_check',
          message: `Claims match knowledge patterns (${state.factCheckResult.overallConfidence}% confidence)`,
          impact: 'positive',
          data: {
            checks: state.factCheckResult.checks,
            confidence: state.factCheckResult.overallConfidence,
          },
        });
      }

      console.log('🔷 [Graph:11] Fact check complete');

    } catch (error) {
      console.error('❌ [Graph:11] Fact check error:', error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 12 — STORE MEMORY
  // ─────────────────────────────────────────────────────────────────

  async _node_storeMemory(state) {
    if (!this.useRAG || !this.vectorStore) return;

    try {
      // storeInMemory is called by debateAIService after the graph returns
      // We just flag it here for the trace
      state.decisionTrace.push({
        step: 'memory_storage',
        message: 'Turn queued for vector memory storage',
        impact: 'neutral',
        data: { useRAG: this.useRAG },
      });
      console.log('🔷 [Graph:12] Memory storage flagged');
    } catch (error) {
      console.error('❌ [Graph:12] Memory storage error:', error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // NODE 13 — BUILD RESULT (Persona drift summary injected)
  // ─────────────────────────────────────────────────────────────────

  async _node_buildResult(state) {
    const { toneScore, clarityScore, evidenceAnalysis, fallacies, claims, overallQuality, personaContext } = state;

    const strengths = [
      ...(toneScore >= 70 ? ['Respectful tone'] : []),
      ...(clarityScore >= 70 ? ['Clear structure'] : []),
      ...(evidenceAnalysis.score >= 70 ? ['Strong evidence'] : []),
      ...(fallacies.length === 0 ? ['No logical fallacies'] : []),
      ...(claims.length >= 3 ? ['Multiple clear claims'] : []),
    ];

    const weaknesses = [
      ...(toneScore < 70 ? ['Tone could be more respectful'] : []),
      ...(clarityScore < 70 ? ['Structure could be clearer'] : []),
      ...(evidenceAnalysis.score < 70 ? ['Needs more evidence'] : []),
      ...(fallacies.length > 0 ? [`${fallacies.length} logical fallacy(ies) detected`] : []),
    ];

    // ── Persona drift summary for the summary node ─────────────────
    const personaSummary = personaContext ? {
      tone: personaContext.traits.tone,
      argumentativeStyle: personaContext.traits.argumentativeStyle,
      driftScore: personaContext.drift.overallDriftScore,
      driftDirection: personaContext.drift.direction,
      coaching: personaContext.coaching,
    } : null;

    state.decisionTrace.push({
      step: 'summary',
      message: 'Analysis complete',
      impact: 'neutral',
      data: {
        totalSteps: state.decisionTrace.length + 1,
        analysisTime: 'Real-time',
        strengths,
        weaknesses,
        personaSummary,
      },
    });

    console.log('🔷 [Graph:13] Result built');
  }

  // ─────────────────────────────────────────────────────────────────
  // RESULT ASSEMBLY
  // ─────────────────────────────────────────────────────────────────

  _assembleResult(state) {
    return {
      claims: state.claims,
      rebuttals: state.rebuttals,
      fallacies: state.fallacies,
      toneScore: state.toneScore,
      clarityScore: state.clarityScore,
      evidenceQuality: state.evidenceAnalysis.score,
      evidenceAnalysis: state.evidenceAnalysis,
      overallQuality: state.overallQuality,
      decisionTrace: state.decisionTrace,
      retrievedSources: state.retrievedKnowledge.sources,
      factCheck: state.factCheckResult,
      personaContext: state.personaContext ? {
        tone: state.personaContext.traits.tone,
        driftScore: state.personaContext.drift.overallDriftScore,
        driftDirection: state.personaContext.drift.direction,
        coaching: state.personaContext.coaching,
      } : null,
    };
  }

  _assembleErrorResult(state) {
    return {
      claims: [],
      rebuttals: [],
      fallacies: [],
      toneScore: 50,
      clarityScore: 50,
      evidenceQuality: 50,
      evidenceAnalysis: { hasEvidence: false, verified: false, score: 50 },
      overallQuality: 50,
      decisionTrace: state.decisionTrace,
      retrievedSources: [],
      factCheck: null,
      personaContext: null,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // PERSONA HELPERS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Classify the overall direction of persona drift from significant changes.
   * Returns: 'aggressive' | 'empathetic' | 'analytical' | 'stable'
   */
  _classifyDriftDirection(significantChanges, traits) {
    if (!significantChanges || significantChanges.length === 0) return 'stable';

    const aggChange = significantChanges.find(c => c.type === 'aggressiveness');
    const empChange = significantChanges.find(c => c.type === 'empathy');
    const formalChange = significantChanges.find(c => c.type === 'formality');
    const vocabChange = significantChanges.find(c => c.type === 'vocabularyComplexity');

    // Aggressiveness going up is the most impactful signal
    if (aggChange && traits.aggressiveness > 60) return 'aggressive';
    if (empChange && traits.empathy > 60) return 'empathetic';
    if (formalChange && vocabChange && traits.formality > 60) return 'analytical';

    return 'stable';
  }

  /**
   * Build a short persona hint string injected into Grok prompts.
   * Kept intentionally brief (~40 tokens) to minimize cost impact.
   */
  _buildPersonaPromptHint(traits, driftDirection, significantChanges) {
    const parts = [];

    if (traits.tone && traits.tone !== 'neutral') {
      parts.push(`User's typical tone: ${traits.tone}`);
    }
    if (traits.argumentativeStyle && traits.argumentativeStyle !== 'balanced') {
      parts.push(`Preferred style: ${traits.argumentativeStyle}`);
    }
    if (driftDirection !== 'stable') {
      parts.push(`Recent drift: becoming more ${driftDirection}`);
    }

    return parts.length > 0
      ? `\n[User persona context: ${parts.join('. ')}]`
      : '';
  }

  /**
   * Generate 1-3 drift-aware coaching tips to append to quality feedback.
   * These are specific to the user's evolution, not generic advice.
   */
  _buildDriftCoachingTips(traits, driftDirection, significantChanges) {
    const tips = [];

    if (driftDirection === 'aggressive') {
      tips.push(`💡 Your debating style has been trending more aggressive lately — try leading with evidence before intensity.`);
    }

    if (driftDirection === 'empathetic') {
      tips.push(`💡 Your empathy has been growing — use this strength to acknowledge opponent points before countering.`);
    }

    if (traits.vocabularyComplexity < 40) {
      tips.push(`💡 Try incorporating more precise terminology to strengthen your arguments.`);
    } else if (traits.vocabularyComplexity > 80) {
      tips.push(`💡 Consider simplifying some arguments — accessibility can increase persuasive impact.`);
    }

    // Surface significant changes as personalized tips
    significantChanges.slice(0, 1).forEach(change => {
      if (change.impact === 'high') {
        tips.push(`💡 Notable shift: ${change.description}. Channel this change constructively.`);
      }
    });

    return tips.slice(0, 3);
  }
}

const debateTurnGraph = new DebateTurnGraph();
export default debateTurnGraph;