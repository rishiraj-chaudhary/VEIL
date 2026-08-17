/**
 * Regression tests for the currency ledger and AI budget model selection.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import UserCurrency from '../src/models/userCurrency.js';
import AICostService from '../src/services/aiCostService.js';

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

afterEach(async () => {
  await UserCurrency.deleteMany({});
});

const newWallet = () => UserCurrency.create({ user: new mongoose.Types.ObjectId() });

describe('daily bonus', () => {
  /**
   * The mint.
   *
   * `claimDailyBonus` credited the coins through `addTransaction`, which starts
   * a save immediately, and only afterwards set `earnings.lastEarningDate` — on
   * a document Mongoose had already serialised. The date never persisted, and
   * the date is exactly what the "already claimed today" guard reads. So every
   * call to GET /api/slicks/currency paid the bonus again: refresh the page,
   * get another ten coins, forever. Coins buy identity reveals on anonymous
   * feedback, so this was unlimited free deanonymisation.
   */
  test('a second claim on the same day pays nothing', async () => {
    const wallet = await newWallet();
    const opening = wallet.veilCoins;

    const first = await wallet.claimDailyBonus();
    expect(first).not.toBeNull();
    expect(wallet.veilCoins).toBe(opening + first.earned);

    const second = await wallet.claimDailyBonus();
    expect(second).toBeNull();
    expect(wallet.veilCoins).toBe(opening + first.earned);
  });

  test('the claim date is actually persisted, not just held in memory', async () => {
    const wallet = await newWallet();
    await wallet.claimDailyBonus();

    // Re-read from the database — the previous implementation looked correct on
    // the in-memory document and wrong on every subsequent request.
    const reloaded = await UserCurrency.findById(wallet._id);
    expect(reloaded.earnings.lastEarningDate).toBeInstanceOf(Date);
    expect(await reloaded.claimDailyBonus()).toBeNull();
  });

  test('a consecutive day extends the streak and pays more', async () => {
    const wallet = await newWallet();

    const yesterday = new Date(Date.now() - 86_400_000);
    wallet.earnings.lastEarningDate = yesterday;
    wallet.earnings.dailyStreak = 3;
    await wallet.save();

    const claim = await wallet.claimDailyBonus();

    expect(claim.streak).toBe(4);
    expect(claim.earned).toBe(10 + 8);
  });

  test('a missed day resets the streak', async () => {
    const wallet = await newWallet();

    wallet.earnings.lastEarningDate = new Date(Date.now() - 5 * 86_400_000);
    wallet.earnings.dailyStreak = 9;
    await wallet.save();

    const claim = await wallet.claimDailyBonus();
    expect(claim.streak).toBe(1);
    // A restarted streak earns the base only — the streak bonus applies from the
    // second consecutive day onward.
    expect(claim.earned).toBe(10);
  });
});

describe('transaction ledger', () => {
  test('spending cannot push a balance below zero', async () => {
    const wallet = await newWallet();
    await wallet.addTransaction('spent', wallet.veilCoins + 500, 'Overspend');
    expect(wallet.veilCoins).toBe(0);
  });

  test('history is bounded so an old account does not carry an unbounded array', async () => {
    const wallet = await newWallet();
    for (let i = 0; i < 210; i += 1) wallet.applyTransaction('earned', 1, `n${i}`);
    expect(wallet.transactions.length).toBeLessThanOrEqual(200);
    // The most recent entry survives the trim.
    expect(wallet.transactions.at(-1).reason).toBe('n209');
  });
});

describe('budget-aware model selection', () => {
  /**
   * `grokService.generateWithBudget` calls this, and it did not exist — so
   * generating a debate summary threw "AICostService.getRecommendedModel is not
   * a function" every time a debate finished.
   */
  test('the method exists', () => {
    expect(typeof AICostService.getRecommendedModel).toBe('function');
  });

  test('an unattributed call falls back to the preferred model rather than throwing', async () => {
    const result = await AICostService.getRecommendedModel(null, 'free', 'llama-3.3-70b-versatile');
    expect(result.model).toBe('llama-3.3-70b-versatile');
  });

  // Stubbed by assignment rather than jest.spyOn: under native ESM the `jest`
  // global is not injected, and importing it from @jest/globals for two stubs is
  // more machinery than the replacement it would perform.
  const withBudgetStub = async (impl, assertions) => {
    const original = AICostService.canUserMakeRequest;
    AICostService.canUserMakeRequest = impl;
    try {
      await assertions();
    } finally {
      AICostService.canUserMakeRequest = original;
    }
  };

  test('an exhausted budget downgrades to the cheapest model', async () => {
    await withBudgetStub(
      async () => ({ allowed: false, budget: { exceeded: true, percentUsed: 130 } }),
      async () => {
        const result = await AICostService.getRecommendedModel(
          new mongoose.Types.ObjectId(), 'free', 'llama-3.3-70b-versatile',
        );
        expect(result.model).toBe('llama-3.1-8b-instant');
        expect(result.reason).toMatch(/budget exceeded/i);
      },
    );
  });

  test('a caller asking for the cheap model is never upgraded past it', async () => {
    await withBudgetStub(
      async () => ({ allowed: true, budget: { exceeded: false, percentUsed: 5 } }),
      async () => {
        const result = await AICostService.getRecommendedModel(
          new mongoose.Types.ObjectId(), 'pro', 'llama-3.1-8b-instant',
        );
        expect(result.model).toBe('llama-3.1-8b-instant');
      },
    );
  });

  test('a lookup failure fails open instead of blocking generation', async () => {
    await withBudgetStub(
      async () => { throw new Error('mongo unreachable'); },
      async () => {
        const result = await AICostService.getRecommendedModel(
          new mongoose.Types.ObjectId(), 'free', 'llama-3.3-70b-versatile',
        );
        expect(result.model).toBe('llama-3.3-70b-versatile');
      },
    );
  });
});

describe('cost attribution', () => {
  test('an unknown model is priced by family rather than at the top rate', () => {
    const cheap = AICostService.calculateCost('some-8b-instant-variant', 1_000_000, 0);
    const known = AICostService.calculateCost('llama-3.1-8b-instant', 1_000_000, 0);
    expect(cheap.cost).toBeCloseTo(known.cost, 10);
  });
});
