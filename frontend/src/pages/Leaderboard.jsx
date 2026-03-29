/**
 * LEADERBOARD PAGE — fixed
 * - Single Navbar (removed duplicate wrapper)
 * - Added Karma tab (unified reputation)
 * - Empty state handling
 * - Consistent dark theme matching rest of app
 *
 * Place at: frontend/src/pages/Leaderboard.jsx
 */

import { useEffect, useState } from 'react';
import Navbar from '../components/common/Navbar';
import api from '../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const RANK_STYLES = {
  1: { color: 'text-yellow-400', icon: '🥇' },
  2: { color: 'text-gray-300',   icon: '🥈' },
  3: { color: 'text-orange-400', icon: '🥉' },
};

const RankDisplay = ({ rank }) => {
  const style = RANK_STYLES[rank];
  return style
    ? <span className={`text-xl font-bold ${style.color}`}>{style.icon}</span>
    : <span className="text-sm font-bold text-gray-500 w-8 text-center">#{rank}</span>;
};

const TIER_CONFIG = {
  novice:     { color: 'bg-gray-600',    icon: '🌱' },
  apprentice: { color: 'bg-blue-600',    icon: '📚' },
  expert:     { color: 'bg-purple-600',  icon: '⭐' },
  master:     { color: 'bg-red-600',     icon: '👑' },
  legend:     { color: 'bg-yellow-500',  icon: '🏆' },
  beginner:   { color: 'bg-gray-600',    icon: '🌱' },
  skilled:    { color: 'bg-blue-500',    icon: '⚔️' },
};

const TierBadge = ({ tier }) => {
  if (!tier) return null;
  const cfg  = TIER_CONFIG[tier?.toLowerCase()] || TIER_CONFIG.novice;
  return (
    <span className={`${cfg.color} px-2 py-0.5 rounded text-xs font-semibold`}>
      {cfg.icon} {tier.toUpperCase()}
    </span>
  );
};

const EmptyState = ({ message }) => (
  <div className="text-center py-16 text-gray-500">
    <div className="text-4xl mb-3">📊</div>
    <p className="text-sm">{message}</p>
  </div>
);

const TABS = [
  { id: 'karma',      label: '⚡ Karma' },
  { id: 'overall',   label: '🏆 Win Rate' },
  { id: 'improvers', label: '📈 Improvers' },
  { id: 'categories',label: '🎯 Skills' },
];

// ── Main ──────────────────────────────────────────────────────────────────────

const Leaderboard = () => {
  const [activeTab, setActiveTab]   = useState('karma');
  const [leaderboards, setLeaderboards] = useState(null);
  const [karmaBoard, setKarmaBoard] = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [debateRes, karmaRes] = await Promise.all([
        api.get('/coach/leaderboard/all').catch(() => ({ data: { success: false } })),
        api.get('/karma/leaderboard').catch(() => ({ data: { success: false } })),
      ]);

      if (debateRes.data.success) setLeaderboards(debateRes.data.data);
      if (karmaRes.data.success)  setKarmaBoard(karmaRes.data.data.leaderboard);
    } catch (err) {
      console.error('Leaderboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-veil-dark">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-veil-purple" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">🏆 Leaderboard</h1>
          <p className="text-gray-400 text-sm">Ranked by reputation, debate performance, and skill</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 mb-8 overflow-x-auto">
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

        {/* ── KARMA TAB ───────────────────────────────────────────────────────── */}
        {activeTab === 'karma' && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700">
              <h2 className="text-base font-semibold text-white">⚡ Karma Leaders</h2>
              <p className="text-xs text-gray-400 mt-0.5">Post votes + debate wins + quality bonuses</p>
            </div>
            {!karmaBoard?.length ? (
              <EmptyState message="No karma data yet. Start posting and debating!" />
            ) : (
              <div className="divide-y divide-slate-700/50">
                {karmaBoard.map(u => (
                  <div key={u.username} className="flex items-center justify-between px-6 py-4 hover:bg-slate-700/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-8 flex justify-center">
                        <RankDisplay rank={u.rank} />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">{u.username}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-bold ${u.karma >= 0 ? 'text-veil-purple' : 'text-red-400'}`}>
                        {u.karma >= 0 ? '+' : ''}{u.karma}
                      </p>
                      <p className="text-xs text-gray-500">karma</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── WIN RATE TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'overall' && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700">
              <h2 className="text-base font-semibold text-white">🏆 Top Debaters</h2>
              <p className="text-xs text-gray-400 mt-0.5">Ranked by win rate (min 3 debates)</p>
            </div>
            {!leaderboards?.overall?.length ? (
              <EmptyState message="No debate data yet. Complete a debate to appear here!" />
            ) : (
              <div className="divide-y divide-slate-700/50">
                {leaderboards.overall.map(u => (
                  <div key={u.username} className="flex items-center justify-between px-6 py-4 hover:bg-slate-700/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-8 flex justify-center">
                        <RankDisplay rank={u.rank} />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">{u.username}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <TierBadge tier={u.tier} />
                          <span className="text-xs text-gray-500">{u.totalDebates} debates</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-green-400">{u.winRate}%</p>
                      <p className="text-xs text-gray-500">win rate</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── IMPROVERS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'improvers' && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700">
              <h2 className="text-base font-semibold text-white">📈 Top Improvers</h2>
              <p className="text-xs text-gray-400 mt-0.5">Biggest performance growth over time</p>
            </div>
            {!leaderboards?.improvers?.length ? (
              <EmptyState message="No improvement data yet. Keep debating to track your growth!" />
            ) : (
              <div className="divide-y divide-slate-700/50">
                {leaderboards.improvers.map((u, i) => (
                  <div key={u.username} className="flex items-center justify-between px-6 py-4 hover:bg-slate-700/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-8 flex justify-center">
                        <RankDisplay rank={i + 1} />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">{u.username}</p>
                        <span className="text-xs px-2 py-0.5 bg-veil-purple/20 text-veil-purple rounded-full">
                          {u.velocity} growth
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-blue-400">+{u.growth}</p>
                      <p className="text-xs text-gray-500">growth score</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SKILLS TAB ──────────────────────────────────────────────────────── */}
        {activeTab === 'categories' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              { key: 'tone',     label: '🤝 Tone',     color: 'text-green-400' },
              { key: 'clarity',  label: '💬 Clarity',  color: 'text-blue-400' },
              { key: 'evidence', label: '📊 Evidence', color: 'text-purple-400' },
              { key: 'logic',    label: '🧠 Logic',    color: 'text-yellow-400' },
            ].map(({ key, label, color }) => (
              <div key={key} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700">
                  <h3 className="text-sm font-semibold text-white">{label}</h3>
                </div>
                {!leaderboards?.categoryLeaders?.[key]?.length ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-500">No data yet</div>
                ) : (
                  <div className="divide-y divide-slate-700/50">
                    {leaderboards.categoryLeaders[key].map(u => (
                      <div key={u.username} className="flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-6 flex justify-center">
                            <RankDisplay rank={u.rank} />
                          </div>
                          <span className="text-sm text-gray-200">{u.username}</span>
                        </div>
                        <span className={`font-bold text-sm ${color}`}>{u.score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default Leaderboard;