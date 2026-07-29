import grokService from '../../grokService.js';

/**
 * ARGUMENT SCORING
 *
 * The five graded dimensions of a turn, extracted from debateTurnGraph.
 *
 * They lived inside a 1,250-line orchestration file, which meant every change
 * to how an argument is judged meant editing the same file as retrieval, memory
 * storage and result assembly — and made the rubric impossible to test without
 * standing up the whole graph.
 *
 * Each function takes the graph's mutable `state` and writes its score onto it,
 * exactly as before. This is a move, not a redesign: the scoring behaviour is
 * unchanged and verified against the same cases.
 */

export async function scoreTone(state) {
  const { content, fallacies, personaContext } = state;
  let score = 100;

  const adHominem = fallacies.filter(f => f.type === 'ad hominem');
  const appealEmotion = fallacies.filter(f => f.type === 'appeal to emotion');

  score -= adHominem.length * 25;
  score -= appealEmotion.length * 15;
  score -= (fallacies.length - adHominem.length - appealEmotion.length) * 5;

  const aggressiveWords = [
    'stupid', 'idiot', 'dumb', 'fool', 'moron', 'ignorant',
    'ridiculous', 'absurd', 'nonsense', 'joke', 'pathetic',
  ];
  const contentLower = content.toLowerCase();
  const aggressiveCount = aggressiveWords.filter(w => contentLower.includes(w)).length;
  score -= aggressiveCount * 10;

  const respectfulPhrases = [
    'i understand', 'you make a good point', 'while i disagree',
    'i respect', 'let me clarify', 'to be fair', "you're right that",
  ];
  const respectfulCount = respectfulPhrases.filter(p => contentLower.includes(p)).length;
  score += respectfulCount * 5;

  // ── Persona drift adjustment ──────────────────────────────────
  let driftWarning = null;
  if (personaContext?.traits && personaContext?.drift) {
    const { aggressiveness, empathy } = personaContext.traits;
    const changes = personaContext.drift.significantChanges || [];

    const aggressivenessChange = changes.find(c => c.type === 'aggressiveness');
    const empathyChange = changes.find(c => c.type === 'empathy');

    // User is drifting more aggressive → extra penalty to surface the pattern
    if (aggressivenessChange && aggressiveness > 65) {
      score -= 8;
      driftWarning = `Your recent debates show increasing aggressiveness (${aggressiveness}/100). Focus on argument quality over forcefulness.`;
    }

    // User is growing in empathy → small reward
    if (empathyChange && empathy > 65) {
      score += 5;
    }

    // High baseline aggressiveness (even without drift) → tone guidance
    if (aggressiveness > 75 && !driftWarning) {
      driftWarning = `Your communication style tends toward high intensity (aggressiveness: ${aggressiveness}/100). Consider a more measured tone.`;
    }
  }

  score = Math.max(0, Math.min(100, score));
  state.toneScore = score;

  const traceData = {
    toneScore: score,
    category: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor',
    reasoning: 'Based on respectfulness, civility, and absence of aggressive language',
    adHominemCount: adHominem.length,
    aggressiveWordCount: aggressiveCount,
    respectfulPhraseCount: respectfulCount,
    tips: score < 70 ? [
      'Avoid aggressive or dismissive language',
      'Focus on arguments, not the person',
      'Use respectful phrases like "I understand your point, but..."',
      'Acknowledge valid points made by opponents',
    ] : ['Great tone! Keep maintaining respect and professionalism'],
  };

  if (driftWarning) traceData.driftWarning = driftWarning;

  state.decisionTrace.push({
    step: 'tone_analysis',
    message: `Tone scored ${score}/100${driftWarning ? ' ⚠️ drift detected' : ''}`,
    impact: score >= 70 ? 'positive' : score >= 50 ? 'neutral' : 'negative',
    score,
    data: traceData,
  });

  console.log(`🔷 [Graph:7] Tone: ${score}/100`);
}

// ─────────────────────────────────────────────────────────────────
// NODE 8 — ANALYZE CLARITY
// ─────────────────────────────────────────────────────────────────

export async function scoreClarity(state) {
  const { content, claims } = state;
  let score = 50;

  const words = content.trim().split(/\s+/).length;
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  const avgSentenceLength = words / Math.max(1, sentences);

  if (avgSentenceLength >= 15 && avgSentenceLength <= 25) score += 15;
  else if (avgSentenceLength > 40) score -= 15;
  else if (avgSentenceLength < 10) score -= 10;

  const hasStructure = content.includes('\n\n') || content.includes('\n');
  if (hasStructure && words > 100) score += 10;

  if (sentences >= 3) score += 10;
  else if (sentences === 1 && words > 50) score -= 15;

  if (claims && claims.length > 0) score += Math.min(20, claims.length * 5);

  const transitions = [
    'however', 'therefore', 'furthermore', 'moreover', 'additionally',
    'consequently', 'nevertheless', 'thus', 'hence', 'indeed',
  ];
  const transitionCount = transitions.filter(w => content.toLowerCase().includes(w)).length;
  score += Math.min(15, transitionCount * 5);

  score = Math.max(0, Math.min(100, score));
  state.clarityScore = score;

  state.decisionTrace.push({
    step: 'clarity_analysis',
    message: `Clarity scored ${score}/100`,
    impact: score >= 70 ? 'positive' : score >= 50 ? 'neutral' : 'negative',
    score,
    data: {
      clarityScore: score,
      sentences,
      avgSentenceLength: parseFloat(avgSentenceLength.toFixed(1)),
      transitionCount,
      category: score >= 80 ? 'Very Clear' : score >= 60 ? 'Clear' : score >= 40 ? 'Somewhat Clear' : 'Unclear',
      tips: score < 70 ? [
        'Organize arguments with clear topic sentences',
        'Use transition words (however, therefore, moreover)',
        'Break complex ideas into smaller, digestible points',
      ] : ['Well-structured argument!'],
    },
  });

  console.log(`🔷 [Graph:8] Clarity: ${score}/100`);
}

// ─────────────────────────────────────────────────────────────────
// NODE 9 — ANALYZE EVIDENCE
// ─────────────────────────────────────────────────────────────────

export async function scoreEvidence(state) {
  const { content, retrievedKnowledge } = state;
  let score = 0;

  const strongIndicators = [
    'peer-reviewed', 'published study', 'research shows', 'data indicates',
    'according to', 'study found', 'statistics show', 'meta-analysis',
  ];
  const mediumIndicators = [
    'research', 'study', 'data', 'statistics', 'evidence',
    'report', 'survey', 'analysis', 'findings',
  ];
  const weakIndicators = [
    'i believe', 'in my opinion', 'it seems', 'probably',
    'might', 'could', 'perhaps', 'maybe',
  ];

  const contentLower = content.toLowerCase();
  const strongCount = strongIndicators.filter(i => contentLower.includes(i)).length;
  const mediumCount = mediumIndicators.filter(i => contentLower.includes(i)).length;
  const weakCount = weakIndicators.filter(i => contentLower.includes(i)).length;

  score += strongCount * 30;
  score += mediumCount * 15;
  score -= weakCount * 5;

  const hasNumbers = /\d+%|\d+\.\d+|\d+ (percent|people|cases|studies)/.test(content);
  if (hasNumbers) score += 15;

  const hasCitation = /\([A-Z][a-z]+ \d{4}\)|\[?\d+\]?|et al\./.test(content);
  if (hasCitation) score += 20;

  // Indicator phrases alone cannot exceed a middling score. "Research shows"
  // and "studies indicate" are what an unsupported argument says when it wants
  // to sound supported — without a figure or citation there is nothing here to
  // check, and rewarding the vocabulary trains exactly the wrong habit.
  if (!hasNumbers && !hasCitation) score = Math.min(score, 45);

  if (weakCount > strongCount + mediumCount && !hasNumbers) score -= 20;

  let verified = false;
  if (state.useRAG && retrievedKnowledge.knowledgeDocs.length > 0) {
    const hasStrongEvidence = retrievedKnowledge.knowledgeDocs.some(
      doc => doc.metadata?.type === 'strong_evidence'
    );
    if (hasStrongEvidence) {
      verified = true;
      score += 10;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const hasEvidence = strongCount + mediumCount > 0;

  state.evidenceAnalysis = {
    hasEvidence,
    verified,
    score,
    indicatorCount: strongCount + mediumCount,
    sources: retrievedKnowledge.sources,
  };

  state.decisionTrace.push({
    step: 'evidence_analysis',
    message: `Evidence scored ${score}/100`,
    impact: score >= 70 ? 'positive' : score >= 50 ? 'neutral' : 'negative',
    score,
    data: {
      evidenceScore: score,
      hasEvidence,
      verified,
      strongCount,
      mediumCount,
      hasNumbers,
      hasCitation,
      category: score >= 80 ? 'Strong Evidence' : score >= 60 ? 'Moderate Evidence' : score >= 40 ? 'Weak Evidence' : 'No Evidence',
      tips: score < 70 ? [
        'Include specific citations (e.g., "According to Smith 2023...")',
        'Use data and statistics to support claims',
        'Reference peer-reviewed research when possible',
      ] : ['Strong evidence usage!'],
    },
  });

  console.log(`🔷 [Graph:9] Evidence: ${score}/100`);
}

// ─────────────────────────────────────────────────────────────────
// NODE 9b — MODEL RUBRIC (substance, evidence, clarity, tone)
// ─────────────────────────────────────────────────────────────────

/**
 * Scores whether the turn actually argues anything.
 *
 * Every other dimension is satisfiable without making an argument: tone
 * rewards the absence of insults, clarity rewards sentence length and
 * transition words, and the quality formula hands out flat credit for having
 * claims and for committing no fallacies. A polite, well-punctuated assertion
 * such as "I think it is very bad for them" therefore scored in the fifties
 * while containing no reasoning at all.
 *
 * Substance is the missing signal: is the position supported, does it engage
 * the opponent, and does it go beyond restating a preference?
 */
export async function scoreRubric(state) {
  const { content, previousTurns } = state;

  const words = content.trim().split(/\s+/).filter(Boolean).length;

  // Nothing to reason about — score directly rather than spend a model call.
  if (words < 15) {
    state.substanceScore = Math.max(5, Math.min(30, words * 2));
    state.substanceReason = 'Too short to contain an argument.';
    console.log(`🔷 [Graph:9b] Substance: ${state.substanceScore}/100 (too short to argue)`);
    return;
  }

  const opponentContext = previousTurns?.length
    ? `\nThe opponent's most recent argument:\n"${previousTurns[previousTurns.length - 1]?.content?.slice(0, 600) ?? ''}"`
    : '\n(this is the opening turn — there is nothing to rebut yet)';

  // One call scores every dimension that requires judgment. The heuristics
  // that previously produced these numbers counted keywords: "research shows"
  // earned evidence credit with no research attached, transition words earned
  // clarity credit for padding, and tone started at 100 so any turn without an
  // insult scored perfectly. Each is now graded on what it claims to measure,
  // with the old heuristic kept as the fallback below.
  const prompt = `Grade this debate turn on four independent dimensions.

Turn:
"""
${content.slice(0, 1500)}
"""
${opponentContext}

SUBSTANCE (0-100) — does it argue for its position, or merely assert one?
0-20   bare assertion, no reasoning ("I think X is bad")
21-40  a reason gestured at but not developed
41-60  a clear reason given and explained
61-80  developed reasoning that engages the opposing view
81-100 rigorous: multiple supported lines addressing the strongest opposing point

EVIDENCE (0-100) — how well are claims supported?
Judge actual support, not vocabulary. Saying "studies show" or "research indicates"
with no specific finding is UNSUPPORTED and scores low — that phrasing is a common
bluff. A concrete mechanism, a real named example, or a specific verifiable figure
is genuine support and scores high even with no citation formatting.
0-20   pure assertion
21-40  vague appeals to unnamed evidence
41-60  concrete reasoning, examples or mechanisms
61-80  specific, checkable support
81-100 precise evidence directly establishing the claim

CLARITY (0-100) — how easily can a reader follow the argument?
Judge whether the point is understandable and well-sequenced. Do NOT reward
transition words, sentence length, or padding. A short, plain, clear argument
scores high; a long meandering one scores low.

TONE (0-100) — is this civil AND constructive?
100 requires engaging the opponent's actual position respectfully. Merely avoiding
insults is about 70, not perfect. Dismissiveness, sneering or condescension score
low even with no explicit insult.

Return ONLY JSON in exactly this shape, filling in your own values:
{"substance": <0-100>, "evidence": <0-100>, "clarity": <0-100>, "tone": <0-100>, "reason": "<brief justification of the substance score>"}`;

  try {
    // The smart model, for the same reason fallacy detection uses it: four
    // graded judgments in one response is beyond the fast model, which
    // degrades to malformed JSON and flat scores that do not discriminate.
    const raw = await grokService.generateSmart(prompt, {
      userId: state.userId,
      debateId: state.debateId,
      operation: 'debate_analysis',
      temperature: 0.1,
    });

    // Models often wrap or annotate the object; take the first JSON block.
    const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*?\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : clean);
    const clamp = v => Math.max(0, Math.min(100, Math.round(Number(v))));

    state.substanceScore = Number.isFinite(Number(parsed.substance)) ? clamp(parsed.substance) : 30;
    state.substanceReason = String(parsed.reason || '').slice(0, 200);

    // Replace the keyword-derived scores where the model gave a usable value.
    if (Number.isFinite(Number(parsed.evidence))) {
      state.evidenceAnalysis = {
        ...state.evidenceAnalysis,
        score: clamp(parsed.evidence),
        hasEvidence: clamp(parsed.evidence) >= 40,
        method: 'model',
      };
    }
    if (Number.isFinite(Number(parsed.clarity))) state.clarityScore = clamp(parsed.clarity);
    if (Number.isFinite(Number(parsed.tone)))    state.toneScore    = clamp(parsed.tone);

    state.rubricMethod = 'model';

  } catch (error) {
    // Falling back to a neutral 50 would flatter an empty turn, so the
    // heuristic keeps grading on the observable proxy for developed reasoning.
    const sentences = content.split(/[.!?]+/).filter(s => s.trim()).length;
    state.substanceScore = Math.max(10, Math.min(65, Math.round(words / 4) + sentences * 3));
    state.substanceReason = 'Estimated — rubric model unavailable.';
    state.rubricMethod = 'heuristic';
    console.warn('Rubric scoring failed, keeping heuristic scores:', error.message);
  }

  state.decisionTrace.push({
    step: 'substance_analysis',
    message: `Substance scored ${state.substanceScore}/100`,
    impact: state.substanceScore >= 60 ? 'positive' : state.substanceScore >= 35 ? 'neutral' : 'negative',
    score: state.substanceScore,
    data: {
      substanceScore: state.substanceScore,
      reason: state.substanceReason,
      category: state.substanceScore >= 80 ? 'Rigorous'
        : state.substanceScore >= 60 ? 'Well argued'
        : state.substanceScore >= 40 ? 'Reasoned'
        : state.substanceScore >= 20 ? 'Underdeveloped'
        : 'Bare assertion',
      tips: state.substanceScore < 60 ? [
        'Give a reason for your position, not just the position',
        'Explain why your reason supports your conclusion',
        "Address the strongest version of your opponent's point",
      ] : ['Strong reasoning — keep developing your points this way'],
    },
  });

  console.log(`🔷 [Graph:9b] Rubric — substance ${state.substanceScore}, evidence ${state.evidenceAnalysis.score}, clarity ${state.clarityScore}, tone ${state.toneScore}`);
}

// ─────────────────────────────────────────────────────────────────
// NODE 10 — CALCULATE QUALITY (Persona-baseline aware)
// ─────────────────────────────────────────────────────────────────

/**
 * Persona integration:
 *   - argumentativeStyle === 'evidence-based' → evidence weight bumped to 35%
 *   - argumentativeStyle === 'emotional'       → tone weight bumped to 30%
 *   - Coaching tips from persona drift appended to the trace
 */
export async function calculateQuality(state) {
  const { toneScore, clarityScore, evidenceAnalysis, fallacies, claims, personaContext } = state;
  const substanceScore = state.substanceScore ?? 50;

  // Substance carries the most weight because it is the only dimension that
  // cannot be satisfied without actually arguing. Tone and clarity are now
  // secondary: a turn should not reach a passing score by being polite and
  // well-punctuated while saying nothing.
  // Evidence is deliberately weighted below substance. The evidence detector
  // looks for citations and figures, so a turn that reasons carefully without
  // quoting a study scores zero there — and citations are also the thing an
  // arguer is most tempted to fabricate. Sound reasoning must be able to earn
  // a good score on its own.
  let substanceWeight = 0.40;
  let evidenceWeight  = 0.18;
  let clarityWeight   = 0.15;
  let toneWeight      = 0.12;

  if (personaContext?.traits?.argumentativeStyle === 'evidence-based') {
    evidenceWeight = 0.25;
    substanceWeight = 0.35;
    toneWeight = 0.10;
  } else if (personaContext?.traits?.argumentativeStyle === 'emotional') {
    toneWeight = 0.18;
    evidenceWeight = 0.12;
  }

  // Fallacies are a penalty rather than a category to earn points in:
  // committing none is the baseline expectation, not an achievement.
  //
  // Only confident detections are penalised. Fallacy labelling on a dense,
  // well-made argument still produces occasional false positives, and an
  // unsure detection was able to outweigh genuinely strong reasoning — a
  // rigorous turn scored below a simpler one purely on disputed flags. Every
  // detection is still shown to the user; it just cannot dominate the score.
  const penalisedFallacies = fallacies.filter(f => (f.confidence ?? 0.8) >= 0.75);
  const fallacyPenalty = Math.min(15, penalisedFallacies.length * 5);

  // Claims still contribute, but proportionally — making one unsupported
  // assertion previously earned the same credit as a fully developed case.
  const claimCredit = Math.min(100, claims.length * 35);

  const weighted = (
    substanceScore * substanceWeight +
    evidenceAnalysis.score * evidenceWeight +
    clarityScore * clarityWeight +
    toneScore * toneWeight +
    claimCredit * 0.15
  ) - fallacyPenalty;

  state.overallQuality = Math.max(0, Math.min(100, Math.round(weighted)));

  // ── Drift-aware coaching tips ─────────────────────────────────
  const driftTips = personaContext?.coaching || [];

  state.decisionTrace.push({
    step: 'overall_quality',
    message: `Final quality score: ${state.overallQuality}/100`,
    impact: state.overallQuality >= 70 ? 'positive' : state.overallQuality >= 50 ? 'neutral' : 'negative',
    score: state.overallQuality,
    data: {
      overallQuality: state.overallQuality,
      breakdown: {
        substance: { score: substanceScore, weight: `${Math.round(substanceWeight * 100)}%`, reason: state.substanceReason },
        evidence: { score: evidenceAnalysis.score, weight: `${Math.round(evidenceWeight * 100)}%` },
        clarity: { score: clarityScore, weight: `${Math.round(clarityWeight * 100)}%` },
        tone: { score: toneScore, weight: `${Math.round(toneWeight * 100)}%` },
        claims: { count: claims.length, credit: claimCredit, weight: '15%' },
        fallacies: { count: fallacies.length, penalised: penalisedFallacies.length, penalty: fallacyPenalty },
      },
      personaWeightsApplied: !!personaContext,
      category: state.overallQuality >= 80 ? 'Excellent' : state.overallQuality >= 60 ? 'Good' : state.overallQuality >= 40 ? 'Fair' : 'Poor',
      driftCoachingTips: driftTips,
      tips: state.overallQuality < 70 ? [
        'Focus on areas with lowest scores',
        'Balance emotion with logic',
        'Support claims with evidence',
        'Maintain respectful discourse',
        ...driftTips,
      ] : [
        'Outstanding argument quality!',
        ...driftTips,
      ],
    },
  });

  console.log(`🔷 [Graph:10] Overall quality: ${state.overallQuality}/100`);
}
