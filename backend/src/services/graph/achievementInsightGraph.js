/**
 * ACHIEVEMENT INSIGHT GRAPH — Phase 10
 *
 * Weekly AI analysis of debate activity that detects genuinely meaningful
 * moments and awards skill-based achievements.
 *
 * No vanity metrics — every badge is earned through reasoning quality signals.
 *
 * Nodes:
 *   1. loadWeeklyActivity      — pulls turns + scores from last 7 days
 *   2. detectHighImpactMoments — top 20% evidence/clarity turns
 *   3. detectDeEscalations     — threads that improved after user commented
 *   4. detectStrongEvidence    — unrefuted high-evidence turns
 *   5. generateHighlights      — LLM personalised weekly summary
 *   6. awardSkillBadges + persist
 *
 * Skills awarded:
 *   clarifier   — consistently high clarity
 *   rebutter    — successful refutations
 *   synthesizer — bridges opposing positions
 *   mediator    — de-escalation moments
 *
 * Place at: backend/src/services/graph/achievementInsightGraph.js
 */

import DebateTurn from '../../models/debateTurn.js';
import UserPerformance from '../../models/UserPerformance.js';
import grokService from '../grokService.js';

// ─── Achievement definitions ──────────────────────────────────────────────────

const ACHIEVEMENTS = {
  // Skill-based
  clarifier: {
    id: 'clarifier_1',
    name: 'The Clarifier',
    description: 'Consistently high clarity scores across debates',
    icon: '💎',
    skill: 'clarity',
  },
  rebutter: {
    id: 'rebutter_1',
    name: 'The Rebutter',
    description: 'Effectively challenged opposing arguments',
    icon: '🥊',
    skill: 'rebuttalStrength',
  },
  synthesizer: {
    id: 'synthesizer_1',
    name: 'The Synthesizer',
    description: 'Bridged opposing positions with nuanced arguments',
    icon: '🔗',
    skill: 'argumentation',
  },
  mediator: {
    id: 'mediator_1',
    name: 'The Mediator',
    description: 'De-escalated heated discussions',
    icon: '🕊️',
    skill: 'toneControl',
  },
  // Quality milestones
  evidence_master: {
    id: 'evidence_master_1',
    name: 'Evidence Master',
    description: 'Submitted exceptional evidence-based arguments',
    icon: '📚',
    skill: 'evidenceUse',
  },
  logic_shield: {
    id: 'logic_shield_1',
    name: 'Logic Shield',
    description: 'Debated multiple rounds without a single fallacy',
    icon: '🛡️',
    skill: 'fallacyAvoidance',
  },
  // Activity milestones
  first_win: {
    id: 'first_win',
    name: 'First Victory',
    description: 'Won your first debate',
    icon: '🏆',
    skill: null,
  },
  five_debates: {
    id: 'five_debates',
    name: 'Getting Started',
    description: 'Completed 5 debates',
    icon: '⚡',
    skill: null,
  },
  ten_debates: {
    id: 'ten_debates',
    name: 'Seasoned Debater',
    description: 'Completed 10 debates',
    icon: '🔥',
    skill: null,
  },
};

// ─── Graph ────────────────────────────────────────────────────────────────────

class AchievementInsightGraph {

  // ── Node 1: Load weekly activity ─────────────────────────────────────────────
  async _node_loadWeeklyActivity(state) {
    const { userId } = state;

    const performance = await UserPerformance.findOne({ user: userId });
    if (!performance) {
      state.skipAnalysis = true;
      console.log('🏆 [Achievement:1] No performance data, skipping');
      return;
    }

    state.performance = performance;

    // Load turns from last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentTurns = await DebateTurn.find({
      user: userId,
      createdAt: { $gte: weekAgo },
    })
      .populate('debate', 'topic status winner')
      .sort({ createdAt: -1 })
      .lean();

    // Also load all turns for milestone checks (total counts)
    const allTurns = await DebateTurn.find({ user: userId }).lean();

    state.recentTurns  = recentTurns;
    state.allTurns     = allTurns;
    state.weekAgo      = weekAgo;

    console.log(`🏆 [Achievement:1] ${recentTurns.length} turns this week, ${allTurns.length} total`);
  }

  // ── Node 2: Detect high-impact moments ───────────────────────────────────────
  async _node_detectHighImpactMoments(state) {
    if (state.skipAnalysis) return;

    const turns = state.recentTurns;
    if (!turns.length) {
      state.highImpactTurns = [];
      return;
    }

    // Compute average scores across recent turns
    const avgClarity  = turns.reduce((s, t) => s + (t.analysis?.clarityScore  || 0), 0) / turns.length;
    const avgEvidence = turns.reduce((s, t) => s + (t.analysis?.evidenceScore || 0), 0) / turns.length;
    const avgTone     = turns.reduce((s, t) => s + (t.analysis?.toneScore     || 0), 0) / turns.length;

    // Flag turns in top 20% (score > avg + 10 points, minimum 70)
    state.highImpactTurns = turns.filter(t => {
      const clarity  = t.analysis?.clarityScore  || 0;
      const evidence = t.analysis?.evidenceScore || 0;
      const tone     = t.analysis?.toneScore     || 0;
      return (
        clarity  > Math.max(avgClarity  + 10, 70) ||
        evidence > Math.max(avgEvidence + 10, 70) ||
        tone     > Math.max(avgTone     + 10, 70)
      );
    });

    // Detect clean debates (no fallacies)
    state.cleanDebateTurns = turns.filter(t =>
      t.analysis?.fallacies?.length === 0 && (t.analysis?.overallQuality || 0) > 60
    );

    console.log(`🏆 [Achievement:2] High-impact turns: ${state.highImpactTurns.length}, clean: ${state.cleanDebateTurns.length}`);
  }

  // ── Node 3: Detect de-escalations ────────────────────────────────────────────
  async _node_detectDeEscalations(state) {
    if (state.skipAnalysis) return;

    // Look for posts where threadAnalysis improved and user commented
    // Proxy: turns where user had high tone score (>75) in a debate
    // that had prior aggressive turns (tone < 50)
    const turns = state.recentTurns;
    let deEscalations = 0;

    // Group turns by debate
    const byDebate = {};
    for (const turn of turns) {
      const did = turn.debate?._id?.toString() || turn.debate?.toString();
      if (did) {
        if (!byDebate[did]) byDebate[did] = [];
        byDebate[did].push(turn);
      }
    }

    // For each debate, check if user maintained high tone while others were aggressive
    for (const [, debateTurns] of Object.entries(byDebate)) {
      const userTone   = debateTurns.reduce((s, t) => s + (t.analysis?.toneScore || 0), 0) / debateTurns.length;
      const debateAvgTone = debateTurns.reduce((s, t) => s + (t.analysis?.toneScore || 0), 0) / debateTurns.length;

      // User maintained civil tone (>70) in a heated context
      if (userTone > 70 && debateAvgTone < 60) deEscalations++;
    }

    state.deEscalationCount = deEscalations;
    console.log(`🏆 [Achievement:3] De-escalations detected: ${deEscalations}`);
  }

  // ── Node 4: Detect strong evidence ───────────────────────────────────────────
  async _node_detectStrongEvidence(state) {
    if (state.skipAnalysis) return;

    const strongEvidenceTurns = state.recentTurns.filter(t =>
      (t.analysis?.evidenceScore || 0) >= 75 &&
      (t.analysis?.fallacies?.length || 0) === 0
    );

    // Check skill profile for rebuttal strength
    const skillProfile = state.performance.skillProfile;
    state.rebuttalStrength = skillProfile?.rebuttalStrength || 0;
    state.strongEvidenceCount = strongEvidenceTurns.length;

    console.log(`🏆 [Achievement:4] Strong evidence turns: ${state.strongEvidenceCount}, rebuttal strength: ${state.rebuttalStrength}`);
  }

  // ── Node 5: Generate weekly highlight ────────────────────────────────────────
  async _node_generateHighlights(state) {
    if (state.skipAnalysis) return;

    const turns = state.recentTurns;
    if (!turns.length) {
      state.weeklyHighlight = null;
      return;
    }

    const perf        = state.performance;
    const skillProfile = perf.skillProfile;

    const summaryLines = [
      `Debates this week: ${turns.length} turns`,
      `High-impact moments: ${state.highImpactTurns.length}`,
      `Strong evidence turns: ${state.strongEvidenceCount}`,
      `Clean (fallacy-free) turns: ${state.cleanDebateTurns.length}`,
      `De-escalation moments: ${state.deEscalationCount}`,
      skillProfile ? `Top skill: ${this._topSkill(skillProfile)}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `You are an AI debate coach writing a personalised weekly highlight for a debater.

THEIR WEEK:
${summaryLines}

OVERALL STATS:
Win rate: ${Math.round(perf.stats.winRate)}%
Total debates: ${perf.stats.totalDebates}
Trend: ${perf.performanceTrend}

Write 2–3 sentences that feel personal, specific, and encouraging.
Mention their strongest moment this week if data supports it.
Do not use bullet points. Plain text only. Be concise.`;

    try {
      const highlight = await grokService.generateFast(prompt, {
        systemRole: 'You are an encouraging AI debate coach. Be specific, brief, and personal.',
      });
      state.weeklyHighlight = highlight.trim().slice(0, 400);
    } catch {
      state.weeklyHighlight = turns.length > 0
        ? `You submitted ${turns.length} debate turn${turns.length > 1 ? 's' : ''} this week${state.highImpactTurns.length > 0 ? ' with ' + state.highImpactTurns.length + ' high-impact moment' + (state.highImpactTurns.length > 1 ? 's' : '') : ''}. Keep pushing.`
        : null;
    }

    console.log(`🏆 [Achievement:5] Highlight generated: ${state.weeklyHighlight?.length} chars`);
  }

  // ── Node 6: Award skill badges + persist ─────────────────────────────────────
  async _node_awardAndPersist(state) {
    if (state.skipAnalysis) return;

    const perf         = state.performance;
    const skillProfile = perf.skillProfile || {};
    const awarded      = [];

    // Helper — award if not already earned
    const tryAward = async (achievementKey) => {
      const ach = ACHIEVEMENTS[achievementKey];
      if (!ach) return;
      const alreadyHas = perf.achievements.find(a => a.id === ach.id);
      if (!alreadyHas) {
        perf.achievements.push({ ...ach, earnedAt: new Date() });
        awarded.push(ach.name);
      }
    };

    // Skill-based awards
    if (skillProfile.clarity >= 70)          await tryAward('clarifier');
    if (skillProfile.rebuttalStrength >= 70)  await tryAward('rebutter');
    if (skillProfile.argumentation >= 70)     await tryAward('synthesizer');
    if (skillProfile.toneControl >= 70 && state.deEscalationCount > 0)
                                              await tryAward('mediator');
    if (skillProfile.evidenceUse >= 75 || state.strongEvidenceCount >= 3)
                                              await tryAward('evidence_master');
    if (state.cleanDebateTurns.length >= 3)   await tryAward('logic_shield');

    // Milestone awards
    if (perf.stats.wins >= 1)                 await tryAward('first_win');
    if (perf.stats.totalDebates >= 5)         await tryAward('five_debates');
    if (perf.stats.totalDebates >= 10)        await tryAward('ten_debates');

    // Persist weekly highlight to coachingTips as a special entry
    if (state.weeklyHighlight) {
      // Remove old weekly highlights first
      perf.coachingTips = perf.coachingTips.filter(t => t.source !== 'weeklyHighlight');

      perf.coachingTips.unshift({
        category:   'weekly_highlight',
        priority:   'medium',
        message:    '✦ This Week',
        actionable: state.weeklyHighlight,
        source:     'weeklyHighlight',
        createdAt:  new Date(),
        dismissed:  false,
      });
    }

    await perf.save();

    state.awarded = awarded;
    state.result  = {
      weeklyHighlight:     state.weeklyHighlight,
      newAchievements:     awarded,
      totalAchievements:   perf.achievements.length,
      highImpactMoments:   state.highImpactTurns.length,
      deEscalations:       state.deEscalationCount,
      strongEvidenceTurns: state.strongEvidenceCount,
      turnsThisWeek:       state.recentTurns.length,
    };

    console.log(`🏆 [Achievement:6] Awarded: [${awarded.join(', ') || 'none'}], total: ${perf.achievements.length}`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  _topSkill(skillProfile) {
    const entries = Object.entries(skillProfile).filter(([, v]) => typeof v === 'number');
    if (!entries.length) return 'unknown';
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0].replace(/([A-Z])/g, ' $1').toLowerCase();
  }

  // ─── Public run ───────────────────────────────────────────────────────────────
  /**
   * @param {string|ObjectId} userId
   */
  async run(userId) {
    const state = {
      userId:              userId.toString(),
      performance:         null,
      recentTurns:         [],
      allTurns:            [],
      highImpactTurns:     [],
      cleanDebateTurns:    [],
      deEscalationCount:   0,
      strongEvidenceCount: 0,
      rebuttalStrength:    0,
      weeklyHighlight:     null,
      skipAnalysis:        false,
      awarded:             [],
      result:              null,
    };

    try {
      await this._node_loadWeeklyActivity(state);
      if (state.skipAnalysis) return { weeklyHighlight: null, newAchievements: [], totalAchievements: 0 };

      await this._node_detectHighImpactMoments(state);
      await this._node_detectDeEscalations(state);
      await this._node_detectStrongEvidence(state);
      await this._node_generateHighlights(state);
      await this._node_awardAndPersist(state);

    } catch (err) {
      console.error('❌ AchievementInsightGraph error:', err.message);
      return { weeklyHighlight: null, newAchievements: [], totalAchievements: 0 };
    }

    return state.result;
  }
}

export default new AchievementInsightGraph();