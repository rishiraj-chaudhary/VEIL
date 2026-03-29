/**
 * WEEKLY INSIGHT PANEL — Phase 10 (improved)
 * Place at: frontend/src/components/coach/WeeklyInsightPanel.jsx
 */

import axios from 'axios';
import { useEffect, useState } from 'react';

const BADGE_META = {
  clarifier_1:     { color: 'text-cyan-400',   bg: 'bg-cyan-900/20 border-cyan-700/40' },
  rebutter_1:      { color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-700/40' },
  synthesizer_1:   { color: 'text-purple-400', bg: 'bg-purple-900/20 border-purple-700/40' },
  mediator_1:      { color: 'text-green-400',  bg: 'bg-green-900/20 border-green-700/40' },
  evidence_master_1: { color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-700/40' },
  logic_shield_1:  { color: 'text-red-400',    bg: 'bg-red-900/20 border-red-700/40' },
  first_win:       { color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-700/40' },
  five_debates:    { color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-700/40' },
  ten_debates:     { color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-700/40' },
};

const AchievementPill = ({ a }) => {
  const meta = BADGE_META[a.id] || { color: 'text-gray-300', bg: 'bg-slate-700/50 border-slate-600' };
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${meta.bg}`}>
      <span className="text-xl shrink-0">{a.icon}</span>
      <div className="min-w-0">
        <div className={`text-xs font-semibold ${meta.color} truncate`}>{a.name}</div>
        <div className="text-xs text-gray-500 truncate">{a.description}</div>
      </div>
    </div>
  );
};

const WeeklyInsightPanel = ({ userId, token }) => {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [running, setRunning]     = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded]   = useState(true);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { fetchInsight(); }, []); // eslint-disable-line

  const fetchInsight = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/coach/achievements/weekly?userId=${userId}`, { headers });
      setData(res.data.data);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const runAnalysis = async () => {
    setRunning(true);
    try {
      await axios.post(`${API_URL}/api/coach/achievements/analyse`, {}, { headers });
      await fetchInsight();
    } catch { /* silent */ } finally { setRunning(false); }
  };

  if (dismissed || loading) return null;

  const hasHighlight = !!data?.highlight;
  // Only show badges earned in last 7 days — filter strictly by earnedAt
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const newBadges = (data?.recentAchievements || []).filter(
    a => new Date(a.earnedAt) >= weekAgo
  );
  const hasNewBadges = newBadges.length > 0;

  // Nothing to show yet — prompt to run
  if (!hasHighlight && !hasNewBadges) {
    return (
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-veil-purple/20 flex items-center justify-center shrink-0">
              <span className="text-veil-purple text-sm">✦</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Weekly AI Analysis</p>
              <p className="text-xs text-gray-400">Unlock personalised insights and achievement badges</p>
            </div>
          </div>
          <button
            onClick={runAnalysis}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-veil-purple hover:bg-veil-indigo text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shrink-0"
          >
            {running
              ? <><div className="w-3 h-3 border-t border-white rounded-full animate-spin" /> Analysing…</>
              : '✦ Run Analysis'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-veil-purple/25 bg-gradient-to-br from-slate-800 to-slate-900 mb-6 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <span className="text-veil-purple">✦</span>
          <span className="text-xs font-semibold text-veil-purple uppercase tracking-wider">This Week</span>
          {data?.totalAchievements > 0 && (
            <span className="px-2 py-0.5 bg-veil-purple/15 text-veil-purple/80 text-xs rounded-full">
              {data.totalAchievements} total achievements
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runAnalysis}
            disabled={running}
            className="text-xs text-gray-500 hover:text-veil-purple transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            {running
              ? <><div className="w-2.5 h-2.5 border-t border-veil-purple rounded-full animate-spin" /> Refreshing</>
              : '↻ Refresh'}
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button onClick={() => setDismissed(true)} className="text-gray-600 hover:text-gray-400">✕</button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 py-4 space-y-4">

          {/* AI highlight */}
          {hasHighlight && (
            <div className="flex items-start gap-3">
              <span className="text-veil-purple mt-0.5 shrink-0 text-sm">✦</span>
              <p className="text-sm text-gray-200 leading-relaxed">{data.highlight}</p>
            </div>
          )}

          {/* New badges earned this week */}
          {hasNewBadges && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2.5">
                🎖 Earned this week
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {newBadges.map(a => <AchievementPill key={a.id} a={a} />)}
              </div>
            </div>
          )}

          {/* Has highlight but no new badges */}
          {hasHighlight && !hasNewBadges && (
            <p className="text-xs text-gray-500 flex items-center gap-2 pt-1">
              <span>🎯</span>
              Keep debating this week to unlock new achievement badges.
            </p>
          )}

        </div>
      )}
    </div>
  );
};

export default WeeklyInsightPanel;