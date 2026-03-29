import axios from 'axios';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid, Legend, Line, LineChart,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';
import WeeklyInsightPanel from '../components/coach/WeeklyInsightPanel';
import Navbar from '../components/common/Navbar';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SKILL_META = {
  argumentation:    { label: 'Argumentation',    icon: '🧩', color: '#8b5cf6' },
  evidenceUse:      { label: 'Evidence Use',     icon: '📚', color: '#3b82f6' },
  toneControl:      { label: 'Tone Control',     icon: '🕊️', color: '#10b981' },
  clarity:          { label: 'Clarity',          icon: '💎', color: '#06b6d4' },
  rebuttalStrength: { label: 'Rebuttal',         icon: '🥊', color: '#f59e0b' },
  fallacyAvoidance: { label: 'Logic',            icon: '🛡️', color: '#ef4444' },
};

const TREND_META = {
  improving:    { label: 'Improving',    color: '#10b981', bg: 'bg-emerald-900/30 border-emerald-700/50', icon: '📈' },
  plateau:      { label: 'Plateau',      color: '#f59e0b', bg: 'bg-amber-900/30 border-amber-700/50',   icon: '➡️' },
  declining:    { label: 'Declining',    color: '#ef4444', bg: 'bg-red-900/30 border-red-700/50',       icon: '📉' },
  inconsistent: { label: 'Inconsistent', color: '#8b5cf6', bg: 'bg-purple-900/30 border-purple-700/50', icon: '〰️' },
  stable:       { label: 'Stable',       color: '#6b7280', bg: 'bg-slate-800 border-slate-700',          icon: '⚖️' },
  new:          { label: 'New',          color: '#6b7280', bg: 'bg-slate-800 border-slate-700',          icon: '✨' },
};

const scoreColor = (score) => {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
};

const ScoreBar = ({ value, color }) => (
  <div className="w-full bg-slate-700 rounded-full h-2 mt-1">
    <div
      className="h-2 rounded-full transition-all duration-500"
      style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
    />
  </div>
);

const TrendBadge = ({ trend }) => {
  const meta = TREND_META[trend] || TREND_META.stable;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.bg}`}
      style={{ color: meta.color }}>
      {meta.icon} {meta.label}
    </span>
  );
};

const DiffBadge = ({ delta }) => {
  if (!delta && delta !== 0) return null;
  if (delta > 0)  return <span className="text-xs text-emerald-400 ml-1">+{delta}</span>;
  if (delta < 0)  return <span className="text-xs text-red-400 ml-1">{delta}</span>;
  return <span className="text-xs text-gray-500 ml-1">—</span>;
};

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',   label: '📊 Overview' },
  { id: 'skills',     label: '🎯 Skills' },
  { id: 'coaching',   label: '💡 Coaching Plan' },
  { id: 'progress',   label: '📈 Progress' },
  { id: 'achievements', label: '🏆 Achievements' },
];

// ── Main Component ────────────────────────────────────────────────────────────

const CoachDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary]   = useState(null);
  const [progress, setProgress] = useState(null);
  const [tips, setTips]         = useState([]);
  const [achievements, setAchievements] = useState([]);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
  const token   = localStorage.getItem('veil_token');
  const user    = JSON.parse(localStorage.getItem('veil_user') || '{}');

  useEffect(() => { fetchCoachData(); }, []); // eslint-disable-line

  const fetchCoachData = async () => {
    try {
      setLoading(true);
      const [summaryRes, progressRes, tipsRes, achievementsRes] = await Promise.all([
        axios.get(`${API_URL}/api/coach/summary?userId=${user.id}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/coach/progress?userId=${user.id}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/coach/tips?userId=${user.id}`,    { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/coach/achievements?userId=${user.id}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setSummary(summaryRes.data.data);
      setProgress(progressRes.data.data);
      setTips(tipsRes.data.data.tips || []);
      setAchievements(achievementsRes.data.data.achievements || []);
    } catch (err) {
      console.error('Failed to fetch coach data:', err);
    } finally {
      setLoading(false);
    }
  };

  const dismissTip = async (tipId) => {
    try {
      await axios.post(`${API_URL}/api/coach/tips/${tipId}/dismiss`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setTips(tips.filter(t => t._id !== tipId));
    } catch (err) {
      console.error('Failed to dismiss tip:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-veil-dark">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-veil-purple" />
        </div>
      </div>
    );
  }

  if (!summary || summary.hasData === false) {
    return (
      <div className="min-h-screen bg-veil-dark">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="text-6xl mb-4">🎓</div>
          <h1 className="text-3xl font-bold text-white mb-4">Welcome to Your AI Coach</h1>
          <p className="text-gray-400 mb-8">Start debating to unlock personalized coaching!</p>
          <button onClick={() => navigate('/debates')}
            className="px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg font-semibold transition-colors">
            Find a Debate
          </button>
        </div>
      </div>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const skillProfile = summary.skillProfile || null;
  const skillDeltas  = summary.skillDeltas  || {};
  const trend        = summary.performanceTrend || 'stable';
  const blindSpots   = summary.blindSpots   || [];
  const peerPercentiles = summary.peerPercentiles || null;

  const radarData = skillProfile
    ? Object.entries(SKILL_META).map(([key, meta]) => ({
        metric: meta.label,
        value:  skillProfile[key] || 0,
        peer:   peerPercentiles?.[key] || null,
      }))
    : [
        { metric: 'Tone',     value: Math.round(summary.qualityMetrics.avgToneScore) },
        { metric: 'Clarity',  value: Math.round(summary.qualityMetrics.avgClarityScore) },
        { metric: 'Evidence', value: Math.round(summary.qualityMetrics.avgEvidenceScore) },
        { metric: 'Logic',    value: Math.round(100 - (summary.fallacyStats.fallacyRate * 100)) },
      ];

  const progressData = progress?.snapshots?.map(s => ({
    date:      new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Tone:      Math.round(s.avgToneScore),
    Clarity:   Math.round(s.avgClarityScore),
    Evidence:  Math.round(s.avgEvidenceScore),
    ...(s.skillProfile ? {
      Argumentation: Math.round(s.skillProfile.argumentation || 0),
      Rebuttal:      Math.round(s.skillProfile.rebuttalStrength || 0),
    } : {}),
  })) || [];

  // Active coaching tips (from PerformanceGraph drills + legacy tips)
  const graphTips   = tips.filter(t => t.source === 'performanceGraph');
  const legacyTips  = tips.filter(t => t.source !== 'performanceGraph');

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">🎓 AI Debate Coach</h1>
            <p className="text-gray-400">Your personalized performance tracker</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-veil-purple">{summary.rank}</div>
            <div className="text-sm text-gray-400">Current Rank</div>
            {trend && <div className="mt-1"><TrendBadge trend={trend} /></div>}
          </div>
        </div>
        <div>
          <WeeklyInsightPanel userId={user.id} token={token} />
        </div>

        {/* ── Stats row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Debates', value: summary.stats.totalDebates, color: 'text-green-400' },
            { label: 'Win Rate',      value: `${Math.round(summary.stats.winRate)}%`, color: 'text-blue-400' },
            { label: 'Avg Quality',   value: Math.round(summary.qualityMetrics.avgOverallQuality), color: 'text-purple-400' },
            { label: 'Achievements',  value: achievements.length, color: 'text-orange-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-800 border border-slate-700 rounded-lg p-5">
              <div className={`text-3xl font-bold mb-1 ${color}`}>{value}</div>
              <div className="text-sm text-gray-400">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Blind spot banner ────────────────────────────────────────── */}
        {blindSpots.length > 0 && (
          <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔍</span>
              <div>
                <div className="text-amber-300 font-semibold mb-1">
                  {blindSpots.length} Blind Spot{blindSpots.length > 1 ? 's' : ''} Detected
                </div>
                <p className="text-amber-200/70 text-sm">{blindSpots[0].insight}</p>
                {blindSpots.length > 1 && (
                  <button onClick={() => setActiveTab('skills')} className="text-amber-400 text-xs mt-1 hover:underline">
                    See all blind spots →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-veil-purple text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: OVERVIEW                                                  */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">

              {/* Skill summary bars */}
              {skillProfile && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">Skill Summary</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(SKILL_META).map(([key, meta]) => (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-300">{meta.icon} {meta.label}</span>
                          <span className={`text-sm font-semibold ${scoreColor(skillProfile[key])}`}>
                            {skillProfile[key]}
                            <DiffBadge delta={skillDeltas[key]} />
                          </span>
                        </div>
                        <ScoreBar value={skillProfile[key]} color={meta.color} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {summary.strengths?.length > 0 && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                    <h3 className="text-base font-semibold text-white mb-3">💪 Strengths</h3>
                    <div className="space-y-2">
                      {summary.strengths.map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-emerald-400 mt-0.5">✓</span>
                          <div>
                            <div className="text-sm text-white">{s.description}</div>
                            <div className="text-xs text-emerald-400">{Math.round(s.score)}/100</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {summary.weaknesses?.length > 0 && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                    <h3 className="text-base font-semibold text-white mb-3">🎯 Improve</h3>
                    <div className="space-y-2">
                      {summary.weaknesses.map((w, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-orange-400 mt-0.5">⚠</span>
                          <div>
                            <div className="text-sm text-white">{w.description}</div>
                            <div className="text-xs text-gray-400">💡 {w.improvementTip}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar: radar + achievements preview */}
            <div className="space-y-6">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                <h3 className="text-base font-semibold text-white mb-3">📊 Skill Profile</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="metric" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} stroke="#374151" tick={false} />
                    <Radar name="You" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.5} />
                    {peerPercentiles && (
                      <Radar name="Platform avg" dataKey="peer" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeDasharray="4 2" />
                    )}
                    {peerPercentiles && <Legend />}
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {achievements.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                  <h3 className="text-base font-semibold text-white mb-3">🏆 Recent Achievements</h3>
                  <div className="space-y-2">
                    {achievements.slice(0, 4).map((a) => (
                      <div key={a.id} className="flex items-center gap-3 p-2 bg-slate-900/50 rounded">
                        <span className="text-xl">{a.icon}</span>
                        <div>
                          <div className="text-sm font-semibold text-white">{a.name}</div>
                          <div className="text-xs text-gray-400">{a.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: SKILLS                                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'skills' && (
          <div className="space-y-6">
            {/* 6-dimension breakdown */}
            {skillProfile ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(SKILL_META).map(([key, meta]) => {
                  const score = skillProfile[key] || 0;
                  const delta = skillDeltas[key];
                  const pct   = peerPercentiles?.[key];
                  return (
                    <div key={key} className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-lg">{meta.icon}</span>
                        <span className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</span>
                      </div>
                      <div className="text-sm font-semibold text-white mb-1">{meta.label}</div>
                      <ScoreBar value={score} color={meta.color} />
                      <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                        {delta != null && (
                          <span>Since last: <DiffBadge delta={delta} /></span>
                        )}
                        {pct != null && (
                          <span>Top {100 - pct}% of users</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-gray-400">
                Complete a debate to generate your skill profile.
              </div>
            )}

            {/* Blind spots */}
            {blindSpots.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4">🔍 Blind Spots</h2>
                <p className="text-sm text-gray-400 mb-4">
                  Areas where your self-perception and actual debate performance diverge.
                </p>
                <div className="space-y-3">
                  {blindSpots.map((bs, i) => (
                    <div key={i} className="bg-amber-900/15 border border-amber-700/40 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">⚠️</span>
                        <div>
                          <div className="text-sm font-semibold text-amber-300 mb-1">
                            {SKILL_META[bs.skill]?.label || bs.skill} — {bs.skillScore}/100
                          </div>
                          <p className="text-sm text-gray-300">{bs.insight}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Persona aligned */}
            {summary.personaAligned?.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4">✅ Self-Perception Aligned</h2>
                <div className="space-y-2">
                  {summary.personaAligned.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-emerald-300">
                      <span>✓</span>
                      <span>{a.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: COACHING PLAN                                             */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'coaching' && (
          <div className="space-y-6">
            {/* LLM-generated drills */}
            {graphTips.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-2">🧠 Your Coaching Plan</h2>
                <p className="text-sm text-gray-400 mb-5">
                  Generated by your AI coach after analysing your last 20 debate turns.
                </p>
                <div className="space-y-4">
                  {graphTips.map((tip) => (
                    <div key={tip._id}
                      className={`p-4 rounded-lg border ${
                        tip.priority === 'high'
                          ? 'bg-red-900/10 border-red-700/40'
                          : tip.priority === 'medium'
                          ? 'bg-amber-900/10 border-amber-700/40'
                          : 'bg-blue-900/10 border-blue-700/40'
                      }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                              style={{ backgroundColor: SKILL_META[tip.category]?.color + '30', color: SKILL_META[tip.category]?.color }}>
                              {SKILL_META[tip.category]?.label || tip.category}
                            </span>
                            <span className="text-xs text-gray-500 capitalize">{tip.priority} priority</span>
                          </div>
                          <div className="text-sm font-semibold text-white mb-1">{tip.message}</div>
                          <p className="text-sm text-gray-300">💡 {tip.actionable}</p>
                        </div>
                        <button onClick={() => dismissTip(tip._id)} className="ml-4 text-gray-500 hover:text-gray-400 text-lg">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy tips */}
            {legacyTips.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">💡 General Tips</h2>
                <div className="space-y-3">
                  {legacyTips.map((tip) => (
                    <div key={tip._id}
                      className={`p-4 rounded-lg border ${
                        tip.priority === 'high'
                          ? 'bg-red-900/10 border-red-700/40'
                          : tip.priority === 'medium'
                          ? 'bg-amber-900/10 border-amber-700/40'
                          : 'bg-blue-900/10 border-blue-700/40'
                      }`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-semibold text-white mb-1">{tip.message}</div>
                          <p className="text-sm text-gray-300">💡 {tip.actionable}</p>
                        </div>
                        <button onClick={() => dismissTip(tip._id)} className="ml-4 text-gray-500 hover:text-gray-400">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tips.length === 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-10 text-center">
                <div className="text-4xl mb-3">✅</div>
                <div className="text-white font-semibold mb-1">No active coaching tips</div>
                <p className="text-gray-400 text-sm">Complete a debate and your AI coach will generate a personalised plan.</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: PROGRESS                                                  */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'progress' && (
          <div className="space-y-6">
            {progressData.length > 1 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">📈 Performance Over Time</h2>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={progressData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="Tone"     stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Clarity"  stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Evidence" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    {progressData[0]?.Argumentation != null && (
                      <Line type="monotone" dataKey="Argumentation" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                    )}
                    {progressData[0]?.Rebuttal != null && (
                      <Line type="monotone" dataKey="Rebuttal" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-gray-400">
                Complete more debates to see your progress chart.
              </div>
            )}

            {/* Improvement velocity */}
            {summary.improvement && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">⚡ Improvement Velocity</h2>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl font-bold text-white">{summary.improvement.overallGrowth > 0 ? '+' : ''}{summary.improvement.overallGrowth}</span>
                  <span className="text-gray-400">overall growth</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    summary.improvement.velocity === 'rapid' ? 'bg-emerald-900/40 text-emerald-300' :
                    summary.improvement.velocity === 'steady' ? 'bg-blue-900/40 text-blue-300' :
                    summary.improvement.velocity === 'declining' ? 'bg-red-900/40 text-red-300' :
                    'bg-slate-700 text-gray-400'
                  }`}>{summary.improvement.velocity}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Tone',     value: summary.improvement.toneImprovement },
                    { label: 'Clarity',  value: summary.improvement.clarityImprovement },
                    { label: 'Evidence', value: summary.improvement.evidenceImprovement },
                    { label: 'Logic',    value: summary.improvement.fallacyReduction },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-900/60 rounded-lg p-3 text-center">
                      <div className={`text-xl font-bold ${value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {value > 0 ? '+' : ''}{value}
                      </div>
                      <div className="text-xs text-gray-400">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: ACHIEVEMENTS                                              */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'achievements' && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-2">🏆 Achievements</h2>
            <p className="text-sm text-gray-400 mb-6">{achievements.length} earned</p>
            {achievements.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {achievements.sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt)).map((a) => (
                  <div key={a.id} className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 flex items-center gap-4">
                    <span className="text-3xl">{a.icon}</span>
                    <div>
                      <div className="text-sm font-bold text-white">{a.name}</div>
                      <div className="text-xs text-gray-400">{a.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(a.earnedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-3">🎯</div>
                <p>Complete debates and improve your skills to earn achievements.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default CoachDashboard;