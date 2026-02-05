/**
 * KNOWLEDGE BASE EXPANSION - FIXED VERSION
 * Direct MongoDB insertion
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// Import the KnowledgeItem model directly
const KnowledgeItemSchema = new mongoose.Schema({
  title: { type: String, required: true, unique: true },
  content: { type: String, required: true },
  category: { type: String, required: true },
  type: String,
  tags: [String],
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

const KnowledgeItem = mongoose.model('KnowledgeItem', KnowledgeItemSchema);

const newKnowledge = [
  // ========== MORE FALLACIES ==========
  {
    title: "Bandwagon Fallacy",
    category: "fallacy",
    type: "bandwagon",
    content: "The bandwagon fallacy assumes something is true or good because many people believe it or do it. Popular opinion does not equal truth. Example: 'Everyone is buying this product, so it must be good.' Just because something is popular doesn't make it correct or beneficial.",
    tags: ["fallacy", "popularity", "logic"],
    metadata: { category: "fallacy", type: "bandwagon" }
  },
  {
    title: "Tu Quoque (You Too)",
    category: "fallacy",
    type: "tu_quoque",
    content: "Tu quoque deflects criticism by accusing the critic of the same behavior. This doesn't address whether the criticism is valid. Example: 'You can't criticize my spending when you spend money too.' The critic's behavior doesn't invalidate their point.",
    tags: ["fallacy", "deflection", "logic"],
    metadata: { category: "fallacy", type: "tu_quoque" }
  },
  {
    title: "Genetic Fallacy",
    category: "fallacy",
    type: "genetic",
    content: "The genetic fallacy judges an argument based on its origin rather than its merit. Example: 'This idea came from that political party, so it must be wrong.' Ideas should be evaluated on their own merits, not their source.",
    tags: ["fallacy", "origin", "logic"],
    metadata: { category: "fallacy", type: "genetic" }
  },
  {
    title: "Composition Fallacy",
    category: "fallacy",
    type: "composition",
    content: "The composition fallacy assumes what's true of parts is true of the whole. Example: 'Each player is excellent, so the team must be excellent.' Individual strengths don't automatically create collective success.",
    tags: ["fallacy", "whole-part", "logic"],
    metadata: { category: "fallacy", type: "composition" }
  },
  {
    title: "No True Scotsman",
    category: "fallacy",
    type: "no_true_scotsman",
    content: "This fallacy dismisses counterexamples by arbitrarily redefining terms. Example: 'No true American would support that.' - 'But John does.' - 'Well, he's not a true American then.' This prevents the claim from being falsifiable.",
    tags: ["fallacy", "definition", "logic"],
    metadata: { category: "fallacy", type: "no_true_scotsman" }
  },

  // ========== EVIDENCE TYPES ==========
  {
    title: "Statistical Evidence",
    category: "evidence",
    type: "statistical",
    content: "Statistical evidence includes quantitative data with proper context: sample sizes, confidence intervals, p-values, margins of error, and methodology. Strong statistical evidence comes from peer-reviewed studies with large sample sizes and replication.",
    tags: ["evidence", "statistics", "research", "data"],
    metadata: { category: "evidence", type: "statistical", strength: "high" }
  },
  {
    title: "Anecdotal Evidence",
    category: "evidence",
    type: "anecdotal",
    content: "Anecdotal evidence consists of personal stories or isolated examples. While compelling, it's weak evidence as it may not represent broader patterns. Example: 'My uncle smoked and lived to 90' doesn't refute smoking risks. Anecdotes can illustrate but shouldn't prove.",
    tags: ["evidence", "personal", "weak"],
    metadata: { category: "evidence", type: "anecdotal", strength: "low" }
  },
  {
    title: "Expert Testimony",
    category: "evidence",
    type: "expert",
    content: "Expert testimony is strong when the expert has relevant credentials, no conflicts of interest, and consensus support in their field. Verify: Are they qualified? Current in their field? Unbiased? Do other experts agree?",
    tags: ["evidence", "authority", "expert"],
    metadata: { category: "evidence", type: "expert", strength: "medium-high" }
  },
  {
    title: "Empirical Evidence",
    category: "evidence",
    type: "empirical",
    content: "Empirical evidence comes from direct observation or experimentation. It's strongest when: methods are transparent, results are reproducible, confounding variables are controlled, and findings are peer-reviewed. Scientific method produces empirical evidence.",
    tags: ["evidence", "science", "observation", "experiment"],
    metadata: { category: "evidence", type: "empirical", strength: "very-high" }
  },
  {
    title: "Historical Evidence",
    category: "evidence",
    type: "historical",
    content: "Historical evidence uses past events to support arguments. Strong historical evidence: uses primary sources, considers context, acknowledges bias, and identifies relevant parallels. Be cautious of false equivalencies between different eras.",
    tags: ["evidence", "history", "precedent"],
    metadata: { category: "evidence", type: "historical", strength: "medium" }
  },

  // ========== DEBATE TECHNIQUES ==========
  {
    title: "Socratic Method",
    category: "technique",
    type: "socratic",
    content: "The Socratic method uses questions to examine assumptions and expose contradictions. Instead of making claims, ask probing questions that guide opponents to recognize flaws in their reasoning. Effective for revealing unstated premises.",
    tags: ["technique", "questioning", "logic"],
    metadata: { category: "technique", type: "socratic", difficulty: "medium" }
  },
  {
    title: "Steel Manning",
    category: "technique",
    type: "steel_man",
    content: "Steel manning is presenting the strongest version of your opponent's argument before refuting it. This shows good faith, builds credibility, and makes your rebuttal more convincing. Opposite of straw manning.",
    tags: ["technique", "fairness", "rebuttal"],
    metadata: { category: "technique", type: "steel_man", difficulty: "medium" }
  },
  {
    title: "Burden of Proof",
    category: "technique",
    type: "burden_of_proof",
    content: "The burden of proof lies with the person making a positive claim. 'You can't prove it's false' is not evidence something is true. Extraordinary claims require extraordinary evidence. The default position is skepticism until evidence is provided.",
    tags: ["technique", "logic", "proof"],
    metadata: { category: "technique", type: "burden_of_proof", difficulty: "basic" }
  },
  {
    title: "Reductio ad Absurdum",
    category: "technique",
    type: "reductio",
    content: "Reductio ad absurdum proves a statement false by showing its logical conclusion is absurd. Take the opponent's premise to its logical extreme to reveal its flaws. Effective but use carefully to avoid slippery slope fallacy.",
    tags: ["technique", "logic", "proof"],
    metadata: { category: "technique", type: "reductio", difficulty: "advanced" }
  },
  {
    title: "Framing and Reframing",
    category: "technique",
    type: "framing",
    content: "Framing presents information in a context that influences perception. Reframing challenges the opponent's framework and offers an alternative perspective. Example: 'Not a tax increase, an investment in infrastructure.' Be ethical - don't mislead.",
    tags: ["technique", "rhetoric", "persuasion"],
    metadata: { category: "technique", type: "framing", difficulty: "medium" }
  },

  // ========== LOGICAL PRINCIPLES ==========
  {
    title: "Modus Ponens",
    category: "logic",
    type: "modus_ponens",
    content: "Modus ponens is a valid argument form: If P then Q. P is true. Therefore Q is true. Example: If it rains, the ground gets wet. It rained. Therefore, the ground is wet. This is logically sound.",
    tags: ["logic", "reasoning", "validity"],
    metadata: { category: "logic", type: "modus_ponens" }
  },
  {
    title: "Modus Tollens",
    category: "logic",
    type: "modus_tollens",
    content: "Modus tollens: If P then Q. Q is false. Therefore P is false. Example: If it rained, the ground would be wet. The ground is not wet. Therefore, it did not rain. Valid logical form for proving negatives.",
    tags: ["logic", "reasoning", "validity"],
    metadata: { category: "logic", type: "modus_tollens" }
  },
  {
    title: "Logical Consistency",
    category: "logic",
    type: "consistency",
    content: "Arguments must be internally consistent - they cannot contain contradictions. If premises contradict each other or the conclusion contradicts a premise, the argument fails. Check for: mutual exclusivity, timing contradictions, and value conflicts.",
    tags: ["logic", "consistency", "validity"],
    metadata: { category: "logic", type: "consistency" }
  },
  {
    title: "Occam's Razor",
    category: "logic",
    type: "occams_razor",
    content: "Occam's Razor: Among competing explanations, the simplest is usually correct. Prefer explanations that make fewer assumptions. Doesn't mean the simplest is always right, but it's the logical starting point. Complexity requires justification.",
    tags: ["logic", "simplicity", "reasoning"],
    metadata: { category: "logic", type: "occams_razor" }
  },
  {
    title: "Falsifiability",
    category: "logic",
    type: "falsifiability",
    content: "A claim must be falsifiable to be meaningful. If no evidence could possibly disprove it, it's not a scientific claim. Example: 'God exists' is unfalsifiable. 'This drug reduces symptoms by 50%' is falsifiable. Good arguments make falsifiable predictions.",
    tags: ["logic", "science", "testing"],
    metadata: { category: "logic", type: "falsifiability" }
  },

  // ========== RHETORICAL DEVICES ==========
  {
    title: "Ethos, Pathos, Logos",
    category: "rhetoric",
    type: "appeals",
    content: "Three modes of persuasion: Ethos (credibility/character), Pathos (emotion), Logos (logic/reason). Strong arguments use all three appropriately. Over-reliance on pathos weakens arguments. Logos should dominate in formal debate.",
    tags: ["rhetoric", "persuasion", "aristotle"],
    metadata: { category: "rhetoric", type: "appeals" }
  },
  {
    title: "Analogies and Metaphors",
    category: "rhetoric",
    type: "analogy",
    content: "Analogies compare unfamiliar concepts to familiar ones. Strong analogies: identify genuine similarities, acknowledge limits, don't prove (only illustrate). Weak analogies: ignore relevant differences, oversimplify, or substitute for evidence.",
    tags: ["rhetoric", "comparison", "explanation"],
    metadata: { category: "rhetoric", type: "analogy" }
  },
  {
    title: "Concession and Refutation",
    category: "rhetoric",
    type: "concession",
    content: "Effective technique: Concede minor points to strengthen major ones. Format: 'While X may be true, Y is more significant because...' This shows fairness, builds credibility, and makes your core argument stronger by comparison.",
    tags: ["rhetoric", "strategy", "credibility"],
    metadata: { category: "rhetoric", type: "concession" }
  },

  // ========== COMMON CONCEPTS ==========
  {
    title: "Correlation vs Causation",
    category: "concept",
    type: "correlation_causation",
    content: "Correlation means two things occur together. Causation means one causes the other. Correlation does not prove causation. Example: Ice cream sales and drowning both increase in summer, but ice cream doesn't cause drowning. Consider: coincidence, common cause, reverse causation.",
    tags: ["concept", "statistics", "logic"],
    metadata: { category: "concept", type: "correlation_causation" }
  },
  {
    title: "Confirmation Bias",
    category: "concept",
    type: "confirmation_bias",
    content: "Confirmation bias is seeking information that confirms existing beliefs while ignoring contradictory evidence. Combat it by: actively seeking opposing views, considering alternative explanations, and testing your assumptions. Good debaters acknowledge this bias.",
    tags: ["concept", "bias", "psychology"],
    metadata: { category: "concept", type: "confirmation_bias" }
  }
];

async function expandKnowledge() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    let added = 0;
    let skipped = 0;

    for (const item of newKnowledge) {
      try {
        await KnowledgeItem.create(item);
        console.log(`✅ Added: ${item.title}`);
        added++;
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⏭️  Skipped (exists): ${item.title}`);
          skipped++;
        } else {
          console.error(`❌ Error adding ${item.title}:`, error.message);
        }
      }
    }

    console.log(`\n🎉 Knowledge base expansion complete!`);
    console.log(`   Added: ${added} items`);
    console.log(`   Skipped: ${skipped} items`);

    // Count total
    const total = await KnowledgeItem.countDocuments();
    console.log(`   Total in database: ${total} items`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

expandKnowledge();