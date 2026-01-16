import Community from '../models/community.js';
import Post from '../models/post.js';
import User from '../models/user.js';
import { emitVoteUpdate } from '../sockets/index.js';
// @route   POST /api/posts
// @desc    Create a new post
// @access  Private
export const createPost = async (req, res) => {
  try {
    const { title, content, communityName, personaId } = req.body;

    // Validation
    if (!title || !communityName) {
      return res.status(400).json({
        success: false,
        message: 'Title and community are required',
      });
    }

    // Find community
    const community = await Community.findOne({ 
      name: communityName.toLowerCase() 
    });

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found',
      });
    }

    // Create post
    const post = await Post.create({
      title,
      content: content || '',
      author: req.user._id,
      persona: personaId || null,
      community: community._id,
    });

    // Update community post count
    community.postCount += 1;
    await community.save();

    // Populate author info
    await post.populate('author', 'username karma');
    await post.populate('community', 'name displayName');

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: { post },
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create post',
    });
  }
};

// @route   GET /api/posts
// @desc    Get all posts (with filtering)
// @access  Public
export const getPosts = async (req, res) => {
  try {
    const { 
      community, 
      sort = 'hot', 
      limit = 20, 
      page = 1 
    } = req.query;

    // Build filter
    const filter = { isDeleted: false };
    if (community) {
      const comm = await Community.findOne({ name: community.toLowerCase() });
      if (comm) filter.community = comm._id;
    }

    // Sort options
    let sortOption;
    switch (sort) {
      case 'new':
        sortOption = { createdAt: -1 };
        break;
      case 'top':
        sortOption = { karma: -1, createdAt: -1 };
        break;
      case 'hot':
      default:
        // Hot algorithm: karma / age (simplified)
        sortOption = { karma: -1, createdAt: -1 };
        break;
    }

    const posts = await Post.find(filter)
      .sort(sortOption)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('author', 'username karma')
      .populate('community', 'name displayName');

    const total = await Post.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        posts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch posts',
    });
  }
};

// @route   GET /api/posts/:id
// @desc    Get single post
// @access  Public
export const getPost = async (req, res) => {
  try {
    const post = await Post.findOne({ 
      _id: req.params.id,
      isDeleted: false 
    })
      .populate('author', 'username karma')
      .populate('community', 'name displayName');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    res.status(200).json({
      success: true,
      data: { post },
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch post',
    });
  }
};

// @route   POST /api/posts/:id/vote
// @desc    Vote on a post
// @access  Private
// @route   POST /api/posts/:id/vote
// @desc    Vote on a post
// @access  Private
// @route   POST /api/posts/:id/vote
// @desc    Vote on a post
// @access  Private
// @route   POST /api/posts/:id/vote
// @desc    Vote on a post
// @access  Private
export const votePost = async (req, res) => {
    try {
      const { vote } = req.body;
  
      if (![1, -1, 0].includes(vote)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid vote value',
        });
      }
  
      const post = await Post.findById(req.params.id);
  
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }
  
      // Find existing vote
      const existingVote = post.voters.find(
        v => v.user.toString() === req.user._id.toString()
      );
  
      const updateOps = {};
  
      if (existingVote) {
        const oldVote = existingVote.vote;
  
        if (vote === 0) {
          // Remove vote
          updateOps.$pull = { voters: { user: req.user._id } };
          if (oldVote === 1) {
            updateOps.$inc = { upvotes: -1 };
          } else if (oldVote === -1) {
            updateOps.$inc = { downvotes: -1 };
          }
        } else if (oldVote !== vote) {
          // Change vote - need to remove old and add new
          await Post.updateOne(
            { _id: post._id },
            { 
              $pull: { voters: { user: req.user._id } },
              $inc: oldVote === 1 ? { upvotes: -1 } : { downvotes: -1 }
            }
          );
          
          // Now add new vote
          updateOps.$push = { voters: { user: req.user._id, vote } };
          updateOps.$inc = vote === 1 ? { upvotes: 1 } : { downvotes: 1 };
        }
      } else if (vote !== 0) {
        // New vote
        updateOps.$push = { voters: { user: req.user._id, vote } };
        updateOps.$inc = vote === 1 ? { upvotes: 1 } : { downvotes: 1 };
      }
  
      if (Object.keys(updateOps).length > 0) {
        await Post.updateOne({ _id: post._id }, updateOps);
      }
      
      // Fetch updated post
      const updatedPost = await Post.findById(req.params.id).populate('author');
      
      // Update post author's karma
      if (updatedPost && updatedPost.author) {
        const authorPosts = await Post.find({ author: updatedPost.author._id });
        const totalKarma = authorPosts.reduce((sum, p) => sum + p.karma, 0);
        await User.findByIdAndUpdate(updatedPost.author._id, { karma: totalKarma });
      }
      // Emit real-time update
emitVoteUpdate(req.params.id, {
    postId: req.params.id,
    upvotes: updatedPost.upvotes,
    downvotes: updatedPost.downvotes,
    karma: updatedPost.karma,
  });
  
      
      res.status(200).json({
        success: true,
        message: 'Vote recorded',
        data: {
          upvotes: updatedPost.upvotes,
          downvotes: updatedPost.downvotes,
          karma: updatedPost.karma,
        },
      });
    } catch (error) {
      console.error('Vote post error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to vote',
      });
    }
  };
// @route   DELETE /api/posts/:id
// @desc    Delete a post
// @access  Private
export const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    // Check ownership
    if (!post.author.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this post',
      });
    }

    post.isDeleted = true;
    post.deletedAt = new Date();
    await post.save();

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully',
    });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete post',
    });
  }
};