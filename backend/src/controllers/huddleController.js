/**
 * HUDDLE CONTROLLER — Phase 11
 * Place at: backend/src/controllers/huddleController.js
 */

import Community from '../models/community.js';
import Huddle from '../models/Huddle.js';
import Post from '../models/post.js';
import huddleAIService from '../services/huddleAIService.js';

// ── Generate a short join code ────────────────────────────────────────────────
const generateJoinCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

/**
 * POST /api/huddles
 * Create a new huddle session
 */
export const createHuddle = async (req, res) => {
  try {
    const { contextType = 'standalone', contextId = null, topic } = req.body;
    const userId = req.user._id;

    // Generate unique join code
    let joinCode;
    let attempts = 0;
    do {
      joinCode = generateJoinCode();
      attempts++;
    } while (attempts < 10 && await Huddle.findOne({ joinCode }));

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
  } catch (error) {
    console.error('Create huddle error:', error);
    res.status(500).json({ success: false, message: 'Failed to create huddle' });
  }
};

/**
 * POST /api/huddles/join/:joinCode
 * Join an existing huddle
 */
export const joinHuddle = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Join huddle error:', error);
    res.status(500).json({ success: false, message: 'Failed to join huddle' });
  }
};

/**
 * GET /api/huddles/:id
 * Get huddle by ID
 */
export const getHuddle = async (req, res) => {
  try {
    const huddle = await Huddle.findById(req.params.id)
      .populate('host', 'username')
      .populate('guest', 'username');

    if (!huddle) {
      return res.status(404).json({ success: false, message: 'Huddle not found' });
    }

    res.status(200).json({ success: true, data: { huddle } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get huddle' });
  }
};

/**
 * POST /api/huddles/:id/transcript
 * Add a transcript entry
 */
export const addTranscriptEntry = async (req, res) => {
  try {
    const { text } = req.body;
    const userId   = req.user._id;
    const username = req.user.username;

    const huddle = await Huddle.findById(req.params.id);
    if (!huddle || huddle.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Huddle not active' });
    }

    huddle.transcript.push({ speaker: userId, username, text, timestamp: new Date() });
    await huddle.save();

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add transcript' });
  }
};

/**
 * POST /api/huddles/:id/end
 * End a huddle and run AI pipeline
 */
export const endHuddle = async (req, res) => {
  try {
    const userId = req.user._id;
    const huddle = await Huddle.findById(req.params.id)
      .populate('host', 'username')
      .populate('guest', 'username');

    if (!huddle) {
      return res.status(404).json({ success: false, message: 'Huddle not found' });
    }

    // Only host or guest can end
    const isParticipant = huddle.host._id.toString() === userId.toString() ||
                          huddle.guest?._id?.toString() === userId.toString();
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not a participant' });
    }

    huddle.status  = 'ended';
    huddle.endedAt = new Date();
    huddle.duration = huddle.startedAt
      ? Math.round((huddle.endedAt - huddle.startedAt) / 1000)
      : 0;

    await huddle.save();

    // Run AI pipeline non-blocking
    if (huddle.transcript.length > 0) {
      setImmediate(async () => {
        try {
          const analysis = await huddleAIService.analyseHuddle(huddle.transcript, {
            hostUsername:  huddle.host.username,
            guestUsername: huddle.guest?.username || 'Guest',
            duration:      huddle.duration,
          });

          await Huddle.findByIdAndUpdate(huddle._id, { aiSummary: analysis });
          console.log(`🎙️ Huddle ${huddle._id} AI analysis complete`);
        } catch (err) {
          console.error('Huddle AI pipeline error:', err.message);
        }
      });
    }

    res.status(200).json({
      success: true,
      data: { huddle, message: 'Huddle ended. AI analysis running in background.' },
    });
  } catch (error) {
    console.error('End huddle error:', error);
    res.status(500).json({ success: false, message: 'Failed to end huddle' });
  }
};

/**
 * GET /api/huddles/:id/summary
 * Get AI summary after huddle ends
 */
export const getHuddleSummary = async (req, res) => {
  try {
    const huddle = await Huddle.findById(req.params.id)
      .populate('host', 'username')
      .populate('guest', 'username')
      .populate('createdPost');

    if (!huddle) {
      return res.status(404).json({ success: false, message: 'Huddle not found' });
    }

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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get huddle summary' });
  }
};

/**
 * POST /api/huddles/:id/publish
 * Publish the AI-generated post from huddle to a community
 */
export const publishHuddlePost = async (req, res) => {
  try {
    const { communityName } = req.body;
    const userId = req.user._id;

    const huddle = await Huddle.findById(req.params.id);
    if (!huddle || huddle.status !== 'ended') {
      return res.status(400).json({ success: false, message: 'Huddle not ended yet' });
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
  } catch (error) {
    console.error('Publish huddle post error:', error);
    res.status(500).json({ success: false, message: 'Failed to publish post' });
  }
};

/**
 * GET /api/huddles/my
 * Get current user's huddle history
 */
export const getMyHuddles = async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get huddles' });
  }
};