/**
 * HUDDLE CONTROLLER — Phase 11
 * Place at: backend/src/controllers/huddleController.js
 */

import Community from '../models/community.js';
import Huddle from '../models/Huddle.js';
import Post from '../models/post.js';
import { JOB_TYPES } from '../services/jobHandlers.js';
import jobQueue from '../services/jobQueue.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const JOIN_CODE_MAX_ATTEMPTS = 10;

// ── Generate a short join code ────────────────────────────────────────────────
const generateJoinCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

/**
 * Reserve a join code that is not already in use. Retries on collision and
 * surfaces exhaustion explicitly rather than returning a code that is taken.
 */
const reserveJoinCode = async () => {
  for (let attempt = 0; attempt < JOIN_CODE_MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateJoinCode();
    const taken = await Huddle.exists({ joinCode: candidate });
    if (!taken) return candidate;
  }
  throw new Error('Could not allocate a unique join code');
};

/**
 * Huddle transcripts contain private voice conversations, so every read and
 * write is restricted to the two participants.
 */
const isHuddleParticipant = (huddle, userId) => {
  const asId = value => (value?._id ?? value)?.toString();
  const viewer = userId?.toString();
  return asId(huddle.host) === viewer || asId(huddle.guest) === viewer;
};

const denyIfNotParticipant = (res, huddle, userId) => {
  if (isHuddleParticipant(huddle, userId)) return false;
  res.status(403).json({ success: false, message: 'Not a participant of this huddle' });
  return true;
};

/**
 * POST /api/huddles
 * Create a new huddle session
 */
export const createHuddle = asyncHandler(async (req, res) => {
  const { contextType = 'standalone', contextId = null, topic } = req.body;
  const userId = req.user._id;

  const joinCode = await reserveJoinCode();

  const huddle = await Huddle.create({
    host:        userId,
    contextType: contextType || 'standalone',
    contextId:   contextId  || null,
    joinCode,
  });

  await huddle.populate('host', 'username');

  res.status(201).json({
    success: true,
    data: { huddle },
  });
});

/**
 * POST /api/huddles/join/:joinCode
 * Join an existing huddle
 */
export const joinHuddle = asyncHandler(async (req, res) => {
  const { joinCode } = req.params;
  const userId = req.user._id;

  const huddle = await Huddle.findOne({ joinCode: joinCode.toUpperCase() })
    .populate('host', 'username')
    .populate('guest', 'username');

  if (!huddle) {
    return res.status(404).json({ success: false, message: 'Huddle not found' });
  }

  if (huddle.status !== 'waiting') {
    return res.status(400).json({ success: false, message: 'Huddle is no longer available' });
  }

  if (huddle.host._id.toString() === userId.toString()) {
    return res.status(400).json({ success: false, message: 'You are the host of this huddle' });
  }

  huddle.guest     = userId;
  huddle.status    = 'active';
  huddle.startedAt = new Date();
  await huddle.save();
  await huddle.populate('guest', 'username');

  res.status(200).json({
    success: true,
    data: { huddle },
  });
});

/**
 * GET /api/huddles/:id
 * Get huddle by ID
 */
export const getHuddle = asyncHandler(async (req, res) => {
  const huddle = await Huddle.findById(req.params.id)
    .populate('host', 'username')
    .populate('guest', 'username');

  if (!huddle) {
    return res.status(404).json({ success: false, message: 'Huddle not found' });
  }

  if (denyIfNotParticipant(res, huddle, req.user._id)) return;

  res.status(200).json({ success: true, data: { huddle } });
});

/**
 * POST /api/huddles/:id/transcript
 * Add a transcript entry
 */
export const addTranscriptEntry = asyncHandler(async (req, res) => {
  const { text } = req.body;
  const userId   = req.user._id;
  const username = req.user.username;

  const huddle = await Huddle.findById(req.params.id);
  if (!huddle || huddle.status !== 'active') {
    return res.status(400).json({ success: false, message: 'Huddle not active' });
  }

  if (denyIfNotParticipant(res, huddle, userId)) return;

  huddle.transcript.push({ speaker: userId, username, text, timestamp: new Date() });
  await huddle.save();

  res.status(200).json({ success: true });
});

/**
 * POST /api/huddles/:id/end
 * End a huddle and run AI pipeline
 */
export const endHuddle = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const huddle = await Huddle.findById(req.params.id)
    .populate('host', 'username')
    .populate('guest', 'username');

  if (!huddle) {
    return res.status(404).json({ success: false, message: 'Huddle not found' });
  }

  if (denyIfNotParticipant(res, huddle, userId)) return;

  huddle.status  = 'ended';
  huddle.endedAt = new Date();
  huddle.duration = huddle.startedAt
    ? Math.round((huddle.endedAt - huddle.startedAt) / 1000)
    : 0;

  await huddle.save();

  // Summarisation is queued so it survives a restart and retries on a model
  // failure — the transcript is gone from the UI once the call ends.
  if (huddle.transcript.length > 0) {
    await jobQueue.enqueue(JOB_TYPES.SUMMARISE_HUDDLE, { huddleId: huddle._id.toString() },
      { dedupeKey: `huddle-summary:${huddle._id}` });
  }

  res.status(200).json({
    success: true,
    data: { huddle, message: 'Huddle ended. AI analysis running in background.' },
  });
});

/**
 * GET /api/huddles/:id/summary
 * Get AI summary after huddle ends
 */
export const getHuddleSummary = asyncHandler(async (req, res) => {
  const huddle = await Huddle.findById(req.params.id)
    .populate('host', 'username')
    .populate('guest', 'username')
    .populate('createdPost');

  if (!huddle) {
    return res.status(404).json({ success: false, message: 'Huddle not found' });
  }

  if (denyIfNotParticipant(res, huddle, req.user._id)) return;

  res.status(200).json({
    success: true,
    data: {
      summary:       huddle.aiSummary,
      transcript:    huddle.transcript,
      duration:      huddle.duration,
      participants:  [huddle.host?.username, huddle.guest?.username].filter(Boolean),
      createdPost:   huddle.createdPost,
    },
  });
});

/**
 * POST /api/huddles/:id/publish
 * Publish the AI-generated post from huddle to a community
 */
export const publishHuddlePost = asyncHandler(async (req, res) => {
  const { communityName } = req.body;
  const userId = req.user._id;

  const huddle = await Huddle.findById(req.params.id);
  if (!huddle || huddle.status !== 'ended') {
    return res.status(400).json({ success: false, message: 'Huddle not ended yet' });
  }

  if (denyIfNotParticipant(res, huddle, userId)) return;

  if (huddle.createdPost) {
    return res.status(400).json({ success: false, message: 'This huddle has already been published' });
  }

  if (!huddle.aiSummary?.generatedPost?.title) {
    return res.status(400).json({ success: false, message: 'AI analysis not complete yet' });
  }

  const community = await Community.findOne({ name: communityName.toLowerCase() });
  if (!community) {
    return res.status(404).json({ success: false, message: 'Community not found' });
  }

  const post = await Post.create({
    title:     huddle.aiSummary.generatedPost.title,
    content:   huddle.aiSummary.generatedPost.content,
    author:    userId,
    community: community._id,
  });

  community.postCount += 1;
  await community.save();

  huddle.createdPost = post._id;
  await huddle.save();

  await post.populate('author', 'username karma');
  await post.populate('community', 'name displayName');

  res.status(201).json({
    success: true,
    data: { post },
  });
});

/**
 * GET /api/huddles/my
 * Get current user's huddle history
 */
export const getMyHuddles = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const huddles = await Huddle.find({
    $or: [{ host: userId }, { guest: userId }],
    status: { $in: ['ended', 'active', 'waiting'] },
  })
    .populate('host', 'username')
    .populate('guest', 'username')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  res.status(200).json({ success: true, data: { huddles } });
});