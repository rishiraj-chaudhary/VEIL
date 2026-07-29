import { asyncHandler } from '../middleware/errorHandler.js';
import Community from '../models/community.js';
import Post from '../models/post.js';
import karmaService from '../services/karmaService.js';
import { forbidden, notFound } from '../utils/AppError.js';
import { personaDriftService } from '../services/personaDriftService.js';
import { emitVoteUpdate } from '../sockets/index.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100;
const HOT_WINDOW_MS     = 48 * 60 * 60 * 1000;

const clampInt = (value, fallback, min, max) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

/**
 * Vote counters are updated with atomic `$inc`, which bypasses the schema's
 * pre('save') karma hook — so karma must be incremented in the same operation.
 */
const voteDelta = (vote, direction) => {
  const magnitude = direction === 'remove' ? -1 : 1;
  return vote === 1
    ? { upvotes: magnitude,   karma: magnitude }
    : { downvotes: magnitude, karma: -magnitude };
};

const mergeInc = (...deltas) => deltas.reduce((merged, delta) => {
  for (const [field, amount] of Object.entries(delta)) {
    merged[field] = (merged[field] || 0) + amount;
  }
  return merged;
}, {});

export const createPost = asyncHandler(async (req, res) => {
  const { title, content, communityName, personaId } = req.body;

  const community = await Community.findOne({ name: communityName.toLowerCase() });
  if (!community) throw notFound('Community not found');

  const post = await Post.create({ title, content: content || '', author: req.user._id, persona: personaId || null, community: community._id });
  community.postCount += 1;
  await community.save();
  await post.populate('author', 'username karma');
  await post.populate('community', 'name displayName');
  personaDriftService.triggerIfNeeded(req.user._id, 'time_interval').catch(() => {});
  res.status(201).json({ success: true, message: 'Post created successfully', data: { post } });
});

export const getPosts = asyncHandler(async (req, res) => {
  const { community, sort = 'hot' } = req.query;
  const limitNum = clampInt(req.query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const pageNum  = clampInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
  const skip     = (pageNum - 1) * limitNum;

  const filter = { isDeleted: false };
  if (community) {
    const comm = await Community.findOne({ name: community.toLowerCase() });
    // An unknown community must yield an empty feed, never the global one.
    if (!comm) {
      return res.status(200).json({
        success: true,
        data: { posts: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 } },
      });
    }
    filter.community = comm._id;
  }

  let posts;

  if (sort === 'hot') {
    // HOT: posts from the last 48h ranked by karma, then everything older.
    // Expressed as one ordering so skip/limit paginate the combined list.
    const cutoff = new Date(Date.now() - HOT_WINDOW_MS);
    const ranked = await Post.aggregate([
      { $match: filter },
      { $addFields: { isRecent: { $gte: ['$createdAt', cutoff] } } },
      { $sort: { isRecent: -1, karma: -1, createdAt: -1 } },
      { $skip: skip },
      { $limit: limitNum },
      { $project: { isRecent: 0 } },
    ]);

    posts = await Post.populate(ranked, [
      { path: 'author',    select: 'username karma' },
      { path: 'community', select: 'name displayName' },
    ]);
  } else {
    // NEW: purely chronological | TOP: all-time karma
    const sortOption = sort === 'new'
      ? { createdAt: -1 }
      : { karma: -1, upvotes: -1, createdAt: -1 };

    posts = await Post.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .populate('author', 'username karma')
      .populate('community', 'name displayName');
  }

  const total = await Post.countDocuments(filter);
  res.status(200).json({
    success: true,
    data: {
      posts,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    },
  });
});

export const getPost = asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, isDeleted: false })
    .populate('author', 'username karma').populate('community', 'name displayName');

  if (!post) throw notFound('Post not found');

  res.status(200).json({ success: true, data: { post } });
});

export const votePost = asyncHandler(async (req, res) => {
  const { vote } = req.body;

  const post = await Post.findById(req.params.id);
  if (!post) throw notFound('Post not found');

  const existingVote = post.voters.find(v => v.user.toString() === req.user._id.toString());
  const oldVote = existingVote?.vote ?? 0;

  if (oldVote !== vote) {
    if (oldVote === 0) {
      await Post.updateOne({ _id: post._id }, {
        $push: { voters: { user: req.user._id, vote } },
        $inc:  voteDelta(vote, 'add'),
      });
    } else if (vote === 0) {
      await Post.updateOne({ _id: post._id }, {
        $pull: { voters: { user: req.user._id } },
        $inc:  voteDelta(oldVote, 'remove'),
      });
    } else {
      // Switching direction: flip the stored vote and both counters in one write.
      await Post.updateOne(
        { _id: post._id, 'voters.user': req.user._id },
        {
          $set: { 'voters.$.vote': vote },
          $inc: mergeInc(voteDelta(oldVote, 'remove'), voteDelta(vote, 'add')),
        },
      );
    }
  }

  const updatedPost = await Post.findById(req.params.id).populate('author');
  if (updatedPost?.author?._id) karmaService.recalculate(updatedPost.author._id).catch(() => {});
  emitVoteUpdate(req.params.id, { postId: req.params.id, upvotes: updatedPost.upvotes, downvotes: updatedPost.downvotes, karma: updatedPost.karma });

  res.status(200).json({ success: true, message: 'Vote recorded', data: { upvotes: updatedPost.upvotes, downvotes: updatedPost.downvotes, karma: updatedPost.karma } });
});

export const deletePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw notFound('Post not found');
  if (!post.author.equals(req.user._id)) throw forbidden('Not authorized to delete this post');

  post.isDeleted = true;
  post.deletedAt = new Date();
  await post.save();

  res.status(200).json({ success: true, message: 'Post deleted successfully' });
});