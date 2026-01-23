import Debate from '../models/debate.js';
import DebateTurn from '../models/debateTurn.js';
import DebateVote from '../models/debateVote.js';
import User from '../models/user.js';

class DebateService {
  /**
   * Create a new debate
   */
  async createDebate({
    topic,
    description,
    type = 'text',
    format = '1v1',
    visibility = 'public',
    initiatorId,
    initiatorSide = 'for',
    originType,
    originId,
    customRounds = null
  }) {
    try {
      // Validate initiator exists
      const initiator = await User.findById(initiatorId);
      if (!initiator) {
        throw new Error('Initiator not found');
      }

      // Get rounds structure
      const rounds = customRounds || Debate.getDefaultRounds();

      // Create debate
      const debate = await Debate.create({
        topic,
        description,
        type,
        format,
        visibility,
        initiator: initiatorId,
        participants: [{
          user: initiatorId,
          side: initiatorSide,
          isReady: false
        }],
        rounds,
        originType,
        originId,
      });

      await debate.populate('initiator', 'username karma');
      await debate.populate('participants.user', 'username karma');

      console.log('✅ Debate created:', debate._id);
      return { success: true, debate };
    } catch (error) {
      console.error('❌ Create debate error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Join an existing debate
   */
  async joinDebate(debateId, userId, side) {
    try {
      const debate = await Debate.findById(debateId);
      
      if (!debate) {
        throw new Error('Debate not found');
      }

      if (debate.status !== 'pending') {
        throw new Error('Debate has already started or ended');
      }

      if (debate.isFull()) {
        throw new Error('Debate is full');
      }

      if (debate.isParticipant(userId)) {
        throw new Error('You are already a participant');
      }

      // Check if side is available
      const sideOccupied = debate.participants.some(p => p.side === side);
      if (sideOccupied) {
        throw new Error(`Side '${side}' is already taken`);
      }

      // Validate user exists
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Add participant
      debate.participants.push({
        user: userId,
        side,
        isReady: false
      });

      await debate.save();
      await debate.populate('participants.user', 'username karma');

      console.log(`✅ User ${userId} joined debate ${debateId} on side '${side}'`);
      return { success: true, debate };
    } catch (error) {
      console.error('❌ Join debate error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark participant as ready
   */
  async markReady(debateId, userId) {
    try {
      const debate = await Debate.findById(debateId);
      
      if (!debate) {
        throw new Error('Debate not found');
      }

      if (debate.status !== 'pending') {
        throw new Error('Debate has already started');
      }

      const participant = debate.participants.find(p => p.user.equals(userId));
      if (!participant) {
        throw new Error('You are not a participant');
      }

      participant.isReady = true;
      await debate.save();

      // Check if all participants are ready
      const allReady = debate.participants.every(p => p.isReady);
      
      if (allReady && debate.isFull()) {
        await debate.startDebate();
        console.log(`🎉 Debate ${debateId} started!`);
      }

      await debate.populate('participants.user', 'username karma');

      return { 
        success: true, 
        debate,
        started: allReady && debate.isFull()
      };
    } catch (error) {
      console.error('❌ Mark ready error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get debate by ID
   */
  async getDebate(debateId) {
    try {
      const debate = await Debate.findById(debateId)
        .populate('initiator', 'username karma')
        .populate('participants.user', 'username karma')
        .populate('currentTurn', 'username');

      if (!debate) {
        throw new Error('Debate not found');
      }

      return { success: true, debate };
    } catch (error) {
      console.error('❌ Get debate error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get debates with filters
   */
  async getDebates({
    status,
    type,
    visibility = 'public',
    userId,
    originType,
    originId,
    limit = 20,
    page = 1,
    sort = '-createdAt'
  }) {
    try {
      const filter = { isDeleted: false };

      if (status) filter.status = status;
      if (type) filter.type = type;
      if (visibility) filter.visibility = visibility;
      if (originType) filter.originType = originType;
      if (originId) filter.originId = originId;
      
      // User's debates (as initiator or participant)
      if (userId) {
        filter.$or = [
          { initiator: userId },
          { 'participants.user': userId }
        ];
      }

      const debates = await Debate.find(filter)
        .sort(sort)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate('initiator', 'username karma')
        .populate('participants.user', 'username karma');

      const total = await Debate.countDocuments(filter);

      return {
        success: true,
        debates,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      console.error('❌ Get debates error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel debate (before it starts)
   */
  async cancelDebate(debateId, userId) {
    try {
      const debate = await Debate.findById(debateId);
      
      if (!debate) {
        throw new Error('Debate not found');
      }

      if (debate.status !== 'pending') {
        throw new Error('Can only cancel pending debates');
      }

      if (!debate.initiator.equals(userId)) {
        throw new Error('Only the initiator can cancel the debate');
      }

      debate.status = 'cancelled';
      await debate.save();

      console.log(`❌ Debate ${debateId} cancelled by initiator`);
      return { success: true, debate };
    } catch (error) {
      console.error('❌ Cancel debate error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Leave debate (before it starts)
   */
  async leaveDebate(debateId, userId) {
    try {
      const debate = await Debate.findById(debateId);
      
      if (!debate) {
        throw new Error('Debate not found');
      }

      if (debate.status !== 'pending') {
        throw new Error('Cannot leave debate after it has started');
      }

      if (debate.initiator.equals(userId)) {
        throw new Error('Initiator cannot leave - cancel the debate instead');
      }

      // Remove participant
      debate.participants = debate.participants.filter(
        p => !p.user.equals(userId)
      );

      await debate.save();

      console.log(`👋 User ${userId} left debate ${debateId}`);
      return { success: true, debate };
    } catch (error) {
      console.error('❌ Leave debate error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get debate statistics
   */
  async getDebateStats(debateId) {
    try {
      const debate = await Debate.findById(debateId);
      if (!debate) {
        throw new Error('Debate not found');
      }

      const turnStats = await DebateTurn.getTurnStats(debateId);
      const voteStats = await DebateVote.getDebateVotes(debateId);

      return {
        success: true,
        stats: {
          status: debate.status,
          currentRound: debate.currentRound,
          totalRounds: debate.rounds.length,
          totalTurns: debate.totalTurns,
          viewCount: debate.viewCount,
          turnStats,
          voteStats
        }
      };
    } catch (error) {
      console.error('❌ Get stats error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Increment view count
   */
  async incrementViewCount(debateId) {
    try {
      await Debate.findByIdAndUpdate(
        debateId,
        { $inc: { viewCount: 1 } }
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

const debateService = new DebateService();
export default debateService;