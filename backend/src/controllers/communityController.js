import Community from '../models/community.js';


export const createCommunity = async (req, res) => {
  try {
    const { name, displayName, description } = req.body;

    // Validation
    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        message: 'Name and display name are required',
      });
    }

    // Check if community exists
    const existingCommunity = await Community.findOne({ name: name.toLowerCase() });
    if (existingCommunity) {
      return res.status(400).json({
        success: false,
        message: 'Community name already taken',
      });
    }

    // Create community
    const community = await Community.create({
      name: name.toLowerCase(),
      displayName,
      description: description || '',
      creator: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: 'Community created successfully',
      data: { community },
    });
  } catch (error) {
    console.error('Create community error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create community',
    });
  }
};

// @route   GET /api/communities
// @desc    Get all communities
// @access  Public
export const getAllCommunities = async (req, res) => {
  try {
    const { sort = '-memberCount', limit = 20, page = 1 } = req.query;

    const communities = await Community.find({ isActive: true })
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('creator', 'username');

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

// @route   GET /api/communities/:name
// @desc    Get community by name
// @access  Public
export const getCommunity = async (req, res) => {
  try {
    const community = await Community.findOne({ 
      name: req.params.name.toLowerCase(),
      isActive: true 
    })
      .populate('creator', 'username')
      .populate('moderators', 'username');

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

// @route   POST /api/communities/:name/join
// @desc    Join a community
// @access  Private
export const joinCommunity = async (req, res) => {
  try {
    const community = await Community.findOne({ 
      name: req.params.name.toLowerCase() 
    });

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found',
      });
    }

    // Check if already a member
    if (community.members.includes(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Already a member',
      });
    }

    // Add member
    community.members.push(req.user._id);
    community.memberCount += 1;
    await community.save();

    res.status(200).json({
      success: true,
      message: 'Joined community successfully',
      data: { community },
    });
  } catch (error) {
    console.error('Join community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join community',
    });
  }
};

// @route   POST /api/communities/:name/leave
// @desc    Leave a community
// @access  Private
export const leaveCommunity = async (req, res) => {
  try {
    const community = await Community.findOne({ 
      name: req.params.name.toLowerCase() 
    });

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found',
      });
    }

    // Check if member
    if (!community.members.includes(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Not a member',
      });
    }

    // Can't leave if you're the creator
    if (community.creator.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Creator cannot leave community',
      });
    }

    // Remove member
    community.members = community.members.filter(
      id => !id.equals(req.user._id)
    );
    community.memberCount -= 1;
    await community.save();

    res.status(200).json({
      success: true,
      message: 'Left community successfully',
    });
  } catch (error) {
    console.error('Leave community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave community',
    });
  }
};