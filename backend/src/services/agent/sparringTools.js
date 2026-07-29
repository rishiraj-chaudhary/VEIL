/**
 * SPARRING TOOLS
 *
 * The tools the sparring agent may call. Each one answers a question about this
 * platform's own history — which is the whole reason the agent is worth running.
 * A language model can invent a counter-argument unaided; it cannot know that
 * *you* have made this exact claim four times and lost it three.
 *
 * Every tool wraps a service that already existed. Nothing here computes anything
 * new; the agent's contribution is deciding which to call, on what, and when to
 * stop. Tools return plain data and never throw — a failed lookup degrades the
 * agent's evidence, it does not end the session.
 */

import mongoose from 'mongoose';
import Claim from '../../models/Claim.js';
import knowledgeGraphService from '../knowledgeGraphService.js';
import vectorStoreService from '../vectorStoreService.js';
import fallacyGraph from '../graph/fallacyGraph.js';

/** Resilience bands, matching argumentReputationService's tiers. */
const bandFor = (score, refutations) => {
  if (refutations === 0) return 'untested';
  if (score >= 85) return 'ironclad';
  if (score >= 70) return 'solid';
  if (score >= 55) return 'contested';
  if (score >= 40) return 'brittle';
  return 'fragile';
};

const safe = async (label, fn, fallback) => {
  try {
    return await fn();
  } catch (error) {
    console.warn(`⚠️ [tool:${label}] ${error.message}`);
    return fallback;
  }
};

/**
 * What this platform already knows about a claim's durability.
 *
 * Checks the exact claim first, then falls back to text search scoped to the
 * author, because the useful signal is "you have argued this before" rather than
 * "someone once argued something similar".
 */
export const claimTrackRecord = {
  name: 'claimTrackRecord',
  description: "Look up how a claim has fared before — uses, refutations, resilience.",

  async run({ claimText, userId }) {
    return safe('claimTrackRecord', async () => {
      const exact = await knowledgeGraphService.getClaimStats(claimText);

      if (exact) {
        return {
          found: true,
          match: 'exact',
          text: exact.originalText,
          uses: exact.stats.totalUses,
          refutations: exact.stats.refutationCount,
          refutationSuccessRate: exact.stats.refutationSuccessRate,
          resilience: exact.stats.claimResilienceScore,
          band: bandFor(exact.stats.claimResilienceScore, exact.stats.refutationCount),
          knownCounters: exact.counterClaims.slice(0, 3).map(c => c.text).filter(Boolean),
        };
      }

      // No exact match: look for the author's own similar claims. Scoping to the
      // author is what makes this a track record rather than trivia.
      if (!userId) return { found: false, match: 'none' };

      const similar = await Claim.find({
        author: new mongoose.Types.ObjectId(userId.toString()),
        $text: { $search: knowledgeGraphService.normalizeClaim(claimText) },
      })
        .select('originalText stats')
        .sort({ score: { $meta: 'textScore' } })
        .limit(1)
        .lean();

      if (!similar.length) return { found: false, match: 'none' };

      const s = similar[0];
      return {
        found: true,
        match: 'similar',
        text: s.originalText,
        uses: s.stats?.totalUses ?? 0,
        refutations: s.stats?.refutationCount ?? 0,
        refutationSuccessRate: Math.round((s.stats?.refutationSuccessRate ?? 0) * 100),
        resilience: s.stats?.claimResilienceScore ?? 100,
        band: bandFor(s.stats?.claimResilienceScore ?? 100, s.stats?.refutationCount ?? 0),
        knownCounters: [],
      };
    }, { found: false, match: 'error' });
  },
};

/**
 * Real counter-arguments from the opposing side, filtered to turns that scored
 * well. This is what the attack node grounds itself in, so the attack reflects
 * how people actually beat this argument here.
 */
export const priorAttacks = {
  name: 'priorAttacks',
  description: 'Retrieve high-scoring opposing turns that argued against this.',

  async run({ claimText, side, k = 3 }) {
    return safe('priorAttacks', async () => {
      const docs = await vectorStoreService.findCounterArguments(claimText, side, k);
      return docs.map(d => ({
        text: (d.content || '').slice(0, 400),
        side: d.side,
        quality: d.quality,
      }));
    }, []);
  },
};

/** The strongest turns on this subject, used to ground a repair suggestion. */
export const provenDefences = {
  name: 'provenDefences',
  description: 'Retrieve the highest-scoring turns on this subject, any side.',

  async run({ claimText, k = 2 }) {
    return safe('provenDefences', async () => {
      const docs = await vectorStoreService.findStrongArguments(claimText, k);
      return docs.map(d => ({
        text: (d.content || '').slice(0, 400),
        side: d.side,
        quality: d.quality,
      }));
    }, []);
  },
};

/**
 * Structural flaws in the draft itself, independent of what the opponent says.
 * Runs the existing fallacy graph rather than re-asking a model.
 */
export const fallacyScan = {
  name: 'fallacyScan',
  description: 'Detect logical fallacies in a passage.',

  async run({ text, userTier = 'free' }) {
    return safe('fallacyScan', async () => {
      const found = await fallacyGraph.detect(text, { round: 1, userTier });
      return (found || [])
        .filter(f => (f.confidence ?? 0) >= 0.7)
        .map(f => ({ type: f.type, severity: f.severity, quote: f.quote }));
    }, []);
  },
};

export const TOOLS = { claimTrackRecord, priorAttacks, provenDefences, fallacyScan };

/**
 * Call a tool and record it on the session trace, so the UI can show what the
 * agent actually consulted rather than asking the user to trust it.
 */
export const invokeTool = async (name, args, trace = []) => {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown sparring tool: ${name}`);

  const startedAt = Date.now();
  const result = await tool.run(args);
  const count = Array.isArray(result) ? result.length : result?.found ? 1 : 0;

  trace.push({
    kind: 'tool',
    tool: name,
    ms: Date.now() - startedAt,
    resultCount: count,
  });

  return result;
};

export default TOOLS;
