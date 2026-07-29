import crypto from 'crypto';
import Drill from '../models/Drill.js';
import logger from '../utils/logger.js';
import debateTurnGraph from './graph/debateTurnGraph.js';

/**
 * DAILY DRILL
 *
 * One prompt a day, one argument, scored immediately.
 *
 * The platform had no reason for anyone to return: a debate is episodic, and
 * once it ends nothing brings the user back tomorrow. A drill is deliberately
 * small — a few minutes — because a habit forms around something cheap to do,
 * not around a twenty-minute commitment.
 *
 * Prompts are selected deterministically from the user id and the date, so
 * everyone gets a stable prompt for the day that does not change on refresh,
 * and two users are unlikely to draw the same one.
 */

const PROMPTS = [
  { id: 'social-teens',   skill: 'evidence',  text: 'Social media does more harm than good for teenagers. Argue against this.' },
  { id: 'remote-right',   skill: 'reasoning', text: 'Remote work should be a legal right. Make the strongest case for it.' },
  { id: 'ai-art',         skill: 'reasoning', text: 'AI-generated art is real art. Argue whichever side you find harder.' },
  { id: 'free-uni',       skill: 'evidence',  text: 'University education should be free at the point of use. Argue against.' },
  { id: 'nuclear',        skill: 'evidence',  text: 'Nuclear power is essential to decarbonisation. Make the case.' },
  { id: 'voting-age',     skill: 'reasoning', text: 'The voting age should be lowered to 16. Argue for it.' },
  { id: 'gig-economy',    skill: 'reasoning', text: 'Gig workers should be classified as employees. Argue against.' },
  { id: 'space-spend',    skill: 'evidence',  text: 'Public money spent on space exploration is better spent on Earth. Rebut this.' },
  { id: 'four-day',       skill: 'evidence',  text: 'A four-day working week would not reduce output. Defend that claim.' },
  { id: 'anonymity',      skill: 'reasoning', text: 'Online anonymity does more good than harm. Argue whichever side you believe less.' },
  { id: 'steelman',       skill: 'steelman',  text: 'Take a view you disagree with and argue it as convincingly as you can.' },
  { id: 'concede',        skill: 'honesty',   text: 'Describe a position you changed your mind about, and what actually changed it.' },
];

const MIN_WORDS = 30;

/** Local-date key. Using the date string avoids timezone arithmetic in queries. */
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

const previousDay = (key) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return dayKey(d);
};

class DrillService {
  /** Stable per user per day, so a refresh never rerolls the prompt. */
  selectPrompt(userId, day) {
    const digest = crypto.createHash('sha256').update(`${userId}:${day}`).digest();
    return PROMPTS[digest.readUInt32BE(0) % PROMPTS.length];
  }

  /** Today's drill, created on first request. */
  async getToday(userId) {
    const day = dayKey();
    const existing = await Drill.findOne({ user: userId, day }).lean();
    if (existing) return existing;

    const prompt = this.selectPrompt(userId.toString(), day);

    try {
      return (await Drill.create({
        user: userId,
        day,
        prompt: prompt.text,
        promptId: prompt.id,
        skill: prompt.skill,
      })).toObject();
    } catch (error) {
      // Unique index collision: another request created it first.
      if (error.code === 11000) return Drill.findOne({ user: userId, day }).lean();
      throw error;
    }
  }

  /**
   * Scores a submitted drill through the same rubric a debate turn uses, so a
   * drill score means the same thing as a debate score.
   */
  async submit(userId, response) {
    const day = dayKey();
    const drill = await Drill.findOne({ user: userId, day });

    if (!drill) return { ok: false, reason: 'no-drill' };
    if (drill.completedAt) return { ok: false, reason: 'already-done', drill: drill.toObject() };

    const words = response.trim().split(/\s+/).filter(Boolean).length;
    if (words < MIN_WORDS) return { ok: false, reason: 'too-short', minWords: MIN_WORDS, words };

    const analysis = await debateTurnGraph.run(response, 'for', [], userId, null, 'free');
    const breakdown = analysis.decisionTrace?.find(t => t.step === 'overall_quality')?.data?.breakdown;

    drill.response = response.trim();
    drill.wordCount = words;
    drill.scores = {
      overall:   analysis.overallQuality ?? null,
      substance: breakdown?.substance?.score ?? null,
      evidence:  breakdown?.evidence?.score ?? null,
      clarity:   breakdown?.clarity?.score ?? null,
      tone:      breakdown?.tone?.score ?? null,
    };
    drill.feedback = breakdown?.substance?.reason || null;
    drill.fallacies = (analysis.fallacies || []).map(f => f.type);
    drill.completedAt = new Date();

    await drill.save();

    const streak = await this.getStreak(userId);
    logger.info('drill completed', { userId: userId.toString(), score: drill.scores.overall, streak: streak.current });

    return { ok: true, drill: drill.toObject(), streak };
  }

  /**
   * Current and longest streak of consecutive completed days.
   *
   * Counts back from today, tolerating a not-yet-done today so the streak is
   * not shown as broken before the day is over.
   */
  async getStreak(userId) {
    const completed = await Drill.find({ user: userId, completedAt: { $ne: null } })
      .select('day')
      .sort({ day: -1 })
      .limit(400)
      .lean();

    const days = new Set(completed.map(d => d.day));
    const today = dayKey();

    let cursor = days.has(today) ? today : previousDay(today);
    let current = 0;
    while (days.has(cursor)) {
      current += 1;
      cursor = previousDay(cursor);
    }

    // Longest run anywhere in the history.
    const ordered = [...days].sort();
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const day of ordered) {
      run = prev && previousDay(day) === prev ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = day;
    }

    return {
      current,
      longest,
      total: days.size,
      completedToday: days.has(today),
    };
  }

  async getHistory(userId, limit = 30) {
    return Drill.find({ user: userId, completedAt: { $ne: null } })
      .select('day prompt skill scores wordCount completedAt')
      .sort({ day: -1 })
      .limit(limit)
      .lean();
  }
}

export default new DrillService();
export { PROMPTS, MIN_WORDS };
