/**
 * TEST: FeedRankingGraph — Step 12
 * Run: node test-feed-ranking-graph.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

await import('./src/models/User.js');
await import('./src/models/post.js');
await import('./src/models/community.js');
await import('./src/models/Debate.js');
await import('./src/models/UserPerformance.js');
await import('./src/models/PersonaSnapshot.js');

await mongoose.connect(process.env.MONGODB_URI);
console.log('🔌 Connected\n');

const { default: feedRankingGraph } = await import('./src/services/graph/feedRankingGraph.js');
const Post = (await import('./src/models/post.js')).default;
const User = (await import('./src/models/User.js')).default;

const log = (label, data) => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${label}`);
  console.log(JSON.stringify(data, null, 2));
};

const fail = (label, err) => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`❌ ${label}: ${err?.message || err}`);
};

// ── Find test users ───────────────────────────────────────────────────────────
const users = await User.find().limit(2).lean();
if (users.length === 0) {
  console.log('⚠️  No users found');
  await mongoose.disconnect();
  process.exit(0);
}

const userId = users[0]._id;
console.log(`👤 Testing with user: ${users[0].username} (${userId})`);

const postCount = await Post.countDocuments({ isDeleted: false });
console.log(`📄 Total posts in DB: ${postCount}`);

// ── TEST 1: Full feed run ─────────────────────────────────────────────────────
console.log('\n🧪 TEST 1: Full feed run...');
try {
  const result = await feedRankingGraph.run(userId, { limit: 20 });
  log('Feed result shape', {
    feedLength:  result.feed.length,
    ranked:      result.feed.length > 0,
    topPost:     result.feed[0] ? {
      title:       result.feed[0].title,
      intentType:  result.feed[0].intentType,
      scores:      result.feed[0]._rankScores,
      why:         result.feed[0]._why,
    } : null,
  });
} catch (e) { fail('TEST 1', e); }

// ── TEST 2: Score components present ─────────────────────────────────────────
console.log('\n🧪 TEST 2: Score components present on all posts...');
try {
  const result = await feedRankingGraph.run(userId, { limit: 5 });
  const required = ['intent', 'perception', 'community', 'engagement', 'recency', 'final'];
  let allPresent = true;

  for (const post of result.feed) {
    const missing = required.filter(k => post._rankScores?.[k] == null);
    if (missing.length > 0) {
      console.log(`⚠️  Post "${post.title?.slice(0, 40)}" missing scores: ${missing.join(', ')}`);
      allPresent = false;
    }
  }

  if (allPresent && result.feed.length > 0) {
    log('All score components present ✅', result.feed.slice(0, 3).map(p => ({
      title:  p.title?.slice(0, 50),
      scores: p._rankScores,
    })));
  } else if (result.feed.length === 0) {
    console.log('⚠️  Empty feed — not enough posts in DB yet');
  }
} catch (e) { fail('TEST 2', e); }

// ── TEST 3: "Why am I seeing this" explanations ───────────────────────────────
console.log('\n🧪 TEST 3: Why explanations attached...');
try {
  const result = await feedRankingGraph.run(userId, { limit: 10 });
  const withWhy    = result.feed.filter(p => p._why && p._why.length > 0);
  const withoutWhy = result.feed.filter(p => !p._why);

  log('Why explanations', {
    total:      result.feed.length,
    withWhy:    withWhy.length,
    withoutWhy: withoutWhy.length,
    samples:    withWhy.slice(0, 3).map(p => ({
      title: p.title?.slice(0, 50),
      why:   p._why,
    })),
  });
} catch (e) { fail('TEST 3', e); }

// ── TEST 4: Intent classification persisted ───────────────────────────────────
console.log('\n🧪 TEST 4: Intent classification persisted to Post model...');
try {
  const result = await feedRankingGraph.run(userId, { limit: 10 });

  // Small wait for async DB writes
  await new Promise(r => setTimeout(r, 4000)); // wait for async intent writes

  if (result.feed.length > 0) {
    const sampleId = result.feed[0]._id;
    const fromDB = await Post.findById(sampleId)
      .select('title intentType intentConfidence intentClassifiedAt')
      .lean();

    log('Intent persisted to DB ✅', fromDB);
  } else {
    console.log('⚠️  No posts in feed to check');
  }
} catch (e) { fail('TEST 4', e); }

// ── TEST 5: Feed ordering — higher scored posts come first ────────────────────
console.log('\n🧪 TEST 5: Feed ordering (descending by final score)...');
try {
  const result = await feedRankingGraph.run(userId, { limit: 20 });

  if (result.feed.length >= 2) {
    const scores = result.feed.map(p => p._rankScores?.final ?? 0);
    const isOrdered = scores.every((s, i) => i === 0 || s <= scores[i - 1]);

    if (isOrdered) {
      log('Feed correctly ordered ✅', { scores: scores.slice(0, 5) });
    } else {
      fail('TEST 5 — ordering', new Error(`Not descending: ${scores.slice(0, 5).join(', ')}`));
    }
  } else {
    console.log('⚠️  Not enough posts to test ordering');
  }
} catch (e) { fail('TEST 5', e); }

// ── TEST 6: Different users get different feeds ───────────────────────────────
if (users.length >= 2) {
  console.log('\n🧪 TEST 6: Different users get different feeds...');
  try {
    const [r1, r2] = await Promise.all([
      feedRankingGraph.run(users[0]._id, { limit: 10 }),
      feedRankingGraph.run(users[1]._id, { limit: 10 }),
    ]);

    const ids1 = r1.feed.map(p => p._id?.toString());
    const ids2 = r2.feed.map(p => p._id?.toString());
    const overlap = ids1.filter(id => ids2.includes(id));

    log('Feed personalisation', {
      user1: users[0].username,
      user2: users[1].username,
      user1FeedLength: r1.feed.length,
      user2FeedLength: r2.feed.length,
      overlapCount:  overlap.length,
      differentOrder: JSON.stringify(ids1.slice(0, 3)) !== JSON.stringify(ids2.slice(0, 3)),
    });
  } catch (e) { fail('TEST 6', e); }
}

await mongoose.disconnect();
console.log('\n🔌 Done');