import User from '../models/user.js';
import { personaDriftService } from './personaDriftService.js';

class PersonaScheduler {
  constructor() {
    this.isRunning = false;
    this.interval = null;
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Persona scheduler already running');
      return;
    }

    console.log('🚀 Starting persona drift scheduler...');
    this.isRunning = true;

    // Run immediately on startup
    this.runScheduledSnapshots().catch(err => 
      console.error('Initial snapshot run error:', err)
    );

    // Then run every 24 hours
    this.interval = setInterval(() => {
      this.runScheduledSnapshots().catch(err =>
        console.error('Scheduled snapshot error:', err)
      );
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Matches feedScheduler: a background timer should not by itself keep the
    // process alive through a shutdown.
    this.interval.unref?.();

    console.log('✅ Persona scheduler started (runs daily)');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('🛑 Persona scheduler stopped');
  }

  /**
   * Run scheduled snapshots for all eligible users
   */
  async runScheduledSnapshots() {
    try {
      console.log('🔄 Running scheduled persona snapshots...');

      // Get all active users (have at least some activity)
      const activeUsers = await this.getActiveUsers();

      console.log(`📊 Found ${activeUsers.length} active users to check`);

      let snapshotsCreated = 0;

      // Process users in batches to avoid overload
      for (const user of activeUsers) {
        try {
          // Check if user needs a snapshot
          const shouldTrigger = await personaDriftService.shouldTriggerSnapshot(
            user._id,
            'time_interval'
          );

          if (shouldTrigger) {
            console.log(`📸 Creating scheduled snapshot for user ${user._id}`);
            
            await personaDriftService.createSnapshot(user._id, {
              snapshotType: 'automatic',
              trigger: 'time_interval',
              periodDays: 30
            });

            snapshotsCreated++;

            // Small delay to avoid overwhelming the AI API
            await this.sleep(2000);
          }

        } catch (error) {
          console.error(`Error creating snapshot for user ${user._id}:`, error.message);
          // Continue with next user
        }
      }

      console.log(`✅ Scheduled snapshots complete: ${snapshotsCreated} created`);

    } catch (error) {
      console.error('Error in runScheduledSnapshots:', error);
    }
  }

  /**
   * Get active users who should be considered for snapshots
   */
  /**
   * Users worth taking a persona snapshot of.
   *
   * The filter was `createdAt: { $lte: sixtyDaysAgo }` — accounts *registered*
   * more than 60 days ago — while the comment above it described users active in
   * the last 60 days. Those are opposite populations, and the query excluded
   * exactly the people the feature is for: on a platform younger than 60 days it
   * matched nobody at all, and after that it snapshotted dormant old accounts
   * while ignoring everyone who had just joined and started debating.
   */
  async getActiveUsers() {
    try {
      const activeSince = new Date();
      activeSince.setDate(activeSince.getDate() - 60);

      const users = await User.find({
        isActive: true,
        isSystem: { $ne: true },   // the AI opponent has no persona to track
        $or: [
          { lastLogin: { $gte: activeSince } },
          { updatedAt: { $gte: activeSince } },
        ],
      })
      .select('_id')
      .limit(100) // Process max 100 users per run
      .lean();

      return users;

    } catch (error) {
      console.error('Error getting active users:', error);
      return [];
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Manual trigger for specific user (for testing)
   */
  async triggerForUser(userId) {
    try {
      console.log(`🎯 Manually triggering snapshot for user ${userId}`);
      
      const snapshot = await personaDriftService.createSnapshot(userId, {
        snapshotType: 'manual',
        trigger: 'user_request',
        periodDays: 30
      });

      console.log(`✅ Manual snapshot created: ${snapshot._id}`);
      return snapshot;

    } catch (error) {
      console.error('Error in manual trigger:', error);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: this.interval ? 'Within 24 hours' : 'Not scheduled'
    };
  }
}

export const personaScheduler = new PersonaScheduler();