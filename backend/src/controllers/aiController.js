import Comment from '../models/comment.js';
import Post from '../models/post.js';
import aiCacheService from '../services/aiCacheService.js';
import grokService from '../services/grokService.js';

// @route   POST /api/ai/oracle
// @desc    Get AI-generated reply using @oracle
// @access  Private
export const oracleReply = async (req, res) => {
    try {
      const { prompt, postId, parentId, replyingTo, options = {} } = req.body;
  
      // Validation
      if (!prompt) {
        return res.status(400).json({
          success: false,
          message: 'Prompt is required',
        });
      }
  
      // Check if Grok is ready
      if (!grokService.isReady()) {
        return res.status(503).json({
          success: false,
          message: 'AI service is not configured. Please add GROK_API_KEY to environment variables.',
        });
      }
  
      // Check rate limit
      const canProceed = await aiCacheService.checkRateLimit(req.user._id);
      if (!canProceed) {
        const remaining = await aiCacheService.getRemainingRequests(req.user._id);
        return res.status(429).json({
          success: false,
          message: `Rate limit exceeded. Try again later. (${remaining} requests remaining this hour)`,
          remaining: remaining,
        });
      }
  
      // Build context
      const context = await buildOracleContext(req.user._id, postId, {
        ...options,
        parentId,
        replyingTo,
      });
  
      // Add reply-specific instructions
      if (replyingTo) {
        context.systemRole += ` The user is replying specifically to @${replyingTo}. Make sure the response addresses them directly and stays relevant to their comment.`;
      }
  
      console.log('🎯 AI Context built:', {
        threadComments: context.threadContext?.length,
        hasUserStyle: !!context.userStyle,
        isReply: !!replyingTo,
        tone: options.tone,
      });
  
      // Check cache
      const cached = await aiCacheService.get(req.user._id, prompt, context);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: {
            response: cached.response,
            cached: true,
            timestamp: cached.timestamp,
            remaining: await aiCacheService.getRemainingRequests(req.user._id),
          },
        });
      }
  
      // Generate AI response
      const useSmart = options.smart || options.complex;
      const aiResponse = useSmart 
        ? await grokService.generateSmart(prompt, context)
        : await grokService.generateFast(prompt, context);
  
      // Cache the response
      await aiCacheService.set(req.user._id, prompt, context, {
        response: aiResponse,
        timestamp: new Date(),
        model: useSmart ? 'smart' : 'fast',
      });
  
      res.status(200).json({
        success: true,
        data: {
          response: aiResponse,
          cached: false,
          model: useSmart ? 'llama-3.3-70b' : 'llama-3.1-8b',
          remaining: await aiCacheService.getRemainingRequests(req.user._id),
        },
      });
    } catch (error) {
      console.error('Oracle reply error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'AI generation failed',
      });
    }
  };

// @route   GET /api/ai/status
// @desc    Get AI service status
// @access  Private
export const getAIStatus = async (req, res) => {
  try {
    const remaining = await aiCacheService.getRemainingRequests(req.user._id);
    
    res.status(200).json({
      success: true,
      data: {
        enabled: grokService.isReady(),
        models: grokService.getModels(),
        rateLimit: {
          remaining: remaining,
          limit: parseInt(process.env.AI_RATE_LIMIT_PER_HOUR) || 10,
          period: '1 hour',
        },
        cacheEnabled: aiCacheService.enabled,
      },
    });
  } catch (error) {
    console.error('AI status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get AI status',
    });
  }
};

/**
 * Get category leaders (Tone, Clarity, Evidence, Logic)
 */
export const getCategoryLeaders = async (req, res) => {
  try {
    const { category = 'tone' } = req.query;

    const validCategories = ['tone', 'clarity', 'evidence', 'logic'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Must be: tone, clarity, evidence, or logic'
      });
    }

    const leaders = await UserPerformance.getCategoryLeaders(category, 5);

    res.json({
      success: true,
      data: {
        category,
        leaders: leaders.map((perf, index) => {
          let score;
          if (category === 'tone') score = Math.round(perf.qualityMetrics.avgToneScore);
          else if (category === 'clarity') score = Math.round(perf.qualityMetrics.avgClarityScore);
          else if (category === 'evidence') score = Math.round(perf.qualityMetrics.avgEvidenceScore);
          else score = Math.round((1 - perf.fallacyStats.fallacyRate) * 100);

          return {
            rank: index + 1,
            username: perf.user?.username || 'Unknown',
            score,
            totalDebates: perf.stats.totalDebates
          };
        })
      }
    });

  } catch (error) {
    console.error('Get category leaders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get category leaders'
    });
  }
};

/**
 * Get user's rank position
 */
export const getUserRankPosition = async (req, res) => {
  try {
    const userId = req.query.userId || req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const performance = await UserPerformance.findOne({ user: userId });

    if (!performance) {
      return res.json({
        success: true,
        data: {
          qualified: false,
          message: 'Complete at least 3 debates to qualify for rankings'
        }
      });
    }

    if (performance.stats.totalDebates < 3) {
      return res.json({
        success: true,
        data: {
          qualified: false,
          debatesNeeded: 3 - performance.stats.totalDebates,
          message: `Complete ${3 - performance.stats.totalDebates} more debate(s) to qualify`
        }
      });
    }

    const rankPosition = await UserPerformance.getUserRankPosition(userId);

    res.json({
      success: true,
      data: {
        qualified: true,
        ...rankPosition,
        tier: performance.rank,
        winRate: Math.round(performance.stats.winRate)
      }
    });

  } catch (error) {
    console.error('Get user rank position error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get rank position'
    });
  }
};

/**
 * Get all leaderboards (combined view)
 */
export const getAllLeaderboards = async (req, res) => {
  try {
    const [overall, improvers, tone, clarity, evidence, logic] = await Promise.all([
      UserPerformance.getLeaderboard(10, 'winRate'),
      UserPerformance.getTopImprovers(10),
      UserPerformance.getCategoryLeaders('tone', 5),
      UserPerformance.getCategoryLeaders('clarity', 5),
      UserPerformance.getCategoryLeaders('evidence', 5),
      UserPerformance.getCategoryLeaders('logic', 5)
    ]);

    res.json({
      success: true,
      data: {
        overall: overall.map((p, i) => ({
          rank: i + 1,
          username: p.user?.username,
          winRate: Math.round(p.stats.winRate),
          totalDebates: p.stats.totalDebates,
          tier: p.rank
        })),
        improvers: improvers.map((p, i) => ({
          rank: i + 1,
          username: p.user?.username,
          growth: p.improvement.overallGrowth,
          velocity: p.improvement.velocity
        })),
        categoryLeaders: {
          tone: tone.map((p, i) => ({
            rank: i + 1,
            username: p.user?.username,
            score: Math.round(p.qualityMetrics.avgToneScore)
          })),
          clarity: clarity.map((p, i) => ({
            rank: i + 1,
            username: p.user?.username,
            score: Math.round(p.qualityMetrics.avgClarityScore)
          })),
          evidence: evidence.map((p, i) => ({
            rank: i + 1,
            username: p.user?.username,
            score: Math.round(p.qualityMetrics.avgEvidenceScore)
          })),
          logic: logic.map((p, i) => ({
            rank: i + 1,
            username: p.user?.username,
            score: Math.round((1 - p.fallacyStats.fallacyRate) * 100)
          }))
        }
      }
    });

  } catch (error) {
    console.error('Get all leaderboards error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaderboards'
    });
  }
};


/**
 * Build context for Oracle AI
 */
/**
 * Build context for Oracle AI
 */
async function buildOracleContext(userId, postId, options) {
    const context = {
      systemRole: 'You are ORACLE, an AI assistant on VEIL platform. Help users craft thoughtful, well-reasoned responses that fit naturally into the conversation.',
    };
  
    // Apply tone option
    if (options.tone) {
      context.tone = options.tone;
    }
  
    // Apply brevity option
    if (options.brief) {
      context.brief = true;
    }
  
    // Get thread context if postId provided
    if (postId) {
      try {
        const post = await Post.findById(postId).populate('author', 'username');
        
        if (post) {
          // Get comments for THIS thread only, sorted by creation time
          const comments = await Comment.find({ 
            post: postId,
            isDeleted: false 
          })
            .sort({ createdAt: 1 }) // Oldest first for chronological context
            .limit(15) // Last 15 comments max
            .populate('author', 'username')
            .populate('parent'); // To understand reply structure
  
          // Build chronological conversation
          const conversationFlow = [];
          
          // Add the original post
          conversationFlow.push({
            author: post.author?.username || 'OP',
            content: `[POST] ${post.title}\n${post.content || ''}`,
            isPost: true,
          });
  
          // Add comments in order
          comments.forEach(comment => {
            const isReply = comment.parent !== null;
            conversationFlow.push({
              author: comment.author?.username || 'Anonymous',
              content: comment.content,
              isReply: isReply,
              replyingTo: isReply && comment.parent ? 
                comments.find(c => c._id.equals(comment.parent))?.author?.username : 
                null,
            });
          });
  
          context.threadContext = conversationFlow;
          
          // Add metadata
          context.threadInfo = {
            postTitle: post.title,
            totalComments: comments.length,
            communityName: post.community?.name,
          };
        }
      } catch (error) {
        console.error('Error fetching thread context:', error);
      }
    }
  
    // Get user's writing style (from ANY of their comments, not just this thread)
    try {
      const userComments = await Comment.find({ 
        author: userId,
        isDeleted: false 
      })
        .sort({ createdAt: -1 })
        .limit(5);
  
      if (userComments.length > 0) {
        context.userStyle = userComments
          .map(c => c.content)
          .join('\n---\n');
      }
    } catch (error) {
      console.error('Error fetching user style:', error);
    }
  
    return context;
  }