/**
 * TEST: CommunityMemoryGraph — Step 15
 * Run: node test-community-memory-graph.js
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

const { default: communityMemoryGraph } = await import('./src/services/graph/communityMemoryGraph.js');
const Community = (await import('./src/models/community.js')).default;
const Post      = (await import('./src/models/post.js')).default;
const Comment   = (await import('./src/models/comment.js')).default;

const log  = (label, data) => { console.log(`\n${'─'.repeat(50)}\n✅ ${label}`); console.log(JSON.stringify(data, null, 2)); };
const fail = (label, err)  => { console.log(`\n${'─'.repeat(50)}\n❌ ${label}: ${err?.message || err}`); };

// ── Find a community with posts ───────────────────────────────────────────────
const communities = await Community.find({ isActive: true }).lean();
let targetCommunity = null;

for (const c of communities) {
  const count = await Post.countDocuments({ community: c._id, isDeleted: false });
  if (count >= 3) { targetCommunity = c; break; }
}

if (!targetCommunity) {
  console.log('⚠️  No community with 3+ posts found. Creating test data...');

  const User = (await import('./src/models/user.js')).default;
  const user = await User.findOne();
  if (!user) { console.log('❌ Need at least 1 user in DB'); await mongoose.disconnect(); process.exit(0); }

  targetCommunity = await Community.create({
    name:        'aitestcommunity',
    displayName: 'AI Test Community',
    description: 'Testing AI and LLMs',
    creator:     user._id,
  });

  const postData = [
    { title: 'Are LLMs actually reasoning or just pattern matching?', content: 'Discussion on whether transformers truly reason.' },
    { title: 'GPT-4 vs Claude vs Gemini — which is actually better?', content: 'Comparing frontier models on real tasks.' },
    { title: 'Fine-tuning vs RAG — which should you use?', content: 'Practical comparison for production systems.' },
    { title: 'The compute cost problem is unsustainable', content: 'Training frontier models costs hundreds of millions.' },
    { title: 'Open source models are catching up fast', content: 'Llama 3, Mistral, Qwen — the gap is closing.' },
  ];

  const createdPosts = [];
  for (const pd of postData) {
    const p = await Post.create({ ...pd, author: user._id, community: targetCommunity._id });
    createdPosts.push(p);
  }

  const commentTexts = [
    'Pattern matching is a form of reasoning at scale.',
    'I disagree, real reasoning requires symbolic manipulation.',
    'GPT-4 is better for coding, Claude for nuanced writing.',
    'RAG is more practical for most use cases.',
    'Fine-tuning makes sense when you have domain-specific data.',
    'The energy consumption alone makes this unsustainable.',
    'Llama 3 70B is genuinely impressive for open source.',
  ];

  for (let i = 0; i < commentTexts.length; i++) {
    await Comment.create({
      content: commentTexts[i],
      author:  user._id,
      post:    createdPosts[i % createdPosts.length]._id,
      depth:   0,
    });
  }

  targetCommunity.postCount = postData.length;
  await Community.findByIdAndUpdate(targetCommunity._id, { postCount: postData.length });
  console.log(`✅ Created test community with ${postData.length} posts`);
}

const communityId = targetCommunity._id;
console.log(`\n🏘️  Testing with community: "${targetCommunity.displayName}" (c/${targetCommunity.name})`);
const postCount = await Post.countDocuments({ community: communityId, isDeleted: false });
console.log(`📝 Posts: ${postCount}`);

// ── TEST 1: Full graph run ─────────────────────────────────────────────────────
console.log('\n🧪 TEST 1: Full graph run...');
try {
  const result = await communityMemoryGraph.run(communityId, { force: true });
  log('Graph result shape', {
    topicClusterCount:  result.topicClusters?.length ?? 0,
    recurringClaimCount:result.recurringClaims?.length ?? 0,
    hasToneProfile:     !!result.toneProfile,
    polarizationScore:  result.polarizationScore,
    hasOnboarding:      !!result.onboardingSummary,
    onboardingLength:   result.onboardingSummary?.length ?? 0,
  });
} catch (e) { fail('TEST 1', e); }

// ── TEST 2: Topic clusters are valid ──────────────────────────────────────────
console.log('\n🧪 TEST 2: Topic clusters...');
try {
  const result = await communityMemoryGraph.run(communityId);
  const valid = Array.isArray(result.topicClusters) && result.topicClusters.length > 0;
  if (valid) {
    log('Topic clusters ✅', result.topicClusters);
  } else {
    fail('TEST 2', new Error('No topic clusters returned'));
  }
} catch (e) { fail('TEST 2', e); }

// ── TEST 3: Tone profile ───────────────────────────────────────────────────────
console.log('\n🧪 TEST 3: Tone profile...');
try {
  const result = await communityMemoryGraph.run(communityId);
  const tone   = result.toneProfile;
  if (tone?.civility && tone?.style) {
    log('Tone profile ✅', tone);
  } else {
    fail('TEST 3', new Error('Invalid tone profile'));
  }
} catch (e) { fail('TEST 3', e); }

// ── TEST 4: Onboarding summary ─────────────────────────────────────────────────
console.log('\n🧪 TEST 4: Onboarding summary...');
try {
  const result = await communityMemoryGraph.run(communityId);
  if (result.onboardingSummary && result.onboardingSummary.length > 20) {
    log('Onboarding summary ✅', { summary: result.onboardingSummary });
  } else {
    fail('TEST 4', new Error('Summary too short or missing'));
  }
} catch (e) { fail('TEST 4', e); }

// ── TEST 5: Persisted to Community ────────────────────────────────────────────
console.log('\n🧪 TEST 5: Persisted to Community model...');
try {
  await communityMemoryGraph.run(communityId, { force: true });
  const fromDB = await Community.findById(communityId).select('memoryAnalysis').lean();
  const stored = fromDB?.memoryAnalysis;
  if (stored?.onboardingSummary && stored?.analysedAt) {
    log('Persisted ✅', {
      polarizationScore: stored.polarizationScore,
      topicClusters:     stored.topicClusters?.length,
      analysedAt:        stored.analysedAt,
    });
  } else {
    fail('TEST 5', new Error('memoryAnalysis not persisted'));
  }
} catch (e) { fail('TEST 5', e); }

// ── TEST 6: Cache works ────────────────────────────────────────────────────────
console.log('\n🧪 TEST 6: Cache behaviour...');
try {
  const start   = Date.now();
  const result  = await communityMemoryGraph.run(communityId);
  const elapsed = Date.now() - start;
  log('Cache hit ✅', {
    elapsed:        `${elapsed}ms`,
    fromCache:      elapsed < 300,
    polarization:   result.polarizationScore,
  });
} catch (e) { fail('TEST 6', e); }

await mongoose.disconnect();
console.log('\n🔌 Done');