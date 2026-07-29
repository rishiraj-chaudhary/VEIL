import { asyncHandler } from '../middleware/errorHandler.js';
import Community from '../models/community.js';
import { badRequest, conflict, notFound } from '../utils/AppError.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100;

const clampInt = (value, fallback, min, max) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const withRelations = id => Community.findById(id)
  .populate('creator', 'username')
  .populate('members', '_id username');

/* =====================================================
   CREATE COMMUNITY
===================================================== */
export const createCommunity = asyncHandler(async (req, res) => {
  const { name, displayName, description } = req.body;

  const existingCommunity = await Community.findOne({ name: name.toLowerCase() });
  if (existingCommunity) throw conflict('Community name already taken');

  const community = await Community.create({
    name: name.toLowerCase(),
    displayName: displayName || name,
    description: description || '',
    creator: req.user._id,
    members: [req.user._id],
    memberCount: 1,
  });

  res.status(201).json({
    success: true,
    message: 'Community created successfully',
    data: { community: await withRelations(community._id) },
  });
});

/* =====================================================
   GET ALL COMMUNITIES
===================================================== */
export const getAllCommunities = asyncHandler(async (req, res) => {
  const { sort = '-memberCount' } = req.query;
  const limit = clampInt(req.query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const page  = clampInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);

  const communities = await Community.find({ isActive: true })
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('creator', 'username')
    .populate('members', '_id username');

  const total = await Community.countDocuments({ isActive: true });

  res.status(200).json({
    success: true,
    data: {
      communities,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

/* =====================================================
   GET SINGLE COMMUNITY
===================================================== */
export const getCommunity = asyncHandler(async (req, res) => {
  const community = await Community.findOne({
    name: req.params.name.toLowerCase(),
    isActive: true,
  })
    .populate('creator', 'username')
    .populate('moderators', 'username')
    .populate('members', '_id username');

  if (!community) throw notFound('Community not found');

  res.status(200).json({ success: true, data: { community } });
});

/* =====================================================
   JOIN COMMUNITY
===================================================== */
export const joinCommunity = asyncHandler(async (req, res) => {
  const community = await Community.findOne({ name: req.params.name.toLowerCase() });
  if (!community) throw notFound('Community not found');

  if (community.members.some(id => id.equals(req.user._id))) {
    throw badRequest('Already a member');
  }

  community.members.push(req.user._id);
  community.memberCount += 1;
  await community.save();

  res.status(200).json({
    success: true,
    message: 'Joined community successfully',
    data: { community: await withRelations(community._id) },
  });
});

/* =====================================================
   LEAVE COMMUNITY
===================================================== */
export const leaveCommunity = asyncHandler(async (req, res) => {
  const community = await Community.findOne({ name: req.params.name.toLowerCase() });
  if (!community) throw notFound('Community not found');

  if (!community.members.some(id => id.equals(req.user._id))) {
    throw badRequest('Not a member');
  }

  if (community.creator.equals(req.user._id)) {
    throw badRequest('The creator cannot leave their own community');
  }

  community.members = community.members.filter(id => !id.equals(req.user._id));
  community.memberCount -= 1;
  await community.save();

  res.status(200).json({
    success: true,
    message: 'Left community successfully',
    data: { community: await withRelations(community._id) },
  });
});
