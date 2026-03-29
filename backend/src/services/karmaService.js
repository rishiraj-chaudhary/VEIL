import Comment from '../models/comment.js';
import Post from '../models/post.js';
import User from '../models/user.js';
import UserPerformance from '../models/UserPerformance.js';

class KarmaService {
  async recalculate(userId) {
    const [postKarma, commentKarma, debateKarma] = await Promise.all([
      this._postKarma(userId),
      this._commentKarma(userId),
      this._debateKarma(userId),
    ]);
    const total = postKarma + commentKarma + debateKarma;
    await User.findByIdAndUpdate(userId, { karma: total });
    return { total, postKarma, commentKarma, debateKarma };
  }

  async _postKarma(userId) {
    const posts = await Post.find({ author: userId, isDeleted: false }).select('upvotes downvotes').lean();
    return posts.reduce((sum, p) => sum + (p.upvotes || 0) - (p.downvotes || 0), 0);
  }

  async _commentKarma(userId) {
    const comments = await Comment.find({ author: userId, isDeleted: false }).select('upvotes downvotes').lean();
    return comments.reduce((sum, c) => sum + (c.upvotes || 0) - (c.downvotes || 0), 0);
  }

  async _debateKarma(userId) {
    const perf = await UserPerformance.findOne({ user: userId }).select('stats qualityMetrics').lean();
    if (!perf) return 0;
    const { wins = 0, losses = 0, draws = 0, totalDebates = 0 } = perf.stats || {};
    const avgQuality   = perf.qualityMetrics?.avgOverallQuality || 0;
    const baseScore    = (wins * 10) + (draws * 3) - (losses * 2);
    const qualityBonus = totalDebates > 0 ? Math.floor(avgQuality / 10) * totalDebates : 0;
    return Math.max(0, baseScore + qualityBonus);
  }

  async getBreakdown(userId) {
    const [postKarma, commentKarma, debateKarma] = await Promise.all([
      this._postKarma(userId), this._commentKarma(userId), this._debateKarma(userId),
    ]);
    return { total: postKarma + commentKarma + debateKarma, postKarma, commentKarma, debateKarma };
  }
}

export default new KarmaService();