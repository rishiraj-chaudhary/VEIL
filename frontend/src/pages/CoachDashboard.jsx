import axios from 'axios';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import Navbar from '../components/common/Navbar';

const CoachDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [progress, setProgress] = useState(null);
  const [tips, setTips] = useState([]);
  const [achievements, setAchievements] = useState([]);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
  const token = localStorage.getItem('veil_token');
    const user = JSON.parse(localStorage.getItem('veil_user') || '{}');

  useEffect(() => {
    fetchCoachData();
  }, []);

  const fetchCoachData = async () => {
    try {
      setLoading(true);

      const [summaryRes, progressRes, tipsRes, achievementsRes] = await Promise.all([
        axios.get(`${API_URL}/api/coach/summary?userId=${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/api/coach/progress?userId=${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/api/coach/tips?userId=${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/api/coach/achievements?userId=${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setSummary(summaryRes.data.data);
      setProgress(progressRes.data.data);
      setTips(tipsRes.data.data.tips);
      setAchievements(achievementsRes.data.data.achievements);
    } catch (error) {
      console.error('Failed to fetch coach data:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissTip = async (tipId) => {
    try {
      await axios.post(
        `${API_URL}/api/coach/tips/${tipId}/dismiss`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTips(tips.filter(t => t._id !== tipId));
    } catch (error) {
      console.error('Failed to dismiss tip:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-veil-dark">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-veil-purple"></div>
        </div>
      </div>
    );
  }

  if (!summary || summary.hasData === false) {
    return (
      <div className="min-h-screen bg-veil-dark">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="text-6xl mb-4">🎓</div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Welcome to Your AI Coach
            </h1>
            <p className="text-gray-400 mb-8">
              Start debating to unlock personalized coaching!
            </p>
            <button
              onClick={() => navigate('/debates')}
              className="px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg font-semibold transition-colors"
            >
              Find a Debate
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progressData = progress?.snapshots?.map(s => ({
    date: new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Tone: Math.round(s.avgToneScore),
    Clarity: Math.round(s.avgClarityScore),
    Evidence: Math.round(s.avgEvidenceScore)
  })) || [];

  const radarData = [
    { metric: 'Tone', value: Math.round(summary.qualityMetrics.avgToneScore) },
    { metric: 'Clarity', value: Math.round(summary.qualityMetrics.avgClarityScore) },
    { metric: 'Evidence', value: Math.round(summary.qualityMetrics.avgEvidenceScore) },
    { metric: 'Logic', value: Math.round(100 - (summary.fallacyStats.fallacyRate * 100)) }
  ];

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                🎓 AI Debate Coach
              </h1>
              <p className="text-gray-400">
                Your personalized performance tracker
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-veil-purple">
                {summary.rank}
              </div>
              <div className="text-sm text-gray-400">Current Rank</div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="text-3xl font-bold text-green-400 mb-1">
              {summary.stats.totalDebates}
            </div>
            <div className="text-sm text-gray-400">Total Debates</div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="text-3xl font-bold text-blue-400 mb-1">
              {Math.round(summary.stats.winRate)}%
            </div>
            <div className="text-sm text-gray-400">Win Rate</div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="text-3xl font-bold text-purple-400 mb-1">
              {Math.round(summary.qualityMetrics.avgOverallQuality)}
            </div>
            <div className="text-sm text-gray-400">Avg Quality</div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="text-3xl font-bold text-orange-400 mb-1">
              {achievements.length}
            </div>
            <div className="text-sm text-gray-400">Achievements</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Coaching Tips */}
            {tips.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">
                  💡 Coaching Tips
                </h2>
                <div className="space-y-3">
                  {tips.map((tip) => (
                    <div
                      key={tip._id}
                      className={`p-4 rounded-lg border ${
                        tip.priority === 'high'
                          ? 'bg-red-900/10 border-red-700/50'
                          : tip.priority === 'medium'
                          ? 'bg-yellow-900/10 border-yellow-700/50'
                          : 'bg-blue-900/10 border-blue-700/50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-white mb-1">
                            {tip.message}
                          </div>
                          <p className="text-sm text-gray-300">
                            💡 {tip.actionable}
                          </p>
                        </div>
                        <button
                          onClick={() => dismissTip(tip._id)}
                          className="ml-4 text-gray-500 hover:text-gray-400"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progress Chart */}
            {progressData.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">
                  📈 Progress Over Time
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={progressData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="Tone" stroke="#10b981" strokeWidth={2} />
                    <Line type="monotone" dataKey="Clarity" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="Evidence" stroke="#f59e0b" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Strengths */}
              {summary.strengths && summary.strengths.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    💪 Strengths
                  </h3>
                  <div className="space-y-3">
                    {summary.strengths.map((strength, idx) => (
                      <div key={idx} className="flex items-start space-x-2">
                        <span className="text-green-400">✓</span>
                        <div className="flex-1">
                          <div className="text-sm text-white">
                            {strength.description}
                          </div>
                          <div className="text-xs text-green-400">
                            {Math.round(strength.score)}/100
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weaknesses */}
              {summary.weaknesses && summary.weaknesses.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    🎯 Improve
                  </h3>
                  <div className="space-y-3">
                    {summary.weaknesses.map((weakness, idx) => (
                      <div key={idx} className="flex items-start space-x-2">
                        <span className="text-orange-400">⚠</span>
                        <div className="flex-1">
                          <div className="text-sm text-white">
                            {weakness.description}
                          </div>
                          <div className="text-xs text-gray-400">
                            💡 {weakness.improvementTip}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Skill Radar */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                📊 Skill Profile
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="metric" stroke="#9ca3af" />
                  <PolarRadiusAxis domain={[0, 100]} stroke="#9ca3af" />
                  <Radar
                    name="Skills"
                    dataKey="value"
                    stroke="#8b5cf6"
                    fill="#8b5cf6"
                    fillOpacity={0.6}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Achievements */}
            {achievements.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  🏆 Achievements
                </h3>
                <div className="space-y-2">
                  {achievements.slice(0, 5).map((achievement) => (
                    <div
                      key={achievement.id}
                      className="flex items-center space-x-3 p-2 bg-slate-900/50 rounded"
                    >
                      <span className="text-2xl">{achievement.icon}</span>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-white">
                          {achievement.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {achievement.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoachDashboard;