/**
 * Sparring agent routing.
 *
 * The graph's value is in its edges: which claims get attacked, when the loop
 * stops, and whether a landed attack is reported the same way it is routed.
 * Each of these encodes a rule that was wrong at some point during the build.
 */

const sparringAgent = (await import('../src/services/agent/sparringAgent.js')).default;
const SparringAgent = sparringAgent.constructor;

const FRAGILE_AT = 70;
const LANDS_AT = 6;

describe('landed()', () => {
  test('a verdict at or above the threshold has landed', () => {
    expect(SparringAgent.landed({ strength: 6 })).toBe(true);
    expect(SparringAgent.landed({ strength: 9 })).toBe(true);
  });

  test('a weak verdict has not', () => {
    expect(SparringAgent.landed({ strength: 5 })).toBe(false);
    expect(SparringAgent.landed({ strength: 0 })).toBe(false);
  });

  test('a missing verdict is not a landed attack', () => {
    expect(SparringAgent.landed(null)).toBe(false);
    expect(SparringAgent.landed(undefined)).toBe(false);
    expect(SparringAgent.landed({})).toBe(false);
  });

  test('routing and reporting cannot disagree', () => {
    // The judge previously returned both a `lands` boolean and a `strength`
    // score, and set them inconsistently — `lands: false` alongside 7/10, which
    // its own rubric calls "needs revision". Routing read the number while the
    // finding read the boolean, so two identical verdicts produced opposite
    // outcomes in the same session. One rule now feeds both.
    const verdict = { strength: 7, reason: 'x' };
    const routed = SparringAgent.landed(verdict) ? 'repair' : 'record';
    const reported = SparringAgent.landed(verdict) ? 'needs work' : 'survived';

    expect(routed).toBe('repair');
    expect(reported).toBe('needs work');
  });
});

describe('routing after select', () => {
  const route = (state) => sparringAgent._route_afterSelect({
    limits: { maxLlmCalls: 12 },
    llmCalls: 0,
    ...state,
  });

  test('an empty queue ends the session', () => {
    expect(route({ current: null })).toBe('report');
  });

  test('a claim with budget available is attacked', () => {
    expect(route({ current: { text: 'c' }, llmCalls: 2 })).toBe('attack');
  });

  test('a claim that cannot be finished is not started', () => {
    // Testing a claim costs two calls (attack + judge). Starting one with a
    // single call left would leave it with no verdict, and a missing verdict
    // reads as strength 0 — reporting a never-tested claim as having survived.
    expect(route({ current: { text: 'c' }, llmCalls: 11 })).toBe('report');
    expect(route({ current: { text: 'c' }, llmCalls: 10 })).toBe('attack');
  });
});

describe('routing after judge', () => {
  const route = (state) => sparringAgent._route_afterJudge({
    limits: { maxLlmCalls: 12, maxRepairs: 3 },
    llmCalls: 0,
    repairs: 0,
    ...state,
  });

  test('a claim that held is recorded, not repaired', () => {
    expect(route({ currentVerdict: { strength: 3 } })).toBe('record');
  });

  test('a claim that failed is repaired', () => {
    expect(route({ currentVerdict: { strength: 8 } })).toBe('repair');
  });

  test('the repair allowance is respected', () => {
    expect(route({ currentVerdict: { strength: 8 }, repairs: 3 })).toBe('record');
  });

  test('a failed claim is still recorded when the budget is spent', () => {
    // Skipping the repair must not skip the finding: the user should still be
    // told the claim failed, even when there is no budget left to fix it.
    expect(route({ currentVerdict: { strength: 8 }, llmCalls: 12 })).toBe('record');
  });
});

describe('triage prioritisation', () => {
  // Mirrors the queue filter in _node_triage.
  const queueFrom = (assessed) => assessed
    .filter(c => c.priority <= FRAGILE_AT || !c.record.found)
    .sort((a, b) => a.priority - b.priority);

  const claim = (name, resilience, found = true) => ({
    text: name,
    record: { found, resilience },
    priority: found ? resilience : 75,
  });

  test('durable claims are skipped so budget goes to fragile ones', () => {
    const queue = queueFrom([
      claim('ironclad', 92),
      claim('fragile', 30),
      claim('solid', 78),
    ]);

    expect(queue.map(c => c.text)).toEqual(['fragile']);
  });

  test('the weakest claim is attacked first', () => {
    const queue = queueFrom([claim('mid', 60), claim('weakest', 20), claim('near', 68)]);

    expect(queue.map(c => c.text)).toEqual(['weakest', 'mid', 'near']);
  });

  test('an untested claim is tested rather than assumed safe', () => {
    const queue = queueFrom([claim('unknown', undefined, false), claim('ironclad', 95)]);

    expect(queue.map(c => c.text)).toEqual(['unknown']);
  });

  test('a session where everything is proven ends without model calls', () => {
    expect(queueFrom([claim('a', 88), claim('b', 91)])).toHaveLength(0);
  });
});
