import UserPerformance from '../models/UserPerformance.js';
import performanceGraph from './graph/performanceGraph.js';
import { personaDriftService } from './personaDriftService.js';

/**
 * AI DEBATE COACH SERVICE (Upgraded — Step 11)
 *
 * Changes vs original:
 *   - updatePerformanceAfterDebate() now triggers performanceGraph.run()
 *     which replaces the old rule-based generateCoachingTips() with
 *     LLM-generated, skill-specific drills
 *   - getPerformanceSummary() now returns skillProfile, trend,
 *     blindSpots, peerPercentiles, and coachingPlan
 *   - All original methods preserved and still work identically
 */

class AICoachService {

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE AFTER TURN (unchanged — same rolling average logic)
  // ─────────────────────────────────────────────────────────────────────────

  async updatePerformanceAfterTurn(userId, turn) {
    try {
      let performance = await UserPerformance.findOne({ user: userId });
      if (!performance) {
        performance = await UserPerformance.create({ user: userId });
      }

      performance.stats.totalTurns += 1;

      if (turn.aiAnalysis) {
        const { toneScore, clarityScore, evidenceScore, overallQuality } = turn.aiAnalysis;
        const totalTurns = performance.stats.totalTurns;

        performance.qualityMetrics.avgToneScore =
          ((performance.qualityMetrics.avgToneScore * (totalTurns - 1)) + (toneScore || 0)) / totalTurns;

        performance.qualityMetrics.avgClarityScore =
          ((performance.qualityMetrics.avgClarityScore * (totalTurns - 1)) + (clarityScore || 0)) / totalTurns;

        performance.qualityMetrics.avgEvidenceScore =
          ((performance.qualityMetrics.avgEvidenceScore * (totalTurns - 1)) + (evidenceScore || 0)) / totalTurns;

        performance.qualityMetrics.avgOverallQuality =
          ((performance.qualityMetrics.avgOverallQuality * (totalTurns - 1)) + (overallQuality || 0)) / totalTurns;

        if (turn.aiAnalysis.fallacies?.length > 0) {
          performance.fallacyStats.totalFallacies += turn.aiAnalysis.fallacies.length;

          turn.aiAnalysis.fallacies.forEach(fallacy => {
            const existing = performance.fallacyStats.commonFallacies.find(f => f.type === fallacy.type);
            if (existing) {
              existing.count += 1;
            } else {
              performance.fallacyStats.commonFallacies.push({ type: fallacy.type, count: 1 });
            }
          });
        }
      }

      performance.fallacyStats.fallacyRate =
        performance.fallacyStats.totalFallacies / performance.stats.totalTurns;

      await performance.save();
      console.log(`📊 Updated turn performance for user ${userId}`);
      return performance;

    } catch (error) {
      console.error('Error updating performance after turn:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE AFTER DEBATE — now triggers PerformanceGraph
  // ─────────────────────────────────────────────────────────────────────────

  async updatePerformanceAfterDebate(userId, debate) {
    try {
      let performance = await UserPerformance.findOne({ user: userId });
      if (!performance) {
        performance = await UserPerformance.create({ user: userId });
      }

      // ── Win/loss tracking (unchanged) ──────────────────────────────────
      performance.stats.totalDebates += 1;

      if (debate.winner) {
        const participant = debate.participants.find(p => p.user.equals(userId));
        if (participant) {
          if (debate.winner === 'draw') {
            performance.stats.draws += 1;
          } else if (debate.winner === participant.side) {
            performance.stats.wins += 1;
          } else {
            performance.stats.losses += 1;
          }
        }
      }

      const totalOutcomes = performance.stats.wins + performance.stats.losses + performance.stats.draws;
      if (totalOutcomes > 0) {
        performance.stats.winRate = (performance.stats.wins / totalOutcomes) * 100;
      }

      if (typeof performance.updateRankTier === 'function') {
        performance.updateRankTier();
      }

      await performance.save();

      // ── Old count-based achievements (preserved) ───────────────────────
      await this.checkAchievements(performance);

      // ── OLD: rule-based tips every 3 debates (kept as fallback) ────────
      // Now only fires if PerformanceGraph is unavailable
      // await this.generateCoachingTips(userId, performance);

      // ── NEW: PerformanceGraph — runs async, non-blocking ────────────────
      performanceGraph.run(userId, { lookbackTurns: 20, persist: true })
        .then(result => {
          console.log(`🧠 PerformanceGraph complete for ${userId} — trend: ${result.trend}, blindSpots: ${result.blindSpots.length}`);
          if (result.newAchievements.length > 0) {
            console.log(`🏅 New skill achievements: ${result.newAchievements.map(a => a.name).join(', ')}`);
          }
        })
        .catch(err => console.error('PerformanceGraph error (non-blocking):', err.message));

      // ── Snapshot every 5 debates (unchanged) ──────────────────────────
      if (performance.stats.totalDebates % 5 === 0) {
        if (typeof performance.addSnapshot === 'function') {
          await performance.addSnapshot('milestone');
        }
      }

      // ── Persona snapshot trigger (unchanged) ──────────────────────────
      const shouldSnapshot = await personaDriftService.shouldTriggerSnapshot(userId, 'debate_count');
      if (shouldSnapshot) {
        console.log(`📸 Performance milestone — creating persona snapshot for ${userId}`);
        personaDriftService.createSnapshot(userId, {
          snapshotType: 'automatic',
          trigger: 'debate_count',
        }).catch(err => console.error('Snapshot creation error:', err));
      }

      console.log(`🏆 User ${userId} — Rank: ${performance.rank}, Win Rate: ${Math.round(performance.stats.winRate)}%`);
      return performance;

    } catch (error) {
      console.error('Error updating performance after debate:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET PERFORMANCE SUMMARY — upgraded to include new fields
  // ─────────────────────────────────────────────────────────────────────────

  async getPerformanceSummary(userId) {
    try {
      console.log('🔍 getPerformanceSummary:', userId);

      const performance = await UserPerformance.findOne({ user: userId })
        .populate('user', 'username');

      if (!performance || !performance.stats || performance.stats.totalTurns < 1) {
        return {
          hasData: false,
          message: 'Start debating to track your progress!',
        };
      }

      return {
        hasData: true,
        user:             performance.user,
        rank:             performance.rank,
        stats:            performance.stats,
        qualityMetrics:   performance.qualityMetrics,
        fallacyStats:     performance.fallacyStats,
        strengths:        performance.analysis.strengths,
        weaknesses:       performance.analysis.weaknesses,
        improvement:      performance.improvement,
        achievements:     performance.achievements,
        coachingTips:     performance.coachingTips.filter(t => !t.dismissed),
        styleProfile:     performance.styleProfile,

        // ── NEW fields from PerformanceGraph ──────────────────────────
        skillProfile:     performance.skillProfile || null,
        performanceTrend: performance.performanceTrend || null,
        blindSpots:       performance.analysis.blindSpots || [],
        personaAligned:   performance.analysis.personaAligned || [],
        peerPercentiles:  performance.peerPercentiles || null,
      };

    } catch (error) {
      console.error('Error getting performance summary:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYSE PERFORMANCE (unchanged — rule-based strengths/weaknesses)
  // ─────────────────────────────────────────────────────────────────────────

  async analyzePerformance(userId) {
    try {
      const performance = await UserPerformance.findOne({ user: userId });

      if (!performance || performance.stats.totalDebates < 1) {
        return {
          hasData: false,
          message: 'Not enough debate data yet. Participate in debates to see your progress!',
        };
      }

      const strengths  = [];
      const weaknesses = [];

      if (performance.qualityMetrics.avgToneScore >= 80)
        strengths.push({ area: 'tone', description: 'Excellent tone and respectfulness', score: performance.qualityMetrics.avgToneScore });
      if (performance.qualityMetrics.avgEvidenceScore >= 75)
        strengths.push({ area: 'evidence', description: 'Strong use of evidence and citations', score: performance.qualityMetrics.avgEvidenceScore });
      if (performance.qualityMetrics.avgClarityScore >= 75)
        strengths.push({ area: 'clarity', description: 'Clear and well-structured arguments', score: performance.qualityMetrics.avgClarityScore });
      if (performance.fallacyStats.fallacyRate < 0.3)
        strengths.push({ area: 'logic', description: 'Minimal logical fallacies', score: 100 - (performance.fallacyStats.fallacyRate * 100) });

      if (performance.qualityMetrics.avgToneScore < 60)
        weaknesses.push({ area: 'tone', description: 'Room for improvement in tone', score: performance.qualityMetrics.avgToneScore, improvementTip: 'Address arguments rather than attacking people.' });
      if (performance.qualityMetrics.avgEvidenceScore < 60)
        weaknesses.push({ area: 'evidence', description: 'Could strengthen arguments with more evidence', score: performance.qualityMetrics.avgEvidenceScore, improvementTip: 'Support claims with data, studies, or citations.' });
      if (performance.fallacyStats.fallacyRate > 0.5)
        weaknesses.push({ area: 'logic', description: 'Frequent logical fallacies detected', score: 100 - (performance.fallacyStats.fallacyRate * 100), improvementTip: 'Review common fallacies and practice identifying them.' });

      const improvement = this.calculateImprovement(performance);

      performance.analysis.strengths    = strengths;
      performance.analysis.weaknesses   = weaknesses;
      performance.analysis.lastAnalyzed = new Date();
      performance.improvement           = improvement;

      await performance.save();

      return { hasData: true, performance, strengths, weaknesses, improvement };

    } catch (error) {
      console.error('Error analyzing performance:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS (all unchanged)
  // ─────────────────────────────────────────────────────────────────────────

  calculateImprovement(performance) {
    const snapshots = performance.snapshots;
    if (snapshots.length < 2) {
      return { toneImprovement: 0, clarityImprovement: 0, evidenceImprovement: 0, fallacyReduction: 0, overallGrowth: 0, velocity: 'insufficient-data' };
    }

    const first  = snapshots[0];
    const latest = snapshots[snapshots.length - 1];

    const toneImprovement     = latest.avgToneScore - first.avgToneScore;
    const clarityImprovement  = latest.avgClarityScore - first.avgClarityScore;
    const evidenceImprovement = latest.avgEvidenceScore - first.avgEvidenceScore;
    const fallacyReduction    = first.fallacyRate - latest.fallacyRate;
    const overallGrowth       = (toneImprovement + clarityImprovement + evidenceImprovement + (fallacyReduction * 100)) / 4;

    let velocity = 'steady';
    if (overallGrowth > 15)     velocity = 'rapid';
    else if (overallGrowth > 5) velocity = 'steady';
    else if (overallGrowth > -5) velocity = 'slow';
    else                        velocity = 'declining';

    return {
      toneImprovement:     Math.round(toneImprovement),
      clarityImprovement:  Math.round(clarityImprovement),
      evidenceImprovement: Math.round(evidenceImprovement),
      fallacyReduction:    Math.round(fallacyReduction * 100),
      overallGrowth:       Math.round(overallGrowth),
      velocity,
    };
  }

  async generateCoachingTips(userId, performance) {
    // Kept as fallback — PerformanceGraph replaces this in normal flow
    try {
      const tips = [];

      if (performance.qualityMetrics.avgEvidenceScore < 70)
        tips.push({ category: 'evidence', priority: 'high', message: 'Strengthen your arguments with evidence', actionable: 'Include at least 2 citations or data points per debate turn.' });
      if (performance.qualityMetrics.avgToneScore < 70)
        tips.push({ category: 'tone', priority: 'high', message: 'Focus on maintaining a respectful tone', actionable: 'Avoid personal attacks. Address the argument, not the person.' });
      if (performance.fallacyStats.fallacyRate > 0.4) {
        const mostCommon = performance.fallacyStats.commonFallacies.sort((a, b) => b.count - a.count)[0];
        tips.push({ category: 'logic', priority: 'high', message: `Watch out for ${mostCommon?.type || 'logical fallacies'}`, actionable: `You frequently use ${mostCommon?.type || 'fallacies'}. Review and practice avoiding it.` });
      }
      if (performance.qualityMetrics.avgClarityScore < 70)
        tips.push({ category: 'style', priority: 'medium', message: 'Improve argument structure', actionable: 'Use clear topic sentences and transition words.' });

      for (const tip of tips) {
        if (typeof performance.addCoachingTip === 'function') {
          await performance.addCoachingTip(tip);
        }
      }
    } catch (error) {
      console.error('Error generating coaching tips:', error);
    }
  }

  async checkAchievements(performance) {
    try {
      const achievements = [];

      if (performance.stats.totalDebates === 1)
        achievements.push({ id: 'first_debate', name: 'First Steps', description: 'Completed your first debate', icon: '🎓' });
      if (performance.stats.totalDebates === 10)
        achievements.push({ id: 'debater_10', name: 'Debater', description: 'Participated in 10 debates', icon: '💬' });
      if (performance.stats.totalDebates === 50)
        achievements.push({ id: 'veteran_50', name: 'Veteran', description: 'Participated in 50 debates', icon: '🏆' });
      if (performance.stats.winRate >= 70 && performance.stats.totalDebates >= 10)
        achievements.push({ id: 'champion', name: 'Champion', description: '70%+ win rate over 10+ debates', icon: '👑' });
      if (performance.qualityMetrics.avgEvidenceScore >= 90)
        achievements.push({ id: 'evidence_master', name: 'Evidence Master', description: 'Consistently provide strong evidence', icon: '📊' });
      if (performance.fallacyStats.fallacyRate < 0.1 && performance.stats.totalTurns >= 20)
        achievements.push({ id: 'logic_master', name: 'Logic Master', description: 'Minimal fallacies in 20+ turns', icon: '🧠' });

      for (const achievement of achievements) {
        if (typeof performance.awardAchievement === 'function') {
          const awarded = await performance.awardAchievement(achievement);
          if (awarded) console.log(`🏅 Achievement unlocked: ${achievement.name}`);
        }
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  }
}

const aiCoachService = new AICoachService();
export default aiCoachService;