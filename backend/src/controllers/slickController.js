import Slick from '../models/slick.js';
import UserCurrency from '../models/userCurrency.js';
import slickAIService from '../services/slickAIService.js';

// @route   POST /api/slicks
// @desc    Create a new slick
// @access  Private
export const createSlick = async (req, res) => {
  try {
    const { content, targetUserId, tone, visibility = 'public' } = req.body;

    // Validation
    if (!content || !targetUserId || !tone) {
      return res.status(400).json({
        success: false,
        message: 'Content, target user, and tone are required'
      });
    }

    // Check if user is trying to slick themselves
    if (req.user._id.toString() === targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send a slick to yourself'
      });
    }

    // Verify relationship
    const relationshipCheck = await slickAIService.verifyRelationship(req.user._id, targetUserId);
    if (!relationshipCheck.isValid) {
      return res.status(403).json({
        success: false,
        message: relationshipCheck.reason
      });
    }

    // AI content analysis
    const aiAnalysis = await slickAIService.analyzeSlickContent(content, tone);

    // Check if content is appropriate
    if (!aiAnalysis.isAppropriate) {
      return res.status(400).json({
        success: false,
        message: 'Content violates community guidelines',
        aiSuggestion: aiAnalysis.rewrittenVersion,
        reasoning: aiAnalysis.reasoning
      });
    }

    // Encrypt author ID
    const encryptedAuthorId = Slick.encryptAuthorId(req.user._id);

    // Create slick
    const slick = await Slick.create({
      content: aiAnalysis.rewrittenVersion || content, // Use AI-improved version if available
      encryptedAuthorId,
      targetUser: targetUserId,
      relationshipType: relationshipCheck.type,
      tone,
      visibility,
      aiAnalysis
    });

    // Award currency to author for good slicks
    if (aiAnalysis.constructivenessScore > 0.6) {
      const reward = await slickAIService.calculateSlickReward(slick, {});
      
      let currency = await UserCurrency.findOne({ user: req.user._id });
      if (!currency) {
        currency = new UserCurrency({ user: req.user._id });
      }
      await currency.addTransaction('earned', reward, 'Constructive slick bonus', slick._id);
    }

    res.status(201).json({
      success: true,
      message: 'Slick sent successfully',
      data: { 
        slick: {
          id: slick._id,
          content: slick.content,
          tone: slick.tone,
          credibilityScore: slick.credibilityScore,
          createdAt: slick.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Create slick error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create slick'
    });
  }
};

// @route   GET /api/slicks/received
// @desc    Get slicks received by current user
// @access  Private
export const getReceivedSlicks = async (req, res) => {
  try {
    const { sort = '-createdAt', limit = 20, page = 1, showRevealed = false } = req.query;

    const filter = {
      targetUser: req.user._id,
      isActive: true
    };

    // Option to filter revealed/unrevealed
    if (!showRevealed) {
      filter['identityReveal.isRevealed'] = false;
    }

    const slicks = await Slick.find(filter)
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Slick.countDocuments(filter);

    // Add reveal options for each slick
    const slicksWithOptions = slicks.map(slick => ({
      ...slick.toObject(),
      revealOption: slick.canRevealIdentity(req.user._id, 0) // We'll get actual currency below
    }));

    res.json({
      success: true,
      data: {
        slicks: slicksWithOptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get received slicks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch slicks'
    });
  }
};

// @route   GET /api/slicks/sent
// @desc    Get slicks sent by current user (decrypted view)
// @access  Private
export const getSentSlicks = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;

    // Get all slicks and filter by decrypted author ID
    const allSlicks = await Slick.find({ isActive: true })
      .sort({ createdAt: -1 })
      .populate('targetUser', 'username');

    const sentSlicks = allSlicks.filter(slick => {
      const decryptedAuthorId = Slick.decryptAuthorId(slick.encryptedAuthorId);
      return decryptedAuthorId === req.user._id.toString();
    });

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedSlicks = sentSlicks.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      success: true,
      data: {
        slicks: paginatedSlicks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: sentSlicks.length,
          pages: Math.ceil(sentSlicks.length / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get sent slicks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sent slicks'
    });
  }
};

// @route   POST /api/slicks/:id/react
// @desc    React to a slick
// @access  Private
export const reactToSlick = async (req, res) => {
  try {
    const { reaction } = req.body;
    const validReactions = ['agree', 'disagree', 'funny', 'insightful', 'unfair'];

    if (!validReactions.includes(reaction)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reaction type'
      });
    }

    const slick = await Slick.findById(req.params.id);
    if (!slick) {
      return res.status(404).json({
        success: false,
        message: 'Slick not found'
      });
    }

    // Check if user already reacted
    const existingReactionIndex = slick.reactors.findIndex(
      reactor => reactor.user.equals(req.user._id)
    );

    if (existingReactionIndex !== -1) {
      // Remove old reaction
      const oldReaction = slick.reactors[existingReactionIndex].reaction;
      slick.reactions[oldReaction] = Math.max(0, slick.reactions[oldReaction] - 1);
      slick.reactors.splice(existingReactionIndex, 1);
    }

    // Add new reaction
    slick.reactions[reaction] += 1;
    slick.reactors.push({
      user: req.user._id,
      reaction
    });

    await slick.save();

    // Award currency to slick author if positive reaction
    if (['agree', 'funny', 'insightful'].includes(reaction)) {
      const decryptedAuthorId = Slick.decryptAuthorId(slick.encryptedAuthorId);
      if (decryptedAuthorId) {
        let currency = await UserCurrency.findOne({ user: decryptedAuthorId });
        if (currency) {
          await currency.addTransaction('earned', 2, `Positive reaction: ${reaction}`, slick._id);
        }
      }
    }

    res.json({
      success: true,
      message: 'Reaction recorded',
      data: {
        reactions: slick.reactions,
        credibilityScore: slick.credibilityScore
      }
    });

  } catch (error) {
    console.error('React to slick error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record reaction'
    });
  }
};

// @route   POST /api/slicks/:id/reveal
// @desc    Reveal the identity of a slick author
// @access  Private
export const revealSlickAuthor = async (req, res) => {
  try {
    const slick = await Slick.findById(req.params.id);
    if (!slick) {
      return res.status(404).json({
        success: false,
        message: 'Slick not found'
      });
    }

    // Check if user is the target
    if (!slick.targetUser.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Only the target can reveal identity'
      });
    }

    // Get user's currency
    const currency = await UserCurrency.findOne({ user: req.user._id });
    const userCoins = currency ? currency.veilCoins : 0;

    // Check if can reveal
    const revealCheck = slick.canRevealIdentity(req.user._id, userCoins);
    if (!revealCheck.canReveal) {
      return res.status(400).json({
        success: false,
        message: revealCheck.reason
      });
    }

    // Process payment if required
    if (revealCheck.cost > 0 && currency) {
      await currency.addTransaction('spent', revealCheck.cost, 'Slick identity reveal', slick._id);
    }

    // Reveal identity
    slick.identityReveal.isRevealed = true;
    slick.identityReveal.revealedAt = new Date();
    slick.identityReveal.revealMethod = revealCheck.method;
    slick.identityReveal.revealCost = revealCheck.cost;
    await slick.save();

    // Get author info
    const decryptedAuthorId = Slick.decryptAuthorId(slick.encryptedAuthorId);
    const author = await User.findById(decryptedAuthorId).select('username karma');

    res.json({
      success: true,
      message: 'Identity revealed',
      data: {
        author: author ? {
          username: author.username,
          karma: author.karma
        } : null,
        costPaid: revealCheck.cost,
        method: revealCheck.method
      }
    });

  } catch (error) {
    console.error('Reveal slick author error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reveal identity'
    });
  }
};

// @route   GET /api/slicks/insights
// @desc    Get AI-powered insights about user's slick patterns
// @access  Private
export const getSlickInsights = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;

    // Get received slicks
    const timeAgo = new Date();
    timeAgo.setDate(timeAgo.getDate() - (timeframe === '30d' ? 30 : 7));

    const receivedSlicks = await Slick.find({
      targetUser: req.user._id,
      createdAt: { $gte: timeAgo },
      isActive: true
    });

    // Get sent slicks (need to decrypt)
    const allSlicks = await Slick.find({
      createdAt: { $gte: timeAgo },
      isActive: true
    });

    const sentSlicks = allSlicks.filter(slick => {
      const decryptedAuthorId = Slick.decryptAuthorId(slick.encryptedAuthorId);
      return decryptedAuthorId === req.user._id.toString();
    });

    // Generate AI insights
    const aiInsights = await slickAIService.generateSlickInsights(
      req.user._id, 
      receivedSlicks, 
      sentSlicks
    );

    res.json({
      success: true,
      data: {
        insights: aiInsights,
        stats: {
          received: receivedSlicks.length,
          sent: sentSlicks.length,
          timeframe
        }
      }
    });

  } catch (error) {
    console.error('Get slick insights error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate insights'
    });
  }
};

// @route   GET /api/slicks/suggestions/:targetUserId
// @desc    Get AI-generated slick suggestions
// @access  Private
export const getSlickSuggestions = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const { context = '' } = req.query;

    // Verify relationship first
    const relationshipCheck = await slickAIService.verifyRelationship(req.user._id, targetUserId);
    if (!relationshipCheck.isValid) {
      return res.status(403).json({
        success: false,
        message: relationshipCheck.reason
      });
    }

    // Generate AI suggestions
    const suggestions = await slickAIService.generateSlickSuggestions(
      req.user._id, 
      targetUserId, 
      context
    );

    res.json({
      success: true,
      data: suggestions
    });

  } catch (error) {
    console.error('Get slick suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate suggestions'
    });
  }
};

// @route   GET /api/slicks/currency
// @desc    Get user's currency balance and recent transactions
// @access  Private
export const getUserCurrency = async (req, res) => {
  try {
    let currency = await UserCurrency.findOne({ user: req.user._id });
    
    if (!currency) {
      // Initialize currency for new user
      currency = new UserCurrency({ user: req.user._id });
      await currency.save();
    }

    // Check for daily bonus
    const dailyBonus = currency.claimDailyBonus();

    res.json({
      success: true,
      data: {
        balance: currency.veilCoins,
        dailyBonus,
        recentTransactions: currency.transactions.slice(-10),
        earnings: currency.earnings
      }
    });

  } catch (error) {
    console.error('Get user currency error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch currency'
    });
  }
};