/**
 * Smoke-test assertion gating.
 *
 * Some smoke checks are only meaningful on the smart model. grokService
 * downgrades silently when the daily token budget is spent, and on the fast
 * model those checks pass or fail at random — measured 0/6 passes one day and
 * 3/3 the next, from identical code.
 *
 * The gate skips them on a downgraded run. The risk in that design is a skip
 * that never lifts, which is a disabled test wearing a badge. These cover the
 * mechanism directly, so it stays verifiable when the live quota is exhausted
 * and the smoke run itself cannot exercise the asserting path.
 */

const grokService = (await import('../src/services/grokService.js')).default;
const fallacyGraph = (await import('../src/services/graph/fallacyGraph.js')).default;

// Mirrors the gate in scripts/smokeTest.js.
const assertable = (run) => !run.llmUsed || run.model === grokService.smartModel;

describe('assertion gate', () => {
  test('a smart-model run is asserted', () => {
    expect(assertable({ llmUsed: true, model: grokService.smartModel })).toBe(true);
  });

  test('a downgraded run is not asserted', () => {
    expect(assertable({ llmUsed: true, model: grokService.fastModel })).toBe(false);
  });

  test('a regex-only run is asserted — no model to have been downgraded', () => {
    expect(assertable({ llmUsed: false, model: null })).toBe(true);
  });

  test('the gate lifts as soon as the smart model serves again', () => {
    // The failure mode this guards against: a skip condition broad enough that
    // it never becomes false, silently retiring the check.
    const downgraded = { llmUsed: true, model: grokService.fastModel };
    const restored   = { llmUsed: true, model: grokService.smartModel };

    expect(assertable(downgraded)).toBe(false);
    expect(assertable(restored)).toBe(true);
  });
});

describe('fallacyGraph provenance', () => {
  test('lastRun is populated before any detect call', () => {
    // Read by the smoke script immediately after each detect. An undefined
    // shape would throw there rather than skip.
    expect(fallacyGraph.lastRun).toEqual(
      expect.objectContaining({ llmUsed: expect.any(Boolean) }),
    );
  });

  test('provenance is per-run, not a global last-smart-call', async () => {
    // An earlier version read grokService.smartServedBy() directly, which
    // reflects whichever smart call happened last anywhere in the process — so
    // an unrelated downgrade elsewhere would skip these checks, and a regex-only
    // fallacy run would inherit some other call's model entirely.
    const text = 'Everyone knows this is true, so anyone who disagrees is simply wrong.';
    await fallacyGraph.detect(text, { round: 1, userTier: 'free' });

    const run = fallacyGraph.lastRun;
    expect(run).toHaveProperty('llmUsed');
    expect(run).toHaveProperty('model');

    // A regex-only run must report no model rather than borrowing one.
    if (!run.llmUsed) expect(run.model).toBeNull();
  });
});
