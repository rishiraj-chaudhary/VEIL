/**
 * COMMUNITY HEALTH PANEL — Phase 9
 *
 * Displays community health score, risk level, trend metrics, and
 * moderator intervention suggestion on the CommunityPage.
 *
 * Usage:
 *   import CommunityHealthPanel from '../components/community/CommunityHealthPanel';
 *   <CommunityHealthPanel communityName={name} />
 *
 * Place at: frontend/src/components/community/CommunityHealthPanel.jsx
 */

import { useEffect, useState } from 'react';
import api from '../../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_CONFIG = {
  healthy:  { color: 'text-green-400',  bg: 'bg-green-500',  border: 'border-green-800/40',  label: 'Healthy' },
  watch:    { color: 'text-yellow-400', bg: 'bg-yellow-500', border: 'border-yellow-800/40', label: 'Watch' },
  concern:  { color: 'text-orange-400', bg: 'bg-orange-500', border: 'border-orange-800/40', label: 'Concern' },
  critical: { color: 'text-red-400',    bg: 'bg-red-500',    border: 'border-red-800/40',    label: 'Critical' },
};

const TREND_CONFIG = {
  rising:  { color: 'text-red-400',    icon: '↑', label: 'Rising' },
  stable:  { color: 'text-gray-400',   icon: '→', label: 'Stable' },
  falling: { color: 'text-green-400',  icon: '↓', label: 'Falling' },
};

const MetricRow = ({ label, value, color, suffix = '' }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-slate-700/50 last:border-0">
    <span className="text-xs text-gray-400">{label}</span>
    <span className={`text-xs font-medium ${color || 'text-gray-300'}`}>{value}{suffix}</span>
  </div>
);

const ScoreRing = ({ score, riskLevel }) => {
  if (score === null) return null;
  const cfg = RISK_CONFIG[riskLevel] || RISK_CONFIG.healthy;
  const circumference = 2 * Math.PI * 20;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#1e293b" strokeWidth="4" />
          <circle
            cx="24" cy="24" r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cfg.color}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-sm font-bold ${cfg.color}`}>{score}</span>
        </div>
      </div>
      <span className={`text-xs font-semibold mt-1 ${cfg.color}`}>{cfg.label}</span>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const CommunityHealthPanel = ({ communityName }) => {
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!communityName) return;
    fetchHealth();
  }, [communityName]); // eslint-disable-line

  const fetchHealth = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = force
        ? `/communities/${communityName}/health/analyse`
        : `/communities/${communityName}/health`;
      const method = force ? 'post' : 'get';
      const res = await api[method](url);
      setHealth(res.data.data.health);
    } catch {
      setError('Health data unavailable');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !health) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
        <div className="animate-spin h-3 w-3 border-t-2 border-veil-purple rounded-full" />
        Analysing community health…
      </div>
    );
  }

  if (error || !health || health.healthScore === null) return null;

  const risk  = RISK_CONFIG[health.riskLevel]  || RISK_CONFIG.healthy;
  const trend = TREND_CONFIG[health.toxicityTrend] || TREND_CONFIG.stable;

  return (
    <div className={`rounded-lg border ${risk.border} bg-slate-800/50 overflow-hidden mt-3`}>

      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Community Health</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${risk.border} ${risk.color}`}>
            {risk.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${risk.bg} rounded-full transition-all`}
                style={{ width: `${health.healthScore}%` }}
              />
            </div>
            <span className={`text-xs font-bold ${risk.color}`}>{health.healthScore}/100</span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-4">
          <div className="grid grid-cols-2 gap-6">

            {/* Score ring + metrics */}
            <div className="flex items-start gap-4">
              <ScoreRing score={health.healthScore} riskLevel={health.riskLevel} />
              <div className="flex-1">
                <MetricRow
                  label="Toxicity"
                  value={`${health.toxicityRate ?? 0}%`}
                  color={health.toxicityRate > 20 ? 'text-red-400' : 'text-green-400'}
                />
                <MetricRow
                  label="Toxicity trend"
                  value={`${trend.icon} ${trend.label}`}
                  color={trend.color}
                />
                <MetricRow
                  label="Polarization"
                  value={`${health.polarizationScore ?? 0}/100`}
                  color={health.polarizationScore > 65 ? 'text-orange-400' : 'text-gray-300'}
                />
              </div>
            </div>

            {/* Participation metrics */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Participation</h4>
              <MetricRow
                label="Contributors"
                value={health.uniqueContributors ?? '—'}
                color="text-gray-300"
              />
              <MetricRow
                label="Top user share"
                value={`${health.dominantUserShare ?? 0}%`}
                color={health.dominantUserShare > 50 ? 'text-orange-400' : 'text-gray-300'}
              />
              <MetricRow
                label="Imbalance"
                value={`${health.participationImbalance ?? 0}%`}
                color={health.participationImbalance > 70 ? 'text-orange-400' : 'text-gray-300'}
              />
              <MetricRow
                label="Thread escalation"
                value={`${health.escalationRate ?? 0}%`}
                color={health.escalationRate > 30 ? 'text-red-400' : 'text-gray-300'}
              />
            </div>
          </div>

          {/* Intervention suggestion */}
          {health.interventionSuggestion && (
            <div className={`mt-4 p-3 rounded-lg border ${risk.border} bg-slate-900/50`}>
              <div className="flex items-start gap-2">
                <span className={`text-sm shrink-0 mt-0.5 ${risk.color}`}>💡</span>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {health.interventionSuggestion}
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-700/50">
            <span className="text-xs text-gray-600">
              {health.analysedAt && `Analysed ${new Date(health.analysedAt).toLocaleDateString()}`}
            </span>
            <button
              onClick={() => fetchHealth(true)}
              disabled={loading}
              className="text-xs text-gray-500 hover:text-veil-purple transition-colors disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunityHealthPanel;