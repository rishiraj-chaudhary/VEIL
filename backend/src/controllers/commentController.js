import Comment from '../models/comment.js';
import Post from '../models/post.js';
import karmaService from '../services/karmaService.js';
import { personaDriftService } from '../services/personaDriftService.js';
import { emitNewComment } from '../sockets/index.js';

export const createComment = async (req, res) => {
  try {
    const { content, postId, parentId, personaId } = req.body;

    if (!content || !postId) {
      return res.status(400).json({ success: false, message: 'Content and post ID are required' });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    let depth = 0;
    if (parentId) {
      const parentComment = await Comment.findById(parentId);
      if (!parentComment) return res.status(404).json({ success: false, message: 'Parent comment not found' });
      depth = parentComment.depth + 1;
    }

    const comment = await Comment.create({
      content,
      author:  req.user._id,
      persona: personaId || null,
      post:    postId,
      parent:  parentId || null,
      depth,
    });

    post.commentCount += 1;
    await post.save();

    await comment.populate('author', 'username karma');
    emitNewComment(postId, comment);

    personaDriftService.triggerIfNeeded(req.user._id, 'time_interval')
      .catch(err => console.error('Background persona snapshot error:', err));

    res.status(201).json({ success: true, message: 'Comment created successfully', data: { comment } });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create comment' });
  }
};

export const getPostComments = async (req, res) => {
  try {
    const { sort = '-karma', limit = 50 } = req.query;

    const comments = await Comment.find({ post: req.params.postId, parent: null, isDeleted: false })
      .sort(sort).limit(parseInt(limit)).populate('author', 'username karma');

    const replies = await Comment.find({ post: req.params.postId, parent: { $ne: null }, isDeleted: false })
      .sort('createdAt').populate('author', 'username karma');

    res.status(200).json({ success: true, data: { comments, replies } });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch comments' });
  }
};

export const voteComment = async (req, res) => {
  try {
    const { vote } = req.body;

    if (![1, -1, 0].includes(vote)) {
      return res.status(400).json({ success: false, message: 'Invalid vote value' });
    }

    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    const existingVoteIndex = comment.voters.findIndex(v => v.user.equals(req.user._id));

    if (vote === 0) {
      if (existingVoteIndex !== -1) {
        const oldVote = comment.voters[existingVoteIndex].vote;
        comment.voters.splice(existingVoteIndex, 1);
        if (oldVote === 1)  comment.upvotes   -= 1;
        if (oldVote === -1) comment.downvotes -= 1;
      }
    } else {
      if (existingVoteIndex !== -1) {
        const oldVote = comment.voters[existingVoteIndex].vote;
        if (oldVote !== vote) {
          comment.voters[existingVoteIndex].vote = vote;
          if (oldVote === 1)  comment.upvotes   -= 1;
          if (oldVote === -1) comment.downvotes -= 1;
          if (vote === 1)     comment.upvotes   += 1;
          if (vote === -1)    comment.downvotes += 1;
        }
      } else {
        comment.voters.push({ user: req.user._id, vote });
        if (vote === 1)  comment.upvotes   += 1;
        if (vote === -1) comment.downvotes += 1;
      }
    }

    await comment.save();

    // ── Recalculate author karma (non-blocking) ────────────────────────────────
    karmaService.recalculate(comment.author).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Vote recorded',
      data: { upvotes: comment.upvotes, downvotes: comment.downvotes, karma: comment.karma },
    });
  } catch (error) {
    console.error('Vote comment error:', error);
    res.status(500).json({ success: false, message: 'Failed to vote' });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
    if (!comment.author.equals(req.user._id)) return res.status(403).json({ success: false, message: 'Not authorized' });

    comment.isDeleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    res.status(200).json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete comment' });
  }
};