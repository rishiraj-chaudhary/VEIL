/**
 * PERFORMANCE GRAPH — Step 11
 * 
 * 8-node graph that runs after a debate completes and builds a longitudinal
 * skill profile cross-referenced with PersonaSnapshot for blind spot detection.
 * 
 * Nodes:
 *   1. retrieveRecentTurns    — fetch user's last N debate turns
 *   2. computeSkillDimensions — derive 6 skill scores from raw aiAnalysis data
 *   3. computeTrend           — compare against previous skillProfile snapshot
 *   4. detectBlindSpots       — cross-reference with PersonaSnapshot traits
 *   5. compareWithPeers       — percentile rank on each skill vs platform avg
 *   6. generateCoachingPlan   — LLM produces 2–3 concrete, skill-specific drills
 *   7. updateAchievements     — skill-based milestone unlocks
 *   8. persist                — write back to UserPerformance
 * 
 * Place at: backend/src/services/graph/performanceGraph.js
 */

import DebateTurn from '../../models/DebateTurn.js';
import PersonaSnapshot from '../../models/PersonaSnapshot.js';
import UserPerformance from '../../models/UserPerformance.js';
import grokService from '../grokService.js';

// ─── New skill-based achievements ────────────────────────────────────────────

const SKILL_ACHIEVEMENTS = [
  { id: 'argumentation_70', name: 'Sharp Mind',       icon: '🧠', skill: 'argumentation',    threshold: 70, description: 'Argumentation skill reached 70+' },
  { id: 'evidence_80',      name: 'Fact Checker',     icon: '📚', skill: 'evidenceUse',       threshold: 80, description: 'Evidence use skill reached 80+' },
  { id: 'tone_90',          name: 'Diplomat',         icon: '🕊️', skill: 'toneControl',       threshold: 90, description: 'Tone control reached 90+' },
  { id: 'clarity_80',       name: 'Crystal Clear',    icon: '💎', skill: 'clarity',           threshold: 80, description: 'Clarity skill reached 80+' },
  { id: 'rebuttal_75',      name: 'Counter Puncher',  icon: '🥊', skill: 'rebuttalStrength',  threshold: 75, description: 'Rebuttal strength reached 75+' },
  { id: 'fallacy_85',       name: 'Logic Guardian',   icon: '🛡️', skill: 'fallacyAvoidance',  threshold: 85, description: 'Fallacy avoidance reached 85+' },
  { id: 'all_skills_70',    name: 'All-Rounder',      icon: '⭐', skill: 'all',               threshold: 70, description: 'All 6 skills above 70' },
  { id: 'rapid_improver',   name: 'Fast Learner',     icon: '🚀', skill: 'trend',             threshold: null, description: '3+ skills improving simultaneously' },
];

// ─── Graph ────────────────────────────────────────────────────────────────────

class PerformanceGraph {

  // ── Node 1: Retrieve recent turns ──────────────────────────────────────────
  async _node_retrieveRecentTurns(state) {
    const turns = await DebateTurn.find({
      author: state.userId,
      isDeleted: false,
      'aiAnalysis.overallQuality': { $exists: true },
    })
      .sort({ createdAt: -1 })
      .limit(state.lookbackTurns)
      .lean();

    state.recentTurns = turns;
    console.log(`📊 [Perf:1] Retrieved ${turns.length} recent turns`);
  }

  // ── Node 2: Compute 6 skill dimensions ────────────────────────────────────
  async _node_computeSkillDimensions(state) {
    const turns = state.recentTurns;

    if (turns.length === 0) {
      state.skillProfile = {
        argumentation: 0, evidenceUse: 0, toneControl: 0,
        clarity: 0, rebuttalStrength: 0, fallacyAvoidance: 0,
      };
      console.log(`📊 [Perf:2] No turns — zero skill profile`);
      return;
    }

    // Aggregate raw scores across turns
    let totalTone = 0, totalClarity = 0, totalEvidence = 0, totalQuality = 0;
    let totalFallacies = 0, totalRebuttalTurns = 0, rebuttalQualitySum = 0;

    for (const turn of turns) {
      const a = turn.aiAnalysis || {};
      totalTone     += a.toneScore       || 0;
      totalClarity  += a.clarityScore    || 0;
      totalEvidence += a.evidenceQuality || 0;
      totalQuality  += a.overallQuality  || 0;
      totalFallacies += (a.fallacies?.length || 0);

      // Rebuttal strength: turns that have rebuttals get quality credit
      if (a.rebuttals?.length > 0) {
        totalRebuttalTurns++;
        rebuttalQualitySum += (a.overallQuality || 0);
      }
    }

    const n = turns.length;
    const avgTone     = totalTone / n;
    const avgClarity  = totalClarity / n;
    const avgEvidence = totalEvidence / n;
    const avgQuality  = totalQuality / n;
    const fallacyRate = totalFallacies / n; // fallacies per turn

    // Derive each skill dimension
    const argumentation    = Math.round((avgQuality * 0.5) + (avgClarity * 0.3) + (avgEvidence * 0.2));
    const evidenceUse      = Math.round(avgEvidence);
    const toneControl      = Math.round(avgTone);
    const clarity          = Math.round(avgClarity);
    const rebuttalStrength = totalRebuttalTurns > 0
      ? Math.round(rebuttalQualitySum / totalRebuttalTurns)
      : Math.round(avgQuality * 0.6); // estimate if no rebuttal turns yet
    const fallacyAvoidance = Math.round(Math.max(0, 100 - (fallacyRate * 25)));

    state.skillProfile = {
      argumentation:    Math.min(100, argumentation),
      evidenceUse:      Math.min(100, evidenceUse),
      toneControl:      Math.min(100, toneControl),
      clarity:          Math.min(100, clarity),
      rebuttalStrength: Math.min(100, rebuttalStrength),
      fallacyAvoidance: Math.min(100, fallacyAvoidance),
    };

    console.log(`📊 [Perf:2] Skills computed:`, state.skillProfile);
  }

  // ── Node 3: Compute trend vs previous snapshot ─────────────────────────────
  async _node_computeTrend(state) {
    const perf = state.performance;
    const prev = perf.skillProfile;

    // If no previous skill profile stored, this is the first run
    if (!prev || Object.keys(prev).length === 0) {
      state.trend = 'new';
      state.skillDeltas = {};
      state.improvingSkills = [];
      state.decliningSkills = [];
      console.log(`📊 [Perf:3] First performance run — no trend yet`);
      return;
    }

    const curr = state.skillProfile;
    const deltas = {};
    const improving = [];
    const declining = [];

    for (const skill of Object.keys(curr)) {
      const delta = curr[skill] - (prev[skill] || 0);
      deltas[skill] = Math.round(delta);
      if (delta >= 5)  improving.push(skill);
      if (delta <= -5) declining.push(skill);
    }

    // Classify overall trend
    let trend;
    if (improving.length >= 4)                         trend = 'improving';
    else if (declining.length >= 4)                    trend = 'declining';
    else if (improving.length === 0 && declining.length === 0) trend = 'plateau';
    else                                               trend = 'inconsistent';

    state.trend         = trend;
    state.skillDeltas   = deltas;
    state.improvingSkills  = improving;
    state.decliningSkills  = declining;

    console.log(`📊 [Perf:3] Trend: ${trend} (+${improving.length} skills, -${declining.length} skills)`);
  }

  // ── Node 4: Detect blind spots via PersonaSnapshot ────────────────────────
  async _node_detectBlindSpots(state) {
    state.blindSpots = [];
    state.personaAligned = [];

    try {
      const snapshot = await PersonaSnapshot.findOne({ userId: state.userId })
        .sort({ timestamp: -1 })
        .lean();

      if (!snapshot?.traits) {
        console.log(`📊 [Perf:4] No PersonaSnapshot — blind spot detection skipped`);
        return;
      }

      const traits    = snapshot.traits;
      const skills    = state.skillProfile;
      const blindSpots = [];
      const aligned    = [];

      // evidence-based style but low evidenceUse skill
      if (traits.argumentativeStyle === 'evidence-based' && skills.evidenceUse < 60) {
        blindSpots.push({
          trait: 'argumentativeStyle',
          traitValue: 'evidence-based',
          skill: 'evidenceUse',
          skillScore: skills.evidenceUse,
          insight: `You identify as evidence-based but your turns show weak evidence use (${skills.evidenceUse}/100). Your actual debates don't reflect your self-image.`,
        });
      }

      // low aggressiveness trait but low toneControl skill
      if (traits.aggressiveness < 30 && skills.toneControl < 60) {
        blindSpots.push({
          trait: 'aggressiveness',
          traitValue: traits.aggressiveness,
          skill: 'toneControl',
          skillScore: skills.toneControl,
          insight: `You see yourself as non-aggressive (${traits.aggressiveness}/100) but your tone scores suggest your writing comes across more harshly than intended (${skills.toneControl}/100).`,
        });
      }

      // high empathy but low toneControl
      if (traits.empathy > 70 && skills.toneControl < 65) {
        blindSpots.push({
          trait: 'empathy',
          traitValue: traits.empathy,
          skill: 'toneControl',
          skillScore: skills.toneControl,
          insight: `You score high on empathy (${traits.empathy}/100) but your debate tone doesn't reflect it (${skills.toneControl}/100). Empathy in identity vs in action.`,
        });
      }

      // logical style but high fallacy rate
      if (traits.argumentativeStyle === 'logical' && skills.fallacyAvoidance < 65) {
        blindSpots.push({
          trait: 'argumentativeStyle',
          traitValue: 'logical',
          skill: 'fallacyAvoidance',
          skillScore: skills.fallacyAvoidance,
          insight: `You identify as a logical debater but your turns contain frequent logical fallacies (avoidance: ${skills.fallacyAvoidance}/100). Consider reviewing common fallacy patterns.`,
        });
      }

      // aligned: high vocabulary complexity AND high argumentation
      if (traits.vocabularyComplexity > 65 && skills.argumentation > 70) {
        aligned.push({ trait: 'vocabularyComplexity', skill: 'argumentation', message: 'Your sophisticated language matches your strong argumentation skills.' });
      }

      // aligned: evidence-based AND high evidenceUse
      if (traits.argumentativeStyle === 'evidence-based' && skills.evidenceUse >= 70) {
        aligned.push({ trait: 'argumentativeStyle', skill: 'evidenceUse', message: 'Your evidence-based style is genuinely reflected in your debate performance.' });
      }

      state.blindSpots     = blindSpots;
      state.personaAligned = aligned;
      state.personaTone    = traits.tone;
      state.personaStyle   = traits.argumentativeStyle;

      console.log(`📊 [Perf:4] Blind spots: ${blindSpots.length}, Aligned: ${aligned.length}`);

    } catch (err) {
      console.error('Blind spot detection error:', err.message);
    }
  }

  // ── Node 5: Peer comparison ────────────────────────────────────────────────
  async _node_compareWithPeers(state) {
    try {
      // Fetch all users with skill profiles stored
      const allPerfs = await UserPerformance.find({
        'skillProfile.argumentation': { $exists: true },
        'stats.totalTurns': { $gte: 5 },
      }).select('skillProfile').lean();

      if (allPerfs.length < 3) {
        state.peerPercentiles = null;
        console.log(`📊 [Perf:5] Not enough peers for comparison (${allPerfs.length})`);
        return;
      }

      const skills = Object.keys(state.skillProfile);
      const percentiles = {};

      for (const skill of skills) {
        const allScores = allPerfs
          .map(p => p.skillProfile?.[skill] || 0)
          .sort((a, b) => a - b);

        const userScore = state.skillProfile[skill];
        const position  = allScores.filter(s => s <= userScore).length;
        percentiles[skill] = Math.round((position / allScores.length) * 100);
      }

      state.peerPercentiles = percentiles;
      console.log(`📊 [Perf:5] Peer percentiles computed across ${allPerfs.length} users`);

    } catch (err) {
      console.error('Peer comparison error:', err.message);
      state.peerPercentiles = null;
    }
  }

  // ── Node 6: Generate LLM coaching plan ────────────────────────────────────
  async _node_generateCoachingPlan(state) {
    try {
      const skills    = state.skillProfile;
      const blindSpots = state.blindSpots || [];
      const trend     = state.trend;
      const deltas    = state.skillDeltas || {};

      // Find weakest 2 skills
      const sortedSkills = Object.entries(skills).sort((a, b) => a[1] - b[1]);
      const weakest      = sortedSkills.slice(0, 2).map(([k, v]) => `${k}: ${v}/100`);
      const strongest    = sortedSkills.slice(-2).map(([k, v]) => `${k}: ${v}/100`);

      const blindSpotText = blindSpots.length > 0
        ? blindSpots.map(b => b.insight).join('\n')
        : 'No blind spots detected.';

      const deltaText = Object.entries(deltas)
        .map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${v}`)
        .join(', ') || 'First evaluation';

      const prompt = `You are a debate coach analyzing a student's performance.

Skill profile (0-100):
${Object.entries(skills).map(([k, v]) => `  ${k}: ${v}`).join('\n')}

Trend: ${trend}
Skill changes since last debate: ${deltaText}

Weakest skills: ${weakest.join(', ')}
Strongest skills: ${strongest.join(', ')}

Blind spots (self-perception vs actual performance):
${blindSpotText}

Generate a personalized coaching plan. Return ONLY valid JSON:
{
  "drills": [
    {
      "skill": "<skill name>",
      "title": "<short drill title>",
      "description": "<2-3 sentence specific, actionable drill>",
      "difficulty": "easy|medium|hard"
    }
  ],
  "focusArea": "<the single most important area to focus on this week>",
  "weeklyGoal": "<one concrete, measurable goal for next 3 debates>"
}

Rules:
- 2–3 drills only
- Each drill must be specific to the skill, not generic advice
- Drills should address weakest skills and blind spots first
- weeklyGoal must be measurable (e.g. "cite at least 2 sources per turn")
- No markdown, no preamble, JSON only`;

      const raw = await grokService.generateFast(prompt, { systemRole: 'You are a precise debate coach. Return only valid JSON.' });

      // Parse directly — strip markdown fences if present, then JSON.parse
      let parsed = null;
      try {
        const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const candidate = JSON.parse(clean);

        // Validate required fields exist
        if (
          candidate &&
          Array.isArray(candidate.drills) &&
          candidate.drills.length > 0 &&
          typeof candidate.focusArea === 'string' &&
          typeof candidate.weeklyGoal === 'string'
        ) {
          // Normalise drills — cap at 3, ensure difficulty is valid
          const validDifficulties = new Set(['easy', 'medium', 'hard']);
          candidate.drills = candidate.drills.slice(0, 3).map(d => ({
            skill:       typeof d.skill === 'string' ? d.skill : sortedSkills[0][0],
            title:       typeof d.title === 'string' ? d.title : 'Practice drill',
            description: typeof d.description === 'string' ? d.description : '',
            difficulty:  validDifficulties.has(d.difficulty) ? d.difficulty : 'medium',
          }));
          parsed = candidate;
        }
      } catch (_) {
        // JSON.parse failed — fall through to fallback
      }

      // Fallback if parsing or validation failed
      if (!parsed) {
        console.log('📊 [Perf:6] Using fallback coaching plan');
        parsed = {
          drills: [{
            skill:       sortedSkills[0][0],
            title:       `Strengthen your ${sortedSkills[0][0]}`,
            description: `Focus on ${sortedSkills[0][0]} in your next 3 debates. Review your weakest turns and identify recurring patterns to address.`,
            difficulty:  'medium',
          }],
          focusArea:  sortedSkills[0][0],
          weeklyGoal: `Improve ${sortedSkills[0][0]} score by 5 points in your next debate`,
        };
      }

      state.coachingPlan = parsed;
      console.log(`📊 [Perf:6] Coaching plan generated — focus: ${parsed.focusArea}`);

    } catch (err) {
      console.error('Coaching plan generation error:', err.message);
      state.coachingPlan = null;
    }
  }

  // ── Node 7: Update skill-based achievements ────────────────────────────────
  async _node_updateAchievements(state) {
    const newAchievements = [];
    const skills = state.skillProfile;
    const perf   = state.performance;

    for (const achievement of SKILL_ACHIEVEMENTS) {
      // Skip already earned
      if (perf.achievements?.some(a => a.id === achievement.id)) continue;

      let earned = false;

      if (achievement.skill === 'all') {
        earned = Object.values(skills).every(s => s >= achievement.threshold);
      } else if (achievement.skill === 'trend') {
        earned = state.improvingSkills?.length >= 3;
      } else {
        earned = (skills[achievement.skill] || 0) >= achievement.threshold;
      }

      if (earned) {
        newAchievements.push({
          id:          achievement.id,
          name:        achievement.name,
          description: achievement.description,
          icon:        achievement.icon,
          earnedAt:    new Date(),
        });
        console.log(`🏅 [Perf:7] Achievement unlocked: ${achievement.name}`);
      }
    }

    state.newAchievements = newAchievements;
  }

  // ── Node 8: Persist to UserPerformance ────────────────────────────────────
  async _node_persist(state) {
    if (!state.persist) {
      console.log(`📊 [Perf:8] Persist skipped (dry run)`);
      return;
    }

    const perf = state.performance;

    // Store skill profile
    perf.skillProfile = state.skillProfile;

    // Store performance trend
    perf.performanceTrend = state.trend === 'new' ? 'stable' : state.trend;

    // Store blind spots on analysis
    perf.analysis.blindSpots   = state.blindSpots || [];
    perf.analysis.personaAligned = state.personaAligned || [];
    perf.analysis.lastAnalyzed  = new Date();

    // Store peer percentiles
    if (state.peerPercentiles) {
      perf.peerPercentiles = state.peerPercentiles;
    }

    // Store coaching plan as structured coaching tips
    if (state.coachingPlan?.drills) {
      for (const drill of state.coachingPlan.drills) {
        const tip = {
          category:  drill.skill,
          priority:  drill.difficulty === 'hard' ? 'high' : drill.difficulty === 'medium' ? 'medium' : 'low',
          message:   drill.title,
          actionable: drill.description,
          source:    'performanceGraph',
        };
        if (typeof perf.addCoachingTip === 'function') {
          await perf.addCoachingTip(tip);
        }
      }
    }

    // Add skill snapshot
    perf.snapshots.push({
      date:            new Date(),
      period:          'post-debate',
      debatesInPeriod: perf.stats.totalDebates,
      avgToneScore:    state.skillProfile.toneControl,
      avgClarityScore: state.skillProfile.clarity,
      avgEvidenceScore: state.skillProfile.evidenceUse,
      fallacyRate:     (100 - state.skillProfile.fallacyAvoidance) / 100,
      winRate:         perf.stats.winRate,
      skillProfile:    { ...state.skillProfile },
    });

    if (perf.snapshots.length > 52) {
      perf.snapshots = perf.snapshots.slice(-52);
    }

    // Award new achievements
    for (const achievement of state.newAchievements || []) {
      if (typeof perf.awardAchievement === 'function') {
        await perf.awardAchievement(achievement);
      } else {
        perf.achievements.push(achievement);
      }
    }

    await perf.save();
    console.log(`📊 [Perf:8] Persisted skill profile to UserPerformance`);
  }

  // ── Public run method ──────────────────────────────────────────────────────
  /**
   * @param {string|ObjectId} userId
   * @param {Object} options
   * @param {number}  options.lookbackTurns  — how many recent turns to analyse (default 20)
   * @param {boolean} options.persist        — write back to DB (default true)
   */
  async run(userId, options = {}) {
    const {
      lookbackTurns = 20,
      persist = true,
    } = options;

    // Load or create UserPerformance
    let performance = await UserPerformance.findOne({ user: userId });
    if (!performance) {
      performance = await UserPerformance.create({ user: userId });
    }

    const state = {
      userId,
      lookbackTurns,
      persist,
      performance,
      recentTurns:     [],
      skillProfile:    {},
      trend:           'new',
      skillDeltas:     {},
      improvingSkills: [],
      decliningSkills: [],
      blindSpots:      [],
      personaAligned:  [],
      peerPercentiles: null,
      coachingPlan:    null,
      newAchievements: [],
    };

    try {
      await this._node_retrieveRecentTurns(state);
      await this._node_computeSkillDimensions(state);
      await this._node_computeTrend(state);
      await this._node_detectBlindSpots(state);
      await this._node_compareWithPeers(state);
      await this._node_generateCoachingPlan(state);
      await this._node_updateAchievements(state);
      await this._node_persist(state);
    } catch (err) {
      console.error('❌ PerformanceGraph error:', err.message);
    }

    return {
      userId,
      turnCount:       state.recentTurns.length,
      skillProfile:    state.skillProfile,
      trend:           state.trend,
      skillDeltas:     state.skillDeltas,
      improvingSkills: state.improvingSkills,
      decliningSkills: state.decliningSkills,
      blindSpots:      state.blindSpots,
      personaAligned:  state.personaAligned,
      peerPercentiles: state.peerPercentiles,
      coachingPlan:    state.coachingPlan,
      newAchievements: state.newAchievements,
    };
  }
}

export default new PerformanceGraph();