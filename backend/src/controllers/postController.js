import Community from '../models/community.js';
import Post from '../models/post.js';
import karmaService from '../services/karmaService.js';
import { personaDriftService } from '../services/personaDriftService.js';
import { emitVoteUpdate } from '../sockets/index.js';

export const createPost = async (req, res) => {
  try {
    const { title, content, communityName, personaId } = req.body;
    if (!title || !communityName)
      return res.status(400).json({ success: false, message: 'Title and community are required' });

    const community = await Community.findOne({ name: communityName.toLowerCase() });
    if (!community)
      return res.status(404).json({ success: false, message: 'Community not found' });

    const post = await Post.create({ title, content: content || '', author: req.user._id, persona: personaId || null, community: community._id });
    community.postCount += 1;
    await community.save();
    await post.populate('author', 'username karma');
    await post.populate('community', 'name displayName');
    personaDriftService.triggerIfNeeded(req.user._id, 'time_interval').catch(() => {});
    res.status(201).json({ success: true, message: 'Post created successfully', data: { post } });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create post' });
  }
};

export const getPosts = async (req, res) => {
  try {
    const { community, sort = 'hot', limit = 20, page = 1 } = req.query;
    const filter = { isDeleted: false };
    if (community) {
      const comm = await Community.findOne({ name: community.toLowerCase() });
      if (comm) filter.community = comm._id;
    }

    let posts;

    if (sort === 'hot') {
      // HOT: posts from last 48h ranked by karma, fallback to older posts
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const recentPosts = await Post.find({ ...filter, createdAt: { $gte: cutoff } })
        .sort({ karma: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .populate('author', 'username karma')
        .populate('community', 'name displayName');

      if (recentPosts.length >= parseInt(limit)) {
        posts = recentPosts;
      } else {
        const recentIds  = recentPosts.map(p => p._id);
        const olderPosts = await Post.find({ ...filter, _id: { $nin: recentIds } })
          .sort({ karma: -1, createdAt: -1 })
          .limit(parseInt(limit) - recentPosts.length)
          .populate('author', 'username karma')
          .populate('community', 'name displayName');
        posts = [...recentPosts, ...olderPosts];
      }
    } else {
      // NEW: purely chronological | TOP: all-time karma
      const sortOption = sort === 'new'
        ? { createdAt: -1 }
        : { karma: -1, upvotes: -1, createdAt: -1 };

      posts = await Post.find(filter)
        .sort(sortOption)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate('author', 'username karma')
        .populate('community', 'name displayName');
    }

    const total = await Post.countDocuments(filter);
    res.status(200).json({ success: true, data: { posts, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } } });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch posts' });
  }
};

export const getPost = async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, isDeleted: false })
      .populate('author', 'username karma').populate('community', 'name displayName');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    res.status(200).json({ success: true, data: { post } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch post' });
  }
};

export const votePost = async (req, res) => {
  try {
    const { vote } = req.body;
    if (![1, -1, 0].includes(vote))
      return res.status(400).json({ success: false, message: 'Invalid vote value' });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const existingVote = post.voters.find(v => v.user.toString() === req.user._id.toString());
    const updateOps = {};

    if (existingVote) {
      const oldVote = existingVote.vote;
      if (vote === 0) {
        updateOps.$pull = { voters: { user: req.user._id } };
        updateOps.$inc  = oldVote === 1 ? { upvotes: -1 } : { downvotes: -1 };
      } else if (oldVote !== vote) {
        await Post.updateOne({ _id: post._id }, { $pull: { voters: { user: req.user._id } }, $inc: oldVote === 1 ? { upvotes: -1 } : { downvotes: -1 } });
        updateOps.$push = { voters: { user: req.user._id, vote } };
        updateOps.$inc  = vote === 1 ? { upvotes: 1 } : { downvotes: 1 };
      }
    } else if (vote !== 0) {
      updateOps.$push = { voters: { user: req.user._id, vote } };
      updateOps.$inc  = vote === 1 ? { upvotes: 1 } : { downvotes: 1 };
    }

    if (Object.keys(updateOps).length > 0) await Post.updateOne({ _id: post._id }, updateOps);

    const updatedPost = await Post.findById(req.params.id).populate('author');
    if (updatedPost?.author?._id) karmaService.recalculate(updatedPost.author._id).catch(() => {});
    emitVoteUpdate(req.params.id, { postId: req.params.id, upvotes: updatedPost.upvotes, downvotes: updatedPost.downvotes, karma: updatedPost.karma });

    res.status(200).json({ success: true, message: 'Vote recorded', data: { upvotes: updatedPost.upvotes, downvotes: updatedPost.downvotes, karma: updatedPost.karma } });
  } catch (error) {
    console.error('Vote post error:', error);
    res.status(500).json({ success: false, message: 'Failed to vote' });
  }
};

export const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (!post.author.equals(req.user._id)) return res.status(403).json({ success: false, message: 'Not authorized' });
    post.isDeleted = true;
    post.deletedAt = new Date();
    await post.save();
    res.status(200).json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete post' });
  }
};