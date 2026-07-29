import Slick from '../models/slick.js';
import User from '../models/user.js';
import UserCurrency from '../models/userCurrency.js';
import slickAIService from '../services/slickAIService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

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

  const encryptedAuthorId = Slick.encryptAuthorId(req.user._id);
  const slick = await Slick.create({
    content: aiAnalysis.rewrittenVersion || content,
    encryptedAuthorId,
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
  const allSlicks = await Slick.find({ isActive: true }).sort({ createdAt: -1 }).populate('targetUser', 'username');
  const sentSlicks = allSlicks.filter(s => Slick.decryptAuthorId(s.encryptedAuthorId) === req.user._id.toString());
  const start = (parseInt(page) - 1) * parseInt(limit);
  res.json({
    success: true,
    data: { slicks: sentSlicks.slice(start, start + parseInt(limit)), pagination: { page: parseInt(page), limit: parseInt(limit), total: sentSlicks.length, pages: Math.ceil(sentSlicks.length / parseInt(limit)) } },
  });
});

export const reactToSlick = asyncHandler(async (req, res) => {
  const { reaction } = req.body;
  if (!['agree', 'disagree', 'funny', 'insightful', 'unfair'].includes(reaction))
    return res.status(400).json({ success: false, message: 'Invalid reaction type' });

  const slick = await Slick.findById(req.params.id);
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
    const authorId = Slick.decryptAuthorId(slick.encryptedAuthorId);
    if (authorId) {
      const cur = await UserCurrency.findOne({ user: authorId });
      if (cur) await cur.addTransaction('earned', 2, `Positive reaction: ${reaction}`, slick._id);
    }
  }

  res.json({ success: true, message: 'Reaction recorded', data: { reactions: slick.reactions, credibilityScore: slick.credibilityScore } });
});

export const revealSlickAuthor = asyncHandler(async (req, res) => {
  const slick = await Slick.findById(req.params.id);
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
  const receivedSlicks = await Slick.find({ targetUser: req.user._id, createdAt: { $gte: timeAgo }, isActive: true });
  const allSlicks = await Slick.find({ createdAt: { $gte: timeAgo }, isActive: true });
  const sentSlicks = allSlicks.filter(s => Slick.decryptAuthorId(s.encryptedAuthorId) === req.user._id.toString());
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

export const getUserCurrency = asyncHandler(async (req, res) => {
  let currency = await UserCurrency.findOne({ user: req.user._id });
  if (!currency) { currency = new UserCurrency({ user: req.user._id }); await currency.save(); }
  const dailyBonus = currency.claimDailyBonus();
  res.json({ success: true, data: { balance: currency.veilCoins, dailyBonus, recentTransactions: currency.transactions.slice(-10), earnings: currency.earnings } });
});