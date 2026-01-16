import Comment from '../models/comment.js';
import Post from '../models/post.js';
import { emitNewComment } from '../sockets/index.js';

// @route   POST /api/comments
// @desc    Create a comment
// @access  Private
export const createComment = async (req, res) => {
  try {
    const { content, postId, parentId, personaId } = req.body;

    if (!content || !postId) {
      return res.status(400).json({
        success: false,
        message: 'Content and post ID are required',
      });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    // Calculate depth if it's a reply
    let depth = 0;
    if (parentId) {
      const parentComment = await Comment.findById(parentId);
      if (!parentComment) {
        return res.status(404).json({
          success: false,
          message: 'Parent comment not found',
        });
      }
      depth = parentComment.depth + 1;
    }

    // Create comment
    const comment = await Comment.create({
      content,
      author: req.user._id,
      persona: personaId || null,
      post: postId,
      parent: parentId || null,
      depth,
    });

    // Update post comment count
    post.commentCount += 1;
    await post.save();

    // Populate author
    await comment.populate('author', 'username karma');
    emitNewComment(postId, comment);

    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: { comment },
    });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create comment',
    });
  }
};

// @route   GET /api/comments/post/:postId
// @desc    Get comments for a post
// @access  Public
export const getPostComments = async (req, res) => {
  try {
    const { sort = '-karma', limit = 50 } = req.query;

    // Get top-level comments first
    const comments = await Comment.find({
      post: req.params.postId,
      parent: null,
      isDeleted: false,
    })
      .sort(sort)
      .limit(parseInt(limit))
      .populate('author', 'username karma');

    // Get all replies (for building tree structure on frontend)
    const replies = await Comment.find({
      post: req.params.postId,
      parent: { $ne: null },
      isDeleted: false,
    })
      .sort('createdAt')
      .populate('author', 'username karma');

    res.status(200).json({
      success: true,
      data: {
        comments,
        replies,
      },
    });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comments',
    });
  }
};

// @route   POST /api/comments/:id/vote
// @desc    Vote on a comment
// @access  Private
export const voteComment = async (req, res) => {
  try {
    const { vote } = req.body;

    if (![1, -1, 0].includes(vote)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vote value',
      });
    }

    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    // Find existing vote
    const existingVoteIndex = comment.voters.findIndex(
      v => v.user.equals(req.user._id)
    );

    if (vote === 0) {
      // Remove vote
      if (existingVoteIndex !== -1) {
        const oldVote = comment.voters[existingVoteIndex].vote;
        comment.voters.splice(existingVoteIndex, 1);
        
        if (oldVote === 1) comment.upvotes -= 1;
        if (oldVote === -1) comment.downvotes -= 1;
      }
    } else {
      if (existingVoteIndex !== -1) {
        // Update existing vote
        const oldVote = comment.voters[existingVoteIndex].vote;
        
        if (oldVote !== vote) {
          comment.voters[existingVoteIndex].vote = vote;
          
          if (oldVote === 1) comment.upvotes -= 1;
          if (oldVote === -1) comment.downvotes -= 1;
          
          if (vote === 1) comment.upvotes += 1;
          if (vote === -1) comment.downvotes += 1;
        }
      } else {
        // New vote
        comment.voters.push({
          user: req.user._id,
          vote,
        });
        
        if (vote === 1) comment.upvotes += 1;
        if (vote === -1) comment.downvotes += 1;
      }
    }

    await comment.save();

    res.status(200).json({
      success: true,
      message: 'Vote recorded',
      data: {
        upvotes: comment.upvotes,
        downvotes: comment.downvotes,
        karma: comment.karma,
      },
    });
  } catch (error) {
    console.error('Vote comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to vote',
    });
  }
};

// @route   DELETE /api/comments/:id
// @desc    Delete a comment
// @access  Private
export const deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    // Check ownership
    if (!comment.author.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this comment',
      });
    }

    comment.isDeleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete comment',
    });
  }
};