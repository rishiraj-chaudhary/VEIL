import Comment from '../models/comment.js';
import Post from '../models/post.js';
import aiCacheService from '../services/aiCacheService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
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
export const getAIStatus = asyncHandler(async (req, res) => {
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
});

/**
 * Get category leaders (Tone, Clarity, Evidence, Logic)
 */
/**
 * Get user's rank position
 */
/**
 * Get all leaderboards (combined view)
 */
export const getAllLeaderboards = asyncHandler(async (req, res) => {
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

});


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