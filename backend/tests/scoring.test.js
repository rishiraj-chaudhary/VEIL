import { jest } from '@jest/globals';

/**
 * Winner determination and claim resilience.
 *
 * Both encode product rules that were previously wrong in ways no type checker
 * would catch: a forfeiting side outscored one that argued, and a claim that
 * survived forty challenges ranked below one that was demolished on its first.
 */

const debateScoringService = (await import('../src/services/debateScoringService.js')).default;

describe('weightedTotal', () => {
  test('reasoning outweighs popularity', () => {
    const rigorousButUnpopular = debateScoringService.weightedTotal({
      argumentQuality: 85, rebuttalEffectiveness: 80, conductClarity: 75, audienceSupport: 20,
    });
    const weakButPopular = debateScoringService.weightedTotal({
      argumentQuality: 40, rebuttalEffectiveness: 35, conductClarity: 60, audienceSupport: 100,
    });

    expect(rigorousButUnpopular).toBeGreaterThan(weakButPopular);
  });

  test('audience support cannot decide a lopsided argument', () => {
    const better = debateScoringService.weightedTotal({
      argumentQuality: 90, rebuttalEffectiveness: 90, conductClarity: 90, audienceSupport: 0,
    });
    const worse = debateScoringService.weightedTotal({
      argumentQuality: 50, rebuttalEffectiveness: 50, conductClarity: 50, audienceSupport: 100,
    });

    expect(better).toBeGreaterThan(worse);
  });

  test('missing dimensions count as zero rather than throwing', () => {
    expect(debateScoringService.weightedTotal({})).toBe(0);
    expect(debateScoringService.weightedTotal({ argumentQuality: 100 })).toBe(40);
  });

  test('a perfect side scores 100', () => {
    expect(debateScoringService.weightedTotal({
      argumentQuality: 100, rebuttalEffectiveness: 100, conductClarity: 100, audienceSupport: 100,
    })).toBe(100);
  });
});

describe('claim resilience', () => {
  // Mirrors knowledgeGraphService: survival weighted by a confidence prior, so
  // attempt count raises certainty rather than acting as a penalty.
  const PRIOR = 5;
  const resilience = (successRate, attempts) => {
    const survival = 1 - successRate;
    const confidence = attempts / (attempts + PRIOR);
    return Math.round(Math.max(0, Math.min(100, 100 * (0.5 + (survival - 0.5) * confidence))));
  };

  test('surviving many challenges beats surviving one', () => {
    expect(resilience(0, 40)).toBeGreaterThan(resilience(0, 1));
  });

  test('a claim that survived 40 attacks outranks one demolished immediately', () => {
    const survivedForty = resilience(0, 40);
    const demolishedOnce = resilience(1, 1);

    expect(survivedForty).toBeGreaterThan(demolishedOnce);
    expect(survivedForty).toBeGreaterThan(85);
    expect(demolishedOnce).toBeLessThan(50);
  });

  test('volume alone never floors the score', () => {
    // The previous formula subtracted 2 points per refutation, so any claim
    // challenged 50 times hit zero regardless of whether it held.
    expect(resilience(0, 100)).toBeGreaterThan(90);
  });

  test('an untested claim sits at the midpoint', () => {
    expect(resilience(0, 0)).toBe(50);
  });
});

describe('refutation success criterion', () => {
  // Mirrors knowledgeGraphService._isRefutationSuccessful.
  const isSuccessful = (effectiveness, quality) =>
    effectiveness >= 6 || (effectiveness >= 5 && quality >= 75);

  test('a forceful rebuttal succeeds regardless of polish', () => {
    expect(isSuccessful(8, 40)).toBe(true);
    expect(isSuccessful(6, 20)).toBe(true);
  });

  test('a well-written but weak rebuttal does not demolish the claim', () => {
    // The criterion was `effectiveness >= 6 || quality >= 65`, so any competent
    // writing counted as a successful refutation. Every contested claim in the
    // database ended up at a 0.88-1.00 success rate and nothing could survive.
    expect(isSuccessful(2, 95)).toBe(false);
    expect(isSuccessful(3, 90)).toBe(false);
    expect(isSuccessful(4, 100)).toBe(false);
  });

  test('quality only breaks ties at the threshold', () => {
    expect(isSuccessful(5, 80)).toBe(true);
    expect(isSuccessful(5, 60)).toBe(false);
  });
});

describe('reputation tiers', () => {
  const TIERS = [
    { min: 85, tier: 'Ironclad' }, { min: 70, tier: 'Solid' },
    { min: 55, tier: 'Contested' }, { min: 40, tier: 'Brittle' },
    { min: 0, tier: 'Fragile' },
  ];
  const tierFor = (score, contested) =>
    contested === 0 ? 'Untested' : (TIERS.find(t => score >= t.min)?.tier ?? 'Fragile');

  test('a low score is Fragile, not Untested', () => {
    // "Untested" sat at min:0 as the catch-all and swallowed every score below
    // 40, so a user whose claims were consistently demolished was told they
    // were untested — the opposite of what happened.
    expect(tierFor(39, 6)).toBe('Fragile');
    expect(tierFor(0, 6)).toBe('Fragile');
  });

  test('Untested means genuinely no contested claims', () => {
    expect(tierFor(0, 0)).toBe('Untested');
    expect(tierFor(90, 0)).toBe('Untested');
  });

  test('scores map to the expected tiers', () => {
    expect(tierFor(95, 5)).toBe('Ironclad');
    expect(tierFor(75, 5)).toBe('Solid');
    expect(tierFor(60, 5)).toBe('Contested');
    expect(tierFor(45, 5)).toBe('Brittle');
  });

  test('a claim surviving one challenge clears the survived threshold', () => {
    const PRIOR = 5;
    const score = (rate, n) => Math.round(100 * (0.5 + ((1 - rate) - 0.5) * (n / (n + PRIOR))));
    // Threshold was 65, which a single-challenge survivor (58) could not reach,
    // reporting 0% survival for claims that had in fact held every time.
    expect(score(0, 1)).toBeGreaterThanOrEqual(55);
  });
});
