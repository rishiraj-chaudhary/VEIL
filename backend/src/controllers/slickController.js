import Slick from '../models/slick.js';
import User from '../models/user.js';
import UserCurrency from '../models/userCurrency.js';
import perceptionGraph from '../services/graph/perceptionGraph.js';
import slickAIService from '../services/slickAIService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound } from '../utils/AppError.js';

export const createSlick = asyncHandler(async (req, res) => {
  const { content, targetUserId, tone, visibility = 'public' } = req.body;
  if (!content || !targetUserId || !tone)
    return res.status(400).json({ success: false, message: 'Content, target user, and tone are required' });
  if (req.user._id.toString() === targetUserId)
    return res.status(400).json({ success: false, message: 'You cannot send a slick to yourself' });

  const relationshipCheck = await slickAIService.verifyRelationship(req.user._id, targetUserId);
  if (!relationshipCheck.isValid)
    return res.status(403).json({ success: false, message: relationshipCheck.reason });

  const aiAnalysis = await slickAIService.analyzeSlickContent(content, tone);
  if (!aiAnalysis.isAppropriate)
    return res.status(400).json({ success: false, message: 'Content violates community guidelines', aiSuggestion: aiAnalysis.rewrittenVersion, reasoning: aiAnalysis.reasoning });

  const slick = await Slick.create({
    content: aiAnalysis.rewrittenVersion || content,
    // Cipher for the paid reveal; tag for indexed "slicks I sent" queries.
    encryptedAuthorId: Slick.encryptAuthorId(req.user._id),
    authorTag: Slick.authorTag(req.user._id),
    targetUser: targetUserId,
    relationshipType: relationshipCheck.type,
    tone, visibility, aiAnalysis,
  });

  if (aiAnalysis.constructivenessScore > 0.6) {
    const reward = await slickAIService.calculateSlickReward(slick, {});
    let currency = await UserCurrency.findOne({ user: req.user._id });
    if (!currency) currency = new UserCurrency({ user: req.user._id });
    await currency.addTransaction('earned', reward, 'Constructive slick bonus', slick._id);
  }

  slickAIService.triggerPerceptionUpdate(slick.targetUser).catch(() => {});

  res.status(201).json({
    success: true, message: 'Slick sent successfully',
    data: { slick: { id: slick._id, content: slick.content, tone: slick.tone, credibilityScore: slick.credibilityScore, createdAt: slick.createdAt } },
  });
});

export const getReceivedSlicks = asyncHandler(async (req, res) => {
  const { sort = '-createdAt', limit = 20, page = 1, showRevealed = false } = req.query;
  const filter = { targetUser: req.user._id, isActive: true };
  if (!showRevealed) filter['identityReveal.isRevealed'] = false;

  // FIX: fetch real coin balance in parallel
  const [slicks, total, currency] = await Promise.all([
    Slick.find(filter).sort(sort).limit(parseInt(limit)).skip((parseInt(page) - 1) * parseInt(limit)),
    Slick.countDocuments(filter),
    UserCurrency.findOne({ user: req.user._id }),
  ]);

  const userCoins = currency ? currency.veilCoins : 0;

  const slicksWithOptions = slicks.map(slick => ({
    ...slick.toObject(),
    revealOption: slick.canRevealIdentity(req.user._id, userCoins),
  }));

  res.json({
    success: true,
    data: {
      slicks: slicksWithOptions,
      userCoins,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    },
  });
});

export const getSentSlicks = asyncHandler(async (req, res) => {
  const { limit = 20, page = 1 } = req.query;

  // Was: load every slick in the collection, decrypt each one, keep the matches.
  // That is a full scan plus N decryptions per request, and it could not be
  // indexed because authorship was not a queryable field. The HMAC tag is
  // deterministic, so this is now a single indexed equality match.
  const filter = { authorTag: Slick.authorTag(req.user._id), isActive: true };
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [slicks, total] = await Promise.all([
    Slick.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('targetUser', 'username'),
    Slick.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      slicks,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    },
  });
});

export const reactToSlick = asyncHandler(async (req, res) => {
  const { reaction } = req.body;
  if (!['agree', 'disagree', 'funny', 'insightful', 'unfair'].includes(reaction))
    return res.status(400).json({ success: false, message: 'Invalid reaction type' });

  // reactors is select:false — needed here to prevent double-reacting, and
  // deliberately not returned in the response below.
  const slick = await Slick.findById(req.params.id).select('+reactors');
  if (!slick) return res.status(404).json({ success: false, message: 'Slick not found' });

  const existingIdx = slick.reactors.findIndex(r => r.user.equals(req.user._id));
  if (existingIdx !== -1) {
    const oldReaction = slick.reactors[existingIdx].reaction;
    slick.reactions[oldReaction] = Math.max(0, slick.reactions[oldReaction] - 1);
    slick.reactors.splice(existingIdx, 1);
  }
  slick.reactions[reaction] += 1;
  slick.reactors.push({ user: req.user._id, reaction });
  await slick.save();

  if (['agree', 'funny', 'insightful'].includes(reaction)) {
    // encryptedAuthorId is select:false, so it must be fetched deliberately.
    const withAuthor = await Slick.findById(slick._id).select('+encryptedAuthorId');
    const authorId = Slick.decryptAuthorId(withAuthor?.encryptedAuthorId);
    if (authorId) {
      const cur = await UserCurrency.findOne({ user: authorId });
      if (cur) await cur.addTransaction('earned', 2, `Positive reaction: ${reaction}`, slick._id);
    }
  }

  res.json({ success: true, message: 'Reaction recorded', data: { reactions: slick.reactions, credibilityScore: slick.credibilityScore } });
});

export const revealSlickAuthor = asyncHandler(async (req, res) => {
  // The only endpoint that legitimately needs the plaintext author, and only
  // after canRevealIdentity() has authorised and charged for it.
  const slick = await Slick.findById(req.params.id).select('+encryptedAuthorId');
  if (!slick) return res.status(404).json({ success: false, message: 'Slick not found' });
  if (!slick.targetUser.equals(req.user._id))
    return res.status(403).json({ success: false, message: 'Only the target can reveal identity' });

  const currency  = await UserCurrency.findOne({ user: req.user._id });
  const userCoins = currency ? currency.veilCoins : 0;
  const revealCheck = slick.canRevealIdentity(req.user._id, userCoins);

  if (!revealCheck.canReveal) {
    const needed = Math.max(50, 100 - slick.credibilityScore);
    return res.status(400).json({
      success: false,
      message: revealCheck.reason,
      coinsNeeded: needed,
      coinsHave: userCoins,
      shortfall: Math.max(0, needed - userCoins),
    });
  }

  if (revealCheck.cost > 0 && currency)
    await currency.addTransaction('spent', revealCheck.cost, 'Slick identity reveal', slick._id);

  slick.identityReveal.isRevealed   = true;
  slick.identityReveal.revealedAt   = new Date();
  slick.identityReveal.revealMethod = revealCheck.method;
  slick.identityReveal.revealCost   = revealCheck.cost;
  await slick.save();

  const author = await User.findById(Slick.decryptAuthorId(slick.encryptedAuthorId)).select('username karma');
  res.json({ success: true, message: 'Identity revealed', data: { author: author ? { username: author.username, karma: author.karma } : null, costPaid: revealCheck.cost, method: revealCheck.method } });
});

export const getSlickInsights = asyncHandler(async (req, res) => {
  const { timeframe = '30d' } = req.query;
  const timeAgo = new Date();
  timeAgo.setDate(timeAgo.getDate() - (timeframe === '30d' ? 30 : 7));
  // Both sides are indexed queries. The sent side previously scanned every
  // slick in the window and decrypted each one to find this user's.
  const [receivedSlicks, sentSlicks] = await Promise.all([
    Slick.find({ targetUser: req.user._id, createdAt: { $gte: timeAgo }, isActive: true }),
    Slick.find({ authorTag: Slick.authorTag(req.user._id), createdAt: { $gte: timeAgo }, isActive: true }),
  ]);
  const aiInsights = await slickAIService.generateSlickInsights(req.user._id, receivedSlicks, sentSlicks);
  res.json({ success: true, data: { insights: aiInsights, stats: { received: receivedSlicks.length, sent: sentSlicks.length, timeframe } } });
});

export const getSlickSuggestions = asyncHandler(async (req, res) => {
  const { targetUserId } = req.params;
  const { context = '' } = req.query;
  const relationshipCheck = await slickAIService.verifyRelationship(req.user._id, targetUserId);
  if (!relationshipCheck.isValid)
    return res.status(403).json({ success: false, message: relationshipCheck.reason });
  const suggestions = await slickAIService.generateSlickSuggestions(req.user._id, targetUserId, context);
  res.json({ success: true, data: suggestions });
});

/**
 * How a user is perceived by others, from the anonymous feedback they received.
 *
 * Lived inline in slickRoutes.js with `await import()` for its models on every
 * request and a catch that returned `error.message` straight to the client —
 * the one thing the central error handler exists to prevent, since driver and
 * validation errors carry connection strings and query fragments.
 */
export const getPerception = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId)
    .select('perceptionTraits perceptionTrend perceptionSummary perceptionUpdatedAt')
    .lean();

  if (!user) throw notFound('User not found');

  // Every slick received, not just the analysis window, because this is a
  // displayed count rather than an input to the graph.
  const slickCount = await Slick.countDocuments({
    targetUser: userId,
    isActive: true,
    isFlagged: false,
  });

  if (user.perceptionTraits) {
    return res.json({
      success: true,
      data: {
        perceptionTraits: user.perceptionTraits,
        trend:            user.perceptionTrend || 'stable',
        summary:          user.perceptionSummary || '',
        updatedAt:        user.perceptionUpdatedAt || null,
        slickCount,
        coachingInsights: [], // cached — run the graph for fresh insights
      },
    });
  }

  // Nothing cached: run the graph now, with a wider lookback so a user whose
  // feedback is older than the default window is not reported as unanalysed.
  const result = await perceptionGraph.run(userId, { lookbackDays: 90, persist: true });

  res.json({
    success: true,
    data: {
      perceptionTraits: result.perceptionTraits,
      trend:            result.trend,
      summary:          result.summary,
      updatedAt:        result.updatedAt,
      slickCount:       result.slickCount || slickCount,
      coachingInsights: result.coachingInsights || [],
      toneBreakdown:    result.toneBreakdown,
    },
  });
});

export const getUserCurrency = asyncHandler(async (req, res) => {
  let currency = await UserCurrency.findOne({ user: req.user._id });
  if (!currency) { currency = new UserCurrency({ user: req.user._id }); await currency.save(); }
  const dailyBonus = await currency.claimDailyBonus();
  res.json({ success: true, data: { balance: currency.veilCoins, dailyBonus, recentTransactions: currency.transactions.slice(-10), earnings: currency.earnings } });
});