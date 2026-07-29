import mongoose from 'mongoose';

/**
 * A single day's argument practice.
 *
 * Debates are episodic: you finish one and there is no reason to return
 * tomorrow. A drill is the small, repeatable unit that gives the product a
 * daily loop — one prompt, one argument, scored immediately.
 *
 * `day` is stored as a YYYY-MM-DD string rather than a Date so "one per day"
 * is enforceable by a unique index without timezone arithmetic at query time.
 */
const drillSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  day: { type: String, required: true },

  prompt:      { type: String, required: true },
  promptId:    { type: String, default: null },
  skill:       { type: String, default: 'general' },

  response:    { type: String, default: null },
  wordCount:   { type: Number, default: 0 },

  scores: {
    overall:   { type: Number, default: null },
    substance: { type: Number, default: null },
    evidence:  { type: Number, default: null },
    clarity:   { type: Number, default: null },
    tone:      { type: Number, default: null },
  },

  feedback:  { type: String, default: null },
  fallacies: { type: [String], default: [] },

  completedAt: { type: Date, default: null },
}, { timestamps: true });

// One drill per user per day — the whole point of a daily habit.
drillSchema.index({ user: 1, day: 1 }, { unique: true });
drillSchema.index({ user: 1, completedAt: -1 });

const Drill = mongoose.models.Drill || mongoose.model('Drill', drillSchema);

export default Drill;
