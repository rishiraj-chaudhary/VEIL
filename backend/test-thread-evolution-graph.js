/**
 * TEST: ThreadEvolutionGraph — Step 13
 * Run: node test-thread-evolution-graph.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

await import('./src/models/user.js');
await import('./src/models/community.js');
await import('./src/models/post.js');
await import('./src/models/comment.js');

await mongoose.connect(process.env.MONGODB_URI);
console.log('🔌 Connected\n');

const { default: threadEvolutionGraph } = await import('./src/services/graph/threadEvolutionGraph.js');
const Post    = (await import('./src/models/post.js')).default;
const Comment = (await import('./src/models/comment.js')).default;

const log  = (label, data) => { console.log(`\n${'─'.repeat(50)}\n✅ ${label}`); console.log(JSON.stringify(data, null, 2)); };
const fail = (label, err)  => { console.log(`\n${'─'.repeat(50)}\n❌ ${label}: ${err?.message || err}`); };

// ── Find a post with comments ─────────────────────────────────────────────────
const posts = await Post.find({ isDeleted: false }).lean();
let targetPost = null;

for (const p of posts) {
  const count = await Comment.countDocuments({ post: p._id, isDeleted: false });
  if (count >= 3) { targetPost = p; break; }
}

if (!targetPost) {
  console.log('⚠️  No posts with comments found. Creating test data...');

  // Create minimal test data
  const User      = (await import('./src/models/user.js')).default;
  const Community = (await import('./src/models/community.js')).default;

  const user = await User.findOne();
  const comm = await Community.findOne();

  if (!user || !comm) {
    console.log('❌ Need at least 1 user and 1 community in DB');
    await mongoose.disconnect();
    process.exit(0);
  }

  targetPost = await Post.create({
    title: 'Test post for ThreadEvolutionGraph',
    content: 'Is AI going to replace developers?',
    author: user._id,
    community: comm._id,
  });

  const commentTexts = [
    'AI is definitely going to change things dramatically.',
    'I disagree — AI is a tool, not a replacement.',
    'Have you seen the latest GPT-4 benchmarks though?',
    'This is exactly the kind of alarmist thinking that slows progress.',
    'Actually the data shows mixed results on developer productivity.',
    'We should focus on how to adapt rather than fear the change.',
    'Off topic but has anyone tried Cursor IDE? Game changer.',
    'Back to the point — junior devs will be most affected.',
    'That is a valid concern but also a historically common one.',
    'AI or not, I just want better tooling.',
  ];

  for (let i = 0; i < commentTexts.length; i++) {
    await Comment.create({
      content: commentTexts[i],
      author: user._id,
      post: targetPost._id,
      depth: 0,
    });
  }
  targetPost.commentCount = commentTexts.length;
  await targetPost.save();
  console.log(`✅ Created test post with ${commentTexts.length} comments`);
}

const postId = targetPost._id;
console.log(`\n📄 Testing with post: "${targetPost.title?.slice(0, 60)}" (${postId})`);
const commentCount = await Comment.countDocuments({ post: postId, isDeleted: false });
console.log(`💬 Comments in thread: ${commentCount}`);

// ── TEST 1: Full run ──────────────────────────────────────────────────────────
console.log('\n🧪 TEST 1: Full graph run...');
try {
  const result = await threadEvolutionGraph.run(postId, { force: true });
  log('Graph result shape', {
    healthScore:         result.healthScore,
    healthLabel:         result.healthLabel,
    hasSentimentArc:     !!result.sentimentArc,
    hasTopicDrift:       !!result.topicDrift,
    turningPointCount:   result.turningPoints?.length ?? 0,
    dominantVoiceCount:  result.dominantVoices?.length ?? 0,
    commentCountAtAnalysis: result.commentCountAtAnalysis,
  });
} catch (e) { fail('TEST 1', e); }

// ── TEST 2: Health score is a number 0–100 ────────────────────────────────────
console.log('\n🧪 TEST 2: Health score validity...');
try {
  const result = await threadEvolutionGraph.run(postId);
  const valid = typeof result.healthScore === 'number' && result.healthScore >= 0 && result.healthScore <= 100;
  if (valid) {
    log('Health score valid ✅', { score: result.healthScore, label: result.healthLabel, breakdown: result.scoreBreakdown });
  } else {
    fail('TEST 2', new Error(`Invalid score: ${result.healthScore}`));
  }
} catch (e) { fail('TEST 2', e); }

// ── TEST 3: Sentiment arc has all 3 phases ────────────────────────────────────
console.log('\n🧪 TEST 3: Sentiment arc completeness...');
try {
  const result = await threadEvolutionGraph.run(postId);
  const arc = result.sentimentArc;
  const valid = arc && arc.early && arc.middle && arc.late && arc.arc;
  if (valid) {
    log('Sentiment arc ✅', arc);
  } else {
    fail('TEST 3', new Error('Missing sentiment arc phases'));
  }
} catch (e) { fail('TEST 3', e); }

// ── TEST 4: Topic drift detected ─────────────────────────────────────────────
console.log('\n🧪 TEST 4: Topic drift...');
try {
  const result = await threadEvolutionGraph.run(postId);
  const drift = result.topicDrift;
  log('Topic drift ✅', {
    onTopic:    drift?.onTopic,
    driftScore: drift?.driftScore,
    driftedTo:  drift?.driftedTo,
    summary:    drift?.driftSummary,
  });
} catch (e) { fail('TEST 4', e); }

// ── TEST 5: Persisted to Post ─────────────────────────────────────────────────
console.log('\n🧪 TEST 5: Persisted to Post model...');
try {
  await threadEvolutionGraph.run(postId, { force: true });
  const fromDB = await Post.findById(postId).select('threadAnalysis').lean();
  const stored = fromDB?.threadAnalysis;
  if (stored?.healthScore !== null && stored?.analysedAt) {
    log('Persisted ✅', {
      healthScore: stored.healthScore,
      healthLabel: stored.healthLabel,
      analysedAt:  stored.analysedAt,
      commentCountAtAnalysis: stored.commentCountAtAnalysis,
    });
  } else {
    fail('TEST 5', new Error('threadAnalysis not persisted'));
  }
} catch (e) { fail('TEST 5', e); }

// ── TEST 6: Cache works (no re-analysis under threshold) ─────────────────────
console.log('\n🧪 TEST 6: Cache behaviour...');
try {
  const start = Date.now();
  const result = await threadEvolutionGraph.run(postId); // should use cache
  const elapsed = Date.now() - start;
  log('Cache hit ✅ (fast response)', {
    elapsed: `${elapsed}ms`,
    note: elapsed < 500 ? 'Returned from cache' : 'May have re-analysed',
    healthScore: result.healthScore,
  });
} catch (e) { fail('TEST 6', e); }

await mongoose.disconnect();
console.log('\n🔌 Done');