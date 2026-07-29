import Debate from '../models/debate.js';
import DebateTurn from '../models/debateTurn.js';
import User from '../models/user.js';
import grokService from './grokService.js';
import vectorStoreService from './vectorStoreService.js';

/**
 * AI OPPONENT
 *
 * A debate needs two participants, which on a small platform means most attempts
 * to start one go unanswered. The AI opponent removes that dependency: anyone can
 * debate immediately, at a chosen difficulty and style.
 *
 * It argues a fixed side honestly. It is not designed to win by any means — it
 * concedes ground when a point lands, because the product's value is the user
 * learning to argue, not the user being beaten.
 */

const AI_USERNAME = 'veil_ai';

const DIFFICULTY_PROFILES = {
  easy: {
    label: 'Sparring partner',
    guidance: 'Argue plainly with one clear reason per point. Do not use technical evidence or complex structure. Concede readily when the opponent makes a fair point.',
    wordTarget: 90,
  },
  balanced: {
    label: 'Even match',
    guidance: 'Argue clearly with a reason and one supporting example per point. Address the opponent\'s strongest point directly. Concede when a point genuinely lands.',
    wordTarget: 140,
  },
  hard: {
    label: 'Strong opponent',
    guidance: 'Argue rigorously. Anticipate objections, cite concrete evidence, and attack the weakest link in the opponent\'s reasoning explicitly. Concede only when clearly beaten.',
    wordTarget: 190,
  },
  brutal: {
    label: 'Championship',
    guidance: 'Argue at competitive debate standard. Steelman the opponent, then dismantle the strongest version. Use precise evidence, name logical flaws explicitly, and control the framing of the exchange. Concede almost nothing without a fight.',
    wordTarget: 240,
  },
};

const STYLE_PROFILES = {
  socratic:   'Lead with probing questions that expose unexamined assumptions before asserting your own position.',
  evidence:   'Ground every point in data, studies, or concrete documented examples.',
  aggressive: 'Be direct and forceful. Attack weak reasoning head-on — but never the person.',
  empathetic: 'Acknowledge what is right in the opponent\'s view before explaining why it is insufficient.',
};

class AIOpponentService {
  /**
   * The AI participates as a real user record so every existing query, join,
   * population and scoring path treats it like any other participant.
   */
  async getAIUser() {
    let aiUser = await User.findOne({ username: AI_USERNAME });
    if (aiUser) return aiUser;

    aiUser = await User.create({
      username: AI_USERNAME,
      email: 'ai@veil.local',
      // Unusable credential: this account is never logged into.
      password: `${Date.now()}-${Math.random().toString(36)}-ai-opponent`,
      isActive: true,
      isSystem: true,
    });

    console.log('🤖 Created AI opponent user');
    return aiUser;
  }

  getProfile(difficulty = 'balanced', style = 'evidence') {
    return {
      difficulty: DIFFICULTY_PROFILES[difficulty] ? difficulty : 'balanced',
      style: STYLE_PROFILES[style] ? style : 'evidence',
    };
  }

  listProfiles() {
    return {
      difficulties: Object.entries(DIFFICULTY_PROFILES).map(([id, p]) => ({ id, label: p.label })),
      styles: Object.keys(STYLE_PROFILES),
    };
  }

  /**
   * Creates a debate with the AI already joined on the opposing side and the
   * debate active — no waiting for an opponent to appear.
   */
  async createDebateVsAI({ topic, description, userId, userSide = 'for', difficulty = 'balanced', style = 'evidence' }) {
    const aiUser = await this.getAIUser();
    const profile = this.getProfile(difficulty, style);
    const aiSide = userSide === 'for' ? 'against' : 'for';

    const debate = await Debate.create({
      topic,
      description: description || `Practice debate against the AI (${DIFFICULTY_PROFILES[profile.difficulty].label}).`,
      type: 'text',
      format: '1v1',
      visibility: 'private',
      initiator: userId,
      rounds: Debate.getDefaultRounds(),
      participants: [
        { user: userId, side: userSide, isReady: true },
        { user: aiUser._id, side: aiSide, isReady: true, isAI: true, aiProfile: profile },
      ],
    });

    // Both seats are filled and ready, so the debate can open immediately.
    // Going through startDebate() rather than setting status by hand is what
    // assigns currentRound and currentTurn — without them the UI cannot tell
    // whose move it is and the compose box stays disabled forever.
    await debate.startDebate();

    await debate.populate('participants.user', 'username');
    return debate;
  }

  isAIParticipant(debate, userId) {
    return debate.participants?.some(
      p => p.isAI && (p.user?._id ?? p.user)?.toString() === userId?.toString()
    );
  }

  getAIParticipant(debate) {
    return debate.participants?.find(p => p.isAI) || null;
  }

  /**
   * Generates the AI's next turn.
   *
   * Retrieval is best-effort: argument technique from the knowledge base makes
   * replies sharper, but its absence must not block a turn.
   */
  async generateTurn(debate, { round = 1, roundType = 'opening' } = {}) {
    const aiParticipant = this.getAIParticipant(debate);
    if (!aiParticipant) throw new Error('Debate has no AI participant');

    const profile = aiParticipant.aiProfile || { difficulty: 'balanced', style: 'evidence' };
    const difficulty = DIFFICULTY_PROFILES[profile.difficulty] || DIFFICULTY_PROFILES.balanced;
    const styleGuidance = STYLE_PROFILES[profile.style] || STYLE_PROFILES.evidence;

    const previousTurns = await DebateTurn.find({ debate: debate._id })
      .sort({ turnNumber: 1 })
      .select('content side round')
      .limit(12)
      .lean();

    const transcript = previousTurns.length
      ? previousTurns.map(t => `[${t.side.toUpperCase()}] ${t.content}`).join('\n\n')
      : '(no turns yet — you are opening)';

    // Retrieval now surfaces how real debaters have argued this side before,
    // rather than generic technique advice the model already knows. Prior turns
    // are the one input here that cannot come from pretraining.
    let priorArguments = '';
    try {
      const opponentSide = aiParticipant.side === 'for' ? 'against' : 'for';
      const priors = await vectorStoreService.findCounterArguments(
        `${debate.topic}. ${previousTurns[previousTurns.length - 1]?.content ?? ''}`,
        opponentSide,
        2,
      );

      if (priors.length) {
        priorArguments = `\nHow this side has been argued before on this platform (for reference — do not copy):\n${
          priors.map(d => `- [scored ${d.quality}] ${(d.content || '').slice(0, 300)}`).join('\n')
        }`;
      }
    } catch { /* retrieval is optional */ }

    const opponentSide = aiParticipant.side === 'for' ? 'against' : 'for';

    const prompt = `You are debating the topic: "${debate.topic}"

You argue the ${aiParticipant.side.toUpperCase()} side. Your opponent argues ${opponentSide.toUpperCase()}.

This is round ${round} (${roundType}).

Transcript so far:
${transcript}
${priorArguments}

How to argue:
${difficulty.guidance}
${styleGuidance}

Rules:
- Write roughly ${difficulty.wordTarget} words.
- Argue only the ${aiParticipant.side.toUpperCase()} side.
- Respond to what your opponent actually said; do not repeat your earlier points.
- Never attack the person. Attack the reasoning.
- If your opponent made a genuinely strong point, acknowledge it before answering.
- Write the argument only — no preamble, no headings, no "as the ${aiParticipant.side} side".

Evidence honesty — this is critical:
- NEVER invent a statistic, percentage, study, author, institution or year.
- Do not write things like "a Pew study found 60%" or "research from Stanford shows" unless that exact finding is given to you above.
- If you want to appeal to evidence but have none supplied, describe the KIND of evidence that would settle the point ("longitudinal studies tracking usage against wellbeing would be needed here") rather than fabricating a result.
- Reasoning, analogies, counter-examples from widely known public events, and pointing out gaps in your opponent's support are all fair and need no citation.
A fabricated citation is worse than no citation: users are learning from this exchange.`;

    const content = await grokService.generateSmart(prompt, {
        operation: 'ai_opponent',
      systemRole: 'You are a skilled, fair-minded debater. Produce only the argument text.',
    });

    return content.trim();
  }
}

export default new AIOpponentService();
export { DIFFICULTY_PROFILES, STYLE_PROFILES, AI_USERNAME };
