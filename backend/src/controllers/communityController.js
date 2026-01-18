import Community from '../models/community.js';

/* =====================================================
   CREATE COMMUNITY
===================================================== */
export const createCommunity = async (req, res) => {
  try {
    const { name, displayName, description } = req.body;

    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        message: 'Name and display name are required',
      });
    }

    const existingCommunity = await Community.findOne({
      name: name.toLowerCase(),
    });

    if (existingCommunity) {
      return res.status(400).json({
        success: false,
        message: 'Community name already taken',
      });
    }

    const community = await Community.create({
      name: name.toLowerCase(),
      displayName,
      description: description || '',
      creator: req.user._id,
      members: [req.user._id],
      memberCount: 1,
    });

    const populatedCommunity = await Community.findById(community._id)
      .populate('creator', 'username')
      .populate('members', '_id username');

    res.status(201).json({
      success: true,
      message: 'Community created successfully',
      data: { community: populatedCommunity },
    });
  } catch (error) {
    console.error('Create community error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create community',
    });
  }
};

/* =====================================================
   GET ALL COMMUNITIES
===================================================== */
export const getAllCommunities = async (req, res) => {
  try {
    const { sort = '-memberCount', limit = 20, page = 1 } = req.query;

    const communities = await Community.find({ isActive: true })
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('creator', 'username')
      .populate('members', '_id username'); // ✅ FIX

    const total = await Community.countDocuments({ isActive: true });

    res.status(200).json({
      success: true,
      data: {
        communities,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get communities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch communities',
    });
  }
};

/* =====================================================
   GET SINGLE COMMUNITY
===================================================== */
export const getCommunity = async (req, res) => {
  try {
    const community = await Community.findOne({
      name: req.params.name.toLowerCase(),
      isActive: true,
    })
      .populate('creator', 'username')
      .populate('moderators', 'username')
      .populate('members', '_id username'); // ✅ FIX

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found',
      });
    }

    res.status(200).json({
      success: true,
      data: { community },
    });
  } catch (error) {
    console.error('Get community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch community',
    });
  }
};

/* =====================================================
   JOIN COMMUNITY
===================================================== */
export const joinCommunity = async (req, res) => {
  try {
    const community = await Community.findOne({
      name: req.params.name.toLowerCase(),
    });

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found',
      });
    }

    if (community.members.some(id => id.equals(req.user._id))) {
      return res.status(400).json({
        success: false,
        message: 'Already a member',
      });
    }

    community.members.push(req.user._id);
    community.memberCount += 1;
    await community.save();

    const populatedCommunity = await Community.findById(community._id)
      .populate('creator', 'username')
      .populate('members', '_id username');

    res.status(200).json({
      success: true,
      message: 'Joined community successfully',
      data: { community: populatedCommunity },
    });
  } catch (error) {
    console.error('Join community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join community',
    });
  }
};

/* =====================================================
   LEAVE COMMUNITY
===================================================== */
export const leaveCommunity = async (req, res) => {
  try {
    const community = await Community.findOne({
      name: req.params.name.toLowerCase(),
    });

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found',
      });
    }

    if (!community.members.some(id => id.equals(req.user._id))) {
      return res.status(400).json({
        success: false,
        message: 'Not a member',
      });
    }

    if (community.creator.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Creator cannot leave community',
      });
    }

    community.members = community.members.filter(
      id => !id.equals(req.user._id)
    );
    community.memberCount -= 1;
    await community.save();

    const populatedCommunity = await Community.findById(community._id)
      .populate('creator', 'username')
      .populate('members', '_id username');

    res.status(200).json({
      success: true,
      message: 'Left community successfully',
      data: { community: populatedCommunity },
    });
  } catch (error) {
    console.error('Leave community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave community',
    });
  }
};