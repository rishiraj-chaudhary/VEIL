/**
 * SPARRING AGENT — a real LangGraph state machine
 *
 * VEIL already knows which of your arguments get demolished: the claim graph
 * records every claim, who made it, how often it was attacked and how often it
 * survived. Until now that knowledge only ever appeared *after* a debate, as a
 * score. This agent puts it in front of you while you can still change the
 * argument — it attacks your draft the way the record says opponents actually
 * beat it, and proposes repairs for the claims that fold.
 *
 * ── Why this is a graph and not a pipeline ──────────────────────────────────
 * The other nine "graph" services in this codebase are linear sequences of
 * awaits; they are named for graphs but have no branching, so LangGraph would
 * buy them nothing and they were deliberately left alone. This one is different:
 *
 *   select ─┬─(queue empty | budget spent)─→ report
 *           └─→ attack → judge ─┬─(attack landed, repairs left)─→ repair ─┐
 *                               └─(claim held)────────────────────────────┴─→ select
 *
 * The number of iterations depends on what the attacks find, the repair branch
 * is entered only for claims that actually fail, and control cycles back into
 * `select`. That is a genuine cyclic graph with conditional edges, which is
 * exactly what StateGraph exists to express.
 *
 * ── Budget ──────────────────────────────────────────────────────────────────
 * Every LLM call is counted against a hard cap and the cap is checked at the
 * routing edge, so exhausting it ends the session cleanly with partial findings
 * rather than throwing. This matters: the deployment runs on a free Groq tier
 * with a shared 100k tokens/day ceiling, and an uncapped loop would drain it.
 */

import { StateGraph, Annotation, START, END } from '@langchain/langgraph';

import grokService from '../grokService.js';
import structuredParserService from '../structuredParserService.js';
import { invokeTool } from './sparringTools.js';

// A claim at or below this resilience is worth attacking; above it, the record
// already says the claim holds and spending a turn on it teaches nothing.
const FRAGILE_AT = 70;

// Verdict strength at which an attack is treated as having landed.
const LANDS_AT = 6;

const DEFAULTS = {
  maxLlmCalls: 12,
  maxClaims: 4,
  maxRepairs: 3,
};

/**
 * Find where a claim sits inside the draft.
 *
 * A revision is only directly applicable if the claim it replaces is an actual
 * span of the user's text. Models paraphrase when extracting, and a paraphrase
 * spliced back in would silently rewrite words the user never wrote — so the
 * exact offsets are resolved here and the UI falls back to copy-only when there
 * is no clean match.
 *
 * The flexible pass exists because drafts contain line breaks where the model
 * returns single spaces.
 */
const locateClaim = (draft, claim) => {
  const exact = draft.indexOf(claim);
  if (exact >= 0) return { start: exact, end: exact + claim.length, exact: true };

  const words = claim.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const match = new RegExp(escaped.join('\\s+'), 'i').exec(draft);

  return match ? { start: match.index, end: match.index + match[0].length, exact: false } : null;
};

/** Last-writer-wins; the default for scalar fields the nodes overwrite. */
const last = (initial) => Annotation({
  reducer: (prev, next) => (next === undefined ? prev : next),
  default: () => initial,
});

/** Append-only; used for the trace and findings so nothing is lost on a cycle. */
const append = () => Annotation({
  reducer: (prev, next) => prev.concat(next ?? []),
  default: () => [],
});

const SparringState = Annotation.Root({
  // Inputs
  userId:   last(null),
  topic:    last(''),
  side:     last('for'),
  draft:    last(''),
  userTier: last('free'),
  limits:   last(DEFAULTS),

  // Working set
  queue:    last([]),   // claims still to test, weakest first
  current:  last(null), // claim under test
  currentAttack:  last(null),
  currentVerdict: last(null),

  // Accumulated
  findings: append(),
  trace:    append(),
  fallacies: last([]),

  // Accounting
  llmCalls: last(0),
  repairs:  last(0),
});

class SparringAgent {
  /** The one definition of a landed attack. Routing and reporting must agree. */
  static landed(verdict) {
    return (verdict?.strength ?? 0) >= LANDS_AT;
  }

  constructor() {
    this.graph = this._build();
  }

  // ── LLM helper ────────────────────────────────────────────────────────────

  /**
   * One budgeted, schema-validated model call.
   *
   * parseSync rather than parse: the self-healing path in the parser issues
   * further model calls, which would spend budget the agent never counted.
   */
  async _ask(schemaName, prompt, state, { smart = false } = {}) {
    const context = {
      userId: state.userId,
      userTier: state.userTier,
      operation: 'sparring_agent',
      temperature: 0.4,
    };

    const raw = smart
      ? await grokService.generateSmart(prompt, context)
      : await grokService.generateFast(prompt, context);

    // parseSync returns { success, data, error } rather than the value itself.
    const { success, data, error } = structuredParserService.parseSync(schemaName, raw);

    if (!success) {
      console.warn(`⚠️ [sparring] ${schemaName} did not validate: ${error}`);
    }

    return data;
  }

  // ── Node: triage ──────────────────────────────────────────────────────────
  // Extract the claims, then consult the record for each. Cheap lookups decide
  // what the expensive nodes spend their budget on.

  async _node_triage(state) {
    const trace = [];

    const prompt = `Extract the distinct factual or evaluative claims from this debate draft.
A claim is a statement that an opponent could dispute. Ignore pleasantries and framing.

Copy each claim VERBATIM from the draft — the exact words, unchanged. Do not
paraphrase, summarise, merge two sentences, or fix grammar. The text you return
is matched back against the draft so the author can revise it in place.

Topic: ${state.topic}
Side: ${state.side}

Draft:
"""
${state.draft.slice(0, 2000)}
"""

Return ONLY a JSON array of claim strings, at most ${state.limits.maxClaims}:
["first claim", "second claim"]`;

    const raw = await grokService.generateFast(prompt, {
      userId: state.userId,
      userTier: state.userTier,
      operation: 'sparring_agent',
      temperature: 0.2,
    });

    const parsed = structuredParserService.parseSync('claims', raw);
    const claims = (parsed.data || []).slice(0, state.limits.maxClaims);

    trace.push({ kind: 'node', node: 'triage', message: `Extracted ${claims.length} claim(s)` });

    const fallacies = await invokeTool('fallacyScan',
      { text: state.draft, userTier: state.userTier }, trace);

    // Consult the record for every claim before attacking any of them, so the
    // queue can be ordered by genuine fragility rather than by position.
    const assessed = await Promise.all(claims.map(async (text) => {
      const record = await invokeTool('claimTrackRecord',
        { claimText: text, userId: state.userId }, trace);

      return {
        text,
        record,
        span: locateClaim(state.draft, text),
        // An untested claim is unknown, not safe — it sorts below a claim the
        // record has already seen hold, and above one it has seen fold.
        priority: record.found ? (record.resilience ?? 100) : 75,
      };
    }));

    const queue = assessed
      .filter(c => c.priority <= FRAGILE_AT || !c.record.found)
      .sort((a, b) => a.priority - b.priority);

    const skipped = assessed.length - queue.length;
    trace.push({
      kind: 'node',
      node: 'triage',
      message: queue.length
        ? `${queue.length} claim(s) worth testing${skipped ? `, ${skipped} already proven durable` : ''}`
        : 'Every claim already has a strong track record',
    });

    return { queue, fallacies, llmCalls: state.llmCalls + 1, trace };
  }

  // ── Node: select ──────────────────────────────────────────────────────────
  // Pure routing bookkeeping: take the weakest remaining claim.

  async _node_select(state) {
    const [current, ...rest] = state.queue;

    return {
      current: current ?? null,
      queue: rest,
      currentAttack: null,
      currentVerdict: null,
      trace: current
        ? [{ kind: 'node', node: 'select', message: `Testing: "${current.text.slice(0, 70)}"` }]
        : [],
    };
  }

  // ── Node: attack ──────────────────────────────────────────────────────────

  async _node_attack(state) {
    const trace = [];
    const claim = state.current;

    const priors = await invokeTool('priorAttacks',
      { claimText: claim.text, side: state.side, k: 3 }, trace);

    // Grounding the attack in real opposing turns is the point: without it this
    // is a model guessing at objections, which the user could do unaided.
    const priorText = priors.length
      ? `Opponents on this platform have argued against similar claims like this:\n${
          priors.map(p => `- [scored ${p.quality}] ${p.text}`).join('\n')}`
      : 'No prior opposing arguments are on record for this claim.';

    const history = claim.record.found
      ? `Track record: used ${claim.record.uses}×, attacked ${claim.record.refutations}×, resilience ${claim.record.resilience}/100 (${claim.record.band}).`
      : 'This claim has no track record yet.';

    const prompt = `You are the strongest possible opponent in a debate on "${state.topic}".
The other side argues ${state.side}. Attack this specific claim:

"${claim.text}"

${history}
${priorText}

Mount the single most damaging attack you can. Be concrete and specific to this
claim — name the assumption, the missing evidence, or the counter-case. Do not
attack the person and do not hedge.

Return ONLY JSON:
{"attack": "<your attack, 2-4 sentences>", "vector": "<3-6 word label for the line of attack>"}`;

    const attack = await this._ask('sparringAttack', prompt, state, { smart: true });

    trace.push({
      kind: 'node',
      node: 'attack',
      message: attack ? `Attack: ${attack.vector}` : 'Attack generation failed',
    });

    return { currentAttack: attack, llmCalls: state.llmCalls + 1, trace };
  }

  // ── Node: judge ───────────────────────────────────────────────────────────

  async _node_judge(state) {
    if (!state.currentAttack) {
      return { currentVerdict: { strength: 0, reason: 'No attack was produced.' } };
    }

    const prompt = `Judge whether this attack defeats the claim.

Claim: "${state.current.text}"
Attack: "${state.currentAttack.attack}"

Score how much damage the attack does, 0-10, where:
  0-3 = the claim stands; the attack misses or is weaker than the claim
  4-5 = the attack raises a fair question but the claim survives
  6-8 = the claim needs revision to survive
  9-10 = the claim is defeated as stated

Be strict. An attack that merely sounds forceful does not score above 5.

Return ONLY JSON:
{"strength": 7, "reason": "<one sentence>"}`;

    const verdict = await this._ask('sparringVerdict', prompt, state, { smart: true });

    const settled = verdict ?? { strength: 0, reason: 'Judgment unavailable.' };

    return {
      currentVerdict: settled,
      llmCalls: state.llmCalls + 1,
      trace: [{
        kind: 'node',
        node: 'judge',
        message: `Verdict: ${settled.strength}/10 — ${SparringAgent.landed(settled) ? 'claim needs work' : 'claim holds'}`,
      }],
    };
  }

  // ── Node: repair ──────────────────────────────────────────────────────────
  // Entered only for claims that actually failed.

  async _node_repair(state) {
    const trace = [];

    const defences = await invokeTool('provenDefences',
      { claimText: state.current.text, k: 2 }, trace);

    const defenceText = defences.length
      ? `High-scoring arguments on this subject, for reference:\n${
          defences.map(d => `- [scored ${d.quality}] ${d.text}`).join('\n')}`
      : '';

    const prompt = `Revise this claim so it survives the attack against it.

Original claim: "${state.current.text}"
Attack that landed: "${state.currentAttack.attack}"
${defenceText}

Rewrite the claim to answer the attack directly. Narrow it, qualify it, or add
the support it was missing. Keep the author's position — do not concede the point.

Return ONLY JSON:
{"revised": "<the rewritten claim>", "change": "<what you changed and why, one sentence>"}`;

    const repair = await this._ask('sparringRepair', prompt, state, { smart: false });

    trace.push({
      kind: 'node',
      node: 'repair',
      message: repair ? 'Proposed a revision' : 'Revision failed',
    });

    return {
      repairs: state.repairs + 1,
      llmCalls: state.llmCalls + 1,
      trace,
      findings: [this._finding(state, repair)],
    };
  }

  /** Emitted when a claim leaves the loop, with or without a repair. */
  _finding(state, repair = null) {
    return {
      claim: state.current.text,
      // Null when the model paraphrased; the UI offers copy instead of apply.
      span: state.current.span ?? null,
      trackRecord: state.current.record,
      attack: state.currentAttack?.attack ?? null,
      vector: state.currentAttack?.vector ?? null,
      strength: state.currentVerdict?.strength ?? 0,
      survived: !SparringAgent.landed(state.currentVerdict),
      reason: state.currentVerdict?.reason ?? '',
      repair: repair ? { revised: repair.revised, change: repair.change } : null,
    };
  }

  // ── Node: record ──────────────────────────────────────────────────────────
  // A claim that held still produces a finding; it just skips the repair branch.

  async _node_record(state) {
    return { findings: [this._finding(state)] };
  }

  // ── Node: report ──────────────────────────────────────────────────────────

  async _node_report(state) {
    const tested = state.findings.length;
    const failed = state.findings.filter(f => !f.survived).length;

    return {
      trace: [{
        kind: 'node',
        node: 'report',
        message: `Session complete — ${tested} claim(s) tested, ${failed} needed revision, ${state.llmCalls} model call(s)`,
      }],
    };
  }

  // ── Conditional edges ─────────────────────────────────────────────────────

  /** After select: is there work left, and budget to do it? */
  _route_afterSelect(state) {
    if (!state.current) return 'report';

    // Two calls are needed to test a claim (attack + judge). Starting a claim
    // that cannot be finished would report a verdict of 0 as if it survived.
    if (state.llmCalls + 2 > state.limits.maxLlmCalls) return 'report';

    return 'attack';
  }

  /** After judge: repair the claim, or record it and move on. */
  _route_afterJudge(state) {
    if (!SparringAgent.landed(state.currentVerdict)) return 'record';
    if (state.repairs >= state.limits.maxRepairs) return 'record';
    if (state.llmCalls + 1 > state.limits.maxLlmCalls) return 'record';

    return 'repair';
  }

  // ── Graph construction ────────────────────────────────────────────────────

  _build() {
    const graph = new StateGraph(SparringState)
      .addNode('triage', this._node_triage.bind(this))
      .addNode('select', this._node_select.bind(this))
      .addNode('attack', this._node_attack.bind(this))
      .addNode('judge',  this._node_judge.bind(this))
      .addNode('repair', this._node_repair.bind(this))
      .addNode('record', this._node_record.bind(this))
      .addNode('report', this._node_report.bind(this))

      .addEdge(START, 'triage')
      .addEdge('triage', 'select')

      .addConditionalEdges('select', this._route_afterSelect.bind(this), {
        attack: 'attack',
        report: 'report',
      })

      .addEdge('attack', 'judge')

      .addConditionalEdges('judge', this._route_afterJudge.bind(this), {
        repair: 'repair',
        record: 'record',
      })

      // Both branches cycle back — this is the loop that makes it a graph.
      .addEdge('repair', 'select')
      .addEdge('record', 'select')

      .addEdge('report', END);

    return graph.compile();
  }

  // ── Public entry point ────────────────────────────────────────────────────

  /**
   * @param {Object}  input
   * @param {string}  input.userId
   * @param {string}  input.topic
   * @param {string}  input.side      - 'for' | 'against'
   * @param {string}  input.draft     - the argument to spar against
   * @param {string} [input.userTier]
   * @param {Object} [input.limits]   - { maxLlmCalls, maxClaims, maxRepairs }
   */
  async run({ userId, topic, side, draft, userTier = 'free', limits = {} }) {
    const startedAt = Date.now();
    const merged = { ...DEFAULTS, ...limits };

    try {
      const final = await this.graph.invoke(
        { userId, topic, side, draft, userTier, limits: merged },
        // Guards against a routing bug spinning forever. Each claim costs at
        // most 4 node visits, so this is generous relative to maxLlmCalls.
        { recursionLimit: 50 },
      );

      const findings = final.findings ?? [];

      return {
        ok: true,
        topic,
        side,
        findings,
        fallacies: final.fallacies ?? [],
        summary: {
          claimsTested: findings.length,
          claimsNeedingWork: findings.filter(f => !f.survived).length,
          repairsOffered: findings.filter(f => f.repair).length,
          llmCalls: final.llmCalls ?? 0,
          budget: merged.maxLlmCalls,
          budgetExhausted: (final.llmCalls ?? 0) >= merged.maxLlmCalls,
          durationMs: Date.now() - startedAt,
        },
        trace: final.trace ?? [],
      };

    } catch (error) {
      console.error('❌ SparringAgent failed:', error.message);
      return {
        ok: false,
        error: error.message,
        findings: [],
        fallacies: [],
        summary: { claimsTested: 0, claimsNeedingWork: 0, repairsOffered: 0, llmCalls: 0, durationMs: Date.now() - startedAt },
        trace: [],
      };
    }
  }
}

export default new SparringAgent();
