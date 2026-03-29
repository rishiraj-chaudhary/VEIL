/**
 * COMMUNITY MEMORY PANEL — fixed
 * - Removed postCount < 3 guard (was silently hiding panel when postCount=0/undefined)
 * - useEffect now properly re-fetches when communityName changes
 * - Shows empty state instead of null when no memory yet
 *
 * Place at: frontend/src/components/community/CommunityMemoryPanel.jsx
 */

import { useEffect, useState } from 'react';
import api from '../../services/api';

const TONE_COLORS = {
  civil:      'text-green-400',
  mixed:      'text-yellow-400',
  aggressive: 'text-red-400',
};

const STYLE_COLORS = {
  technical: 'text-blue-400',
  balanced:  'text-gray-300',
  emotional: 'text-orange-400',
};

const FREQ_COLORS = {
  high:   'bg-veil-purple/20 text-veil-purple border-veil-purple/30',
  medium: 'bg-slate-700 text-gray-300 border-slate-600',
  low:    'bg-slate-800 text-gray-500 border-slate-700',
};

const PolarizationBar = ({ score }) => {
  if (score == null) return null;
  const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-yellow-500' : 'bg-green-500';
  const label = score >= 70 ? 'Battleground' : score >= 40 ? 'Active debate' : 'Cohesive';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">Polarization</span>
        <span className="text-xs text-gray-500">{label} · {score}/100</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
};

const CommunityMemoryPanel = ({ communityName }) => {
  const [memory, setMemory]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError]       = useState(null);

  // ── FIX: include communityName in deps so it re-fetches on switch ────────────
  useEffect(() => {
    if (!communityName) return;
    setMemory(null);
    setError(null);
    fetchMemory();
  }, [communityName]); // eslint-disable-line

  const fetchMemory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/communities/${communityName}/memory`);
      setMemory(res.data.data.memory);
    } catch {
      setError('Community insights unavailable');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/communities/${communityName}/memory/analyse`);
      setMemory(res.data.data.memory);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  if (!communityName) return null;

  if (loading && !memory) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-3">
        <div className="animate-spin h-4 w-4 border-t-2 border-veil-purple rounded-full" />
        Analysing community…
      </div>
    );
  }

  // ── FIX: show a light empty state instead of returning null ──────────────────
  if (error || !memory || !memory.onboardingSummary) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 mt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-veil-purple text-sm">✦</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Community Intelligence</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-veil-purple transition-colors disabled:opacity-50"
          >
            {loading ? 'Analysing…' : '↻ Analyse'}
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5">
          {error || 'No analysis yet — click Analyse to generate community insights.'}
        </p>
      </div>
    );
  }

  const tone      = memory.toneProfile;
  const civColor  = TONE_COLORS[tone?.civility]  || 'text-gray-400';
  const styleColor = STYLE_COLORS[tone?.style]   || 'text-gray-400';

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden mt-4">

      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-veil-purple text-sm">✦</span>
            <span className="text-xs font-semibold text-veil-purple uppercase tracking-wider">Community Intelligence</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed line-clamp-2">{memory.onboardingSummary}</p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-4 space-y-5">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tone</h4>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-16">Civility</span>
                  <span className={`text-xs font-medium ${civColor}`}>{tone?.civility || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-16">Style</span>
                  <span className={`text-xs font-medium ${styleColor}`}>{tone?.style || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-16">Depth</span>
                  <span className="text-xs text-gray-300">{tone?.depth || '—'}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <PolarizationBar score={memory.polarizationScore} />
            </div>
          </div>

          {memory.topicClusters?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Main Topics</h4>
              <div className="flex flex-wrap gap-2">
                {memory.topicClusters.map((cluster, i) => (
                  <div key={i} className="group relative">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border cursor-default ${FREQ_COLORS[cluster.frequency] || FREQ_COLORS.medium}`}>
                      {cluster.name}
                    </span>
                    {cluster.description && (
                      <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900 border border-slate-600 rounded-lg p-2 text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {cluster.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {memory.recurringClaims?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Recurring Debates</h4>
              <div className="space-y-2">
                {memory.recurringClaims.map((claim, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-slate-900/50 rounded-lg">
                    <span className="text-veil-purple text-xs mt-0.5 shrink-0">⚖</span>
                    <div>
                      <p className="text-xs text-gray-300">{claim.claim}</p>
                      {claim.sides?.length === 2 && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-green-500">For: {claim.sides[0]}</span>
                          <span className="text-gray-600">·</span>
                          <span className="text-xs text-red-400">Against: {claim.sides[1]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
            <span className="text-xs text-gray-600">
              Based on {memory.postCountAtAnalysis} posts
              {memory.analysedAt && ` · ${new Date(memory.analysedAt).toLocaleDateString()}`}
            </span>
            <button
              onClick={handleRefresh}
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

export default CommunityMemoryPanel;