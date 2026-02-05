import UserPerformance from '../models/UserPerformance.js';

/**
 * AI DEBATE COACH SERVICE
 * 
 * Analyzes user performance and provides personalized coaching
 */

class AICoachService {
  
  /**
   * Update user performance after a debate turn
   */
  async updatePerformanceAfterTurn(userId, turn) {
    try {
      let performance = await UserPerformance.findOne({ user: userId });

      if (!performance) {
        performance = await UserPerformance.create({ user: userId });
      }

      // Update turn count
      performance.stats.totalTurns += 1;

      // Update quality metrics (rolling average)
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

        // Update fallacy stats
        if (turn.aiAnalysis.fallacies && turn.aiAnalysis.fallacies.length > 0) {
          performance.fallacyStats.totalFallacies += turn.aiAnalysis.fallacies.length;
          
          // Track common fallacies
          turn.aiAnalysis.fallacies.forEach(fallacy => {
            const existing = performance.fallacyStats.commonFallacies.find(f => f.type === fallacy.type);
            if (existing) {
              existing.count += 1;
            } else {
              performance.fallacyStats.commonFallacies.push({
                type: fallacy.type,
                count: 1
              });
            }
          });
        }
      }

      // Calculate fallacy rate
      performance.fallacyStats.fallacyRate = 
        performance.fallacyStats.totalFallacies / performance.stats.totalTurns;

      await performance.save();
      
      console.log(`📊 Updated performance for user ${userId}`);
      
      return performance;

    } catch (error) {
      console.error('Error updating performance:', error);
      throw error;
    }
  }

  /**
   * Update performance after debate completes
   */
  async updatePerformanceAfterDebate(userId, debate) {
    try {
      let performance = await UserPerformance.findOne({ user: userId });

      if (!performance) {
        performance = await UserPerformance.create({ user: userId });
      }

      // Update debate count
      performance.stats.totalDebates += 1;

      // Update win/loss
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

      // Calculate win rate
      const totalOutcomes = performance.stats.wins + performance.stats.losses + performance.stats.draws;
      if (totalOutcomes > 0) {
        performance.stats.winRate = (performance.stats.wins / totalOutcomes) * 100;
      }

      await performance.save();

      // Check for achievements
      await this.checkAchievements(performance);

      // Generate coaching tips periodically
      if (performance.stats.totalDebates % 3 === 0) {
        await this.generateCoachingTips(userId, performance);
      }

      // Take snapshot every 5 debates
      if (performance.stats.totalDebates % 5 === 0) {
        await performance.addSnapshot('milestone');
      }

      return performance;

    } catch (error) {
      console.error('Error updating performance after debate:', error);
      throw error;
    }
  }

  /**
   * Analyze user performance and generate insights
   */
  async analyzePerformance(userId) {
    try {
      const performance = await UserPerformance.findOne({ user: userId });

      if (!performance || performance.stats.totalDebates < 1) {
        return {
          hasData: false,
          message: 'Not enough debate data yet. Participate in debates to see your progress!'
        };
      }

      // Identify strengths
      const strengths = [];
      if (performance.qualityMetrics.avgToneScore >= 80) {
        strengths.push({
          area: 'tone',
          description: 'Excellent tone and respectfulness',
          score: performance.qualityMetrics.avgToneScore
        });
      }
      if (performance.qualityMetrics.avgEvidenceScore >= 75) {
        strengths.push({
          area: 'evidence',
          description: 'Strong use of evidence and citations',
          score: performance.qualityMetrics.avgEvidenceScore
        });
      }
      if (performance.qualityMetrics.avgClarityScore >= 75) {
        strengths.push({
          area: 'clarity',
          description: 'Clear and well-structured arguments',
          score: performance.qualityMetrics.avgClarityScore
        });
      }
      if (performance.fallacyStats.fallacyRate < 0.3) {
        strengths.push({
          area: 'logic',
          description: 'Minimal logical fallacies',
          score: 100 - (performance.fallacyStats.fallacyRate * 100)
        });
      }

      // Identify weaknesses
      const weaknesses = [];
      if (performance.qualityMetrics.avgToneScore < 60) {
        weaknesses.push({
          area: 'tone',
          description: 'Room for improvement in maintaining respectful tone',
          score: performance.qualityMetrics.avgToneScore,
          improvementTip: 'Focus on addressing arguments rather than attacking people. Avoid aggressive language.'
        });
      }
      if (performance.qualityMetrics.avgEvidenceScore < 60) {
        weaknesses.push({
          area: 'evidence',
          description: 'Could strengthen arguments with more evidence',
          score: performance.qualityMetrics.avgEvidenceScore,
          improvementTip: 'Support claims with data, studies, or citations. Use specific examples.'
        });
      }
      if (performance.fallacyStats.fallacyRate > 0.5) {
        weaknesses.push({
          area: 'logic',
          description: 'Frequent logical fallacies detected',
          score: 100 - (performance.fallacyStats.fallacyRate * 100),
          improvementTip: 'Review common fallacies and practice identifying them in your arguments.'
        });
      }

      // Calculate improvement
      const improvement = this.calculateImprovement(performance);

      // Update analysis in database
      performance.analysis.strengths = strengths;
      performance.analysis.weaknesses = weaknesses;
      performance.analysis.lastAnalyzed = new Date();
      performance.improvement = improvement;

      await performance.save();

      return {
        hasData: true,
        performance,
        strengths,
        weaknesses,
        improvement
      };

    } catch (error) {
      console.error('Error analyzing performance:', error);
      throw error;
    }
  }

  /**
   * Calculate improvement velocity
   */
  calculateImprovement(performance) {
    const snapshots = performance.snapshots;
    
    if (snapshots.length < 2) {
      return {
        toneImprovement: 0,
        clarityImprovement: 0,
        evidenceImprovement: 0,
        fallacyReduction: 0,
        overallGrowth: 0,
        velocity: 'insufficient-data'
      };
    }

    const first = snapshots[0];
    const latest = snapshots[snapshots.length - 1];

    const toneImprovement = latest.avgToneScore - first.avgToneScore;
    const clarityImprovement = latest.avgClarityScore - first.avgClarityScore;
    const evidenceImprovement = latest.avgEvidenceScore - first.avgEvidenceScore;
    const fallacyReduction = first.fallacyRate - latest.fallacyRate;

    const overallGrowth = 
      (toneImprovement + clarityImprovement + evidenceImprovement + (fallacyReduction * 100)) / 4;

    let velocity = 'steady';
    if (overallGrowth > 15) velocity = 'rapid';
    else if (overallGrowth > 5) velocity = 'steady';
    else if (overallGrowth > -5) velocity = 'slow';
    else velocity = 'declining';

    return {
      toneImprovement: Math.round(toneImprovement),
      clarityImprovement: Math.round(clarityImprovement),
      evidenceImprovement: Math.round(evidenceImprovement),
      fallacyReduction: Math.round(fallacyReduction * 100),
      overallGrowth: Math.round(overallGrowth),
      velocity
    };
  }

  /**
   * Generate personalized coaching tips
   */
  async generateCoachingTips(userId, performance) {
    try {
      const tips = [];

      // Evidence coaching
      if (performance.qualityMetrics.avgEvidenceScore < 70) {
        tips.push({
          category: 'evidence',
          priority: 'high',
          message: 'Strengthen your arguments with evidence',
          actionable: 'In your next debate, include at least 2 citations or data points to support your claims.'
        });
      }

      // Tone coaching
      if (performance.qualityMetrics.avgToneScore < 70) {
        tips.push({
          category: 'tone',
          priority: 'high',
          message: 'Focus on maintaining a respectful tone',
          actionable: 'Avoid personal attacks and aggressive language. Address the argument, not the person.'
        });
      }

      // Fallacy coaching
      if (performance.fallacyStats.fallacyRate > 0.4) {
        const mostCommon = performance.fallacyStats.commonFallacies
          .sort((a, b) => b.count - a.count)[0];
        
        tips.push({
          category: 'logic',
          priority: 'high',
          message: `Watch out for ${mostCommon?.type || 'logical fallacies'}`,
          actionable: `You frequently use ${mostCommon?.type || 'fallacies'}. Review this fallacy type and practice avoiding it.`
        });
      }

      // Clarity coaching
      if (performance.qualityMetrics.avgClarityScore < 70) {
        tips.push({
          category: 'style',
          priority: 'medium',
          message: 'Improve argument structure',
          actionable: 'Organize your arguments with clear topic sentences and supporting points. Use transition words.'
        });
      }

      // Add tips to performance
      for (const tip of tips) {
        await performance.addCoachingTip(tip);
      }

      console.log(`💡 Generated ${tips.length} coaching tips for user ${userId}`);

    } catch (error) {
      console.error('Error generating coaching tips:', error);
    }
  }

  /**
   * Check and award achievements
   */
  async checkAchievements(performance) {
    try {
      const achievements = [];

      // First debate
      if (performance.stats.totalDebates === 1) {
        achievements.push({
          id: 'first_debate',
          name: 'First Steps',
          description: 'Completed your first debate',
          icon: '🎓'
        });
      }

      // 10 debates
      if (performance.stats.totalDebates === 10) {
        achievements.push({
          id: 'debater_10',
          name: 'Debater',
          description: 'Participated in 10 debates',
          icon: '💬'
        });
      }

      // 50 debates
      if (performance.stats.totalDebates === 50) {
        achievements.push({
          id: 'veteran_50',
          name: 'Veteran',
          description: 'Participated in 50 debates',
          icon: '🏆'
        });
      }

      // High win rate
      if (performance.stats.winRate >= 70 && performance.stats.totalDebates >= 10) {
        achievements.push({
          id: 'champion',
          name: 'Champion',
          description: '70%+ win rate over 10+ debates',
          icon: '👑'
        });
      }

      // Evidence master
      if (performance.qualityMetrics.avgEvidenceScore >= 90) {
        achievements.push({
          id: 'evidence_master',
          name: 'Evidence Master',
          description: 'Consistently provide strong evidence',
          icon: '📊'
        });
      }

      // Logic master (low fallacy rate)
      if (performance.fallacyStats.fallacyRate < 0.1 && performance.stats.totalTurns >= 20) {
        achievements.push({
          id: 'logic_master',
          name: 'Logic Master',
          description: 'Minimal fallacies in 20+ turns',
          icon: '🧠'
        });
      }

      // Award new achievements
      for (const achievement of achievements) {
        const awarded = await performance.awardAchievement(achievement);
        if (awarded) {
          console.log(`🏅 Achievement unlocked: ${achievement.name}`);
        }
      }

    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  }

  /**
   * Get user's performance summary
   */
  /**
 * Get user's performance summary
 */
  async getPerformanceSummary(userId) {
    try {
      console.log('🔍 DEBUG: Looking for userId:', userId);
      
      const performance = await UserPerformance.findOne({ user: userId })
        .populate('user', 'username');
  
      console.log('🔍 DEBUG: Performance found:', !!performance);
      if (performance) {
        console.log('🔍 DEBUG: totalTurns:', performance.stats?.totalTurns);
      }
  
      if (!performance || !performance.stats || performance.stats.totalTurns < 1) {
        console.log('❌ DEBUG: Returning hasData: false');
        return {
          hasData: false,
          message: 'Start debating to track your progress!'
        };
      }
  
      console.log('✅ DEBUG: Returning hasData: true with data!');
      return {
        hasData: true,
        user: performance.user,
        rank: performance.rank,
        stats: performance.stats,
        qualityMetrics: performance.qualityMetrics,
        fallacyStats: performance.fallacyStats,
        strengths: performance.analysis.strengths,
        weaknesses: performance.analysis.weaknesses,
        improvement: performance.improvement,
        achievements: performance.achievements,
        coachingTips: performance.coachingTips.filter(t => !t.dismissed),
        styleProfile: performance.styleProfile
      };
  
    } catch (error) {
      console.error('❌ Error getting performance summary:', error);
      throw error;
    }
  }
}

const aiCoachService = new AICoachService();
export default aiCoachService;