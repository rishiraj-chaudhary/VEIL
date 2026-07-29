/**
 * DEBATE THEORY — static reference, inlined.
 *
 * This was previously an 8-document vector store queried on every turn: embed
 * the turn, run Atlas $vectorSearch, rerank with BM25, then rerank again with an
 * LLM — to select two or three paragraphs from a corpus of about two thousand
 * characters.
 *
 * Retrieval exists to select from a corpus too large to include. This corpus
 * fits in a prompt several times over, and its contents are standard
 * argumentation theory that any competent language model already knows. Turn
 * analysis was measured producing correct fallacy detection with retrieval
 * disabled entirely, which is the test that settles it.
 *
 * The vector store still exists and is still used — for debate memory, which is
 * this platform's own data and genuinely cannot be known in advance.
 */

export const FALLACY_REFERENCE = `
Ad hominem — attacking the person rather than their argument.
Straw man — misrepresenting an argument to make it easier to attack.
False dilemma — presenting two options when more exist.
Appeal to emotion — substituting emotional pressure for reasoning.
Hasty generalisation — drawing a broad conclusion from thin evidence.
Slippery slope — asserting a chain of consequences without justifying the links.
Circular reasoning — assuming the conclusion within the premises.
Appeal to authority — citing a source that is irrelevant, unqualified, or the sole basis for an unrelated conclusion. Citing genuinely relevant expertise is not this fallacy.
`.trim();

export const EVIDENCE_REFERENCE = `
Strong support: peer-reviewed research, statistics from a named credible source,
expert testimony within the expert's field, reproducible results, primary sources,
and concrete verifiable examples.

Weak support: anecdote, uncited assertion, appeals to common sense without data,
cherry-picked cases, outdated figures, and phrases such as "studies show" or
"research indicates" with no specific finding attached — that phrasing is what an
unsupported argument uses when it wants to sound supported.
`.trim();

export const REBUTTAL_REFERENCE = `
An effective rebuttal addresses the strongest version of the opposing argument,
supplies counter-evidence or a competing explanation, identifies a specific
logical gap, and concedes whatever is genuinely correct before answering it.
`.trim();

/** Only the sections a given task needs, to keep prompts tight. */
export const theoryFor = (...sections) => sections
  .map(section => ({
    fallacies: FALLACY_REFERENCE,
    evidence: EVIDENCE_REFERENCE,
    rebuttal: REBUTTAL_REFERENCE,
  }[section]))
  .filter(Boolean)
  .join('\n\n');

export default { FALLACY_REFERENCE, EVIDENCE_REFERENCE, REBUTTAL_REFERENCE, theoryFor };
