/**
 * THREAD ANALYSIS PANEL — Step 13
 *
 * Shows full ThreadEvolutionGraph results on a post's detail page.
 * Import and render inside PostDetail.js after the comment list.
 *
 * Usage:
 *   import ThreadAnalysisPanel from '../components/thread/ThreadAnalysisPanel';
 *   <ThreadAnalysisPanel postId={post._id} commentCount={post.commentCount} />
 */

import { useEffect, useState } from 'react';
import api from '../../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  thriving:          { color: 'text-emerald-400', bg: 'bg-emerald-900/20', border: 'border-emerald-700/40', bar: 'bg-emerald-500', emoji: '🌿' },
  healthy:           { color: 'text-green-400',   bg: 'bg-green-900/20',   border: 'border-green-700/40',   bar: 'bg-green-500',   emoji: '✅' },
  mixed:             { color: 'text-yellow-400',  bg: 'bg-yellow-900/20',  border: 'border-yellow-700/40',  bar: 'bg-yellow-500',  emoji: '⚖️' },
  troubled:          { color: 'text-orange-400',  bg: 'bg-orange-900/20',  border: 'border-orange-700/40',  bar: 'bg-orange-500',  emoji: '⚠️' },
  toxic:             { color: 'text-red-400',      bg: 'bg-red-900/20',     border: 'border-red-700/40',     bar: 'bg-red-500',     emoji: '🔥' },
  insufficient_data: { color: 'text-gray-400',    bg: 'bg-slate-800',      border: 'border-slate-700',      bar: 'bg-slate-600',   emoji: '💬' },
};

const SENTIMENT_COLORS = {
  positive: 'text-green-400',
  negative: 'text-red-400',
  neutral:  'text-gray-400',
  mixed:    'text-yellow-400',
};

const ROLE_COLORS = {
  constructive: 'bg-green-900/30 text-green-400 border-green-700/40',
  informative:  'bg-blue-900/30 text-blue-400 border-blue-700/40',
  balanced:     'bg-slate-700 text-gray-300 border-slate-600',
  humorous:     'bg-yellow-900/30 text-yellow-400 border-yellow-700/40',
  disruptive:   'bg-orange-900/30 text-orange-400 border-orange-700/40',
  inflammatory: 'bg-red-900/30 text-red-400 border-red-700/40',
};

const TURNING_POINT_ICONS = {
  tone_shift:      '🔄',
  topic_change:    '↗️',
  quality_drop:    '📉',
  quality_rise:    '📈',
  conflict_start:  '⚡',
  conflict_end:    '🕊️',
  insight:         '💡',
};

// ── Sub-components ────────────────────────────────────────────────────────────

const ScoreBar = ({ label, value, max = 100, color = 'bg-veil-purple' }) => (
  <div className="flex items-center gap-3">
    <span className="text-xs text-gray-400 w-28 shrink-0">{label}</span>
    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
    <span className="text-xs text-gray-500 w-8 text-right">{value}</span>
  </div>
);

const SentimentPhase = ({ label, data }) => {
  if (!data) return null;
  const color = SENTIMENT_COLORS[data.sentiment] || 'text-gray-400';
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className={`text-sm font-medium ${color}`}>{data.score}</div>
      <span className={`text-xs ${color}`}>{data.sentiment}</span>
    </div>
  );
};

// ── Main Panel ────────────────────────────────────────────────────────────────

const ThreadAnalysisPanel = ({ postId, commentCount = 0 }) => {
  const [analysis, setAnalysis]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => {
    if (!postId || commentCount < 3) return;
    fetchAnalysis();
  }, [postId]); // eslint-disable-line

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/thread/${postId}/analysis`);
      setAnalysis(res.data.data.analysis);
    } catch (err) {
      setError('Thread analysis unavailable');
    } finally {
      setLoading(false);
    }
  };

  const forceRefresh = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/thread/${postId}/analyse`);
      setAnalysis(res.data.data.analysis);
    } catch {
      setError('Re-analysis failed');
    } finally {
      setLoading(false);
    }
  };

  if (commentCount < 3) return null;
  if (loading && !analysis) {
    return (
      <div className="mt-6 flex items-center gap-2 text-gray-500 text-sm">
        <div className="animate-spin h-4 w-4 border-t-2 border-veil-purple rounded-full" />
        Analysing thread…
      </div>
    );
  }
  if (error) return null;
  if (!analysis || analysis.healthLabel === 'insufficient_data') return null;

  const cfg = HEALTH_CONFIG[analysis.healthLabel] || HEALTH_CONFIG.mixed;

  return (
    <div className={`mt-6 rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{cfg.emoji}</span>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${cfg.color}`}>
                Thread Health: {analysis.healthLabel.replace(/_/g, ' ')}
              </span>
              <span className={`text-xs font-bold ${cfg.color}`}>{analysis.healthScore}/100</span>
            </div>
            {analysis.sentimentArc?.arcSummary && (
              <p className="text-xs text-gray-500 mt-0.5">{analysis.sentimentArc.arcSummary}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini score bar */}
          <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full ${cfg.bar} rounded-full`} style={{ width: `${analysis.healthScore}%` }} />
          </div>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-4 space-y-5">

          {/* Score breakdown */}
          {analysis.scoreBreakdown && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Score Breakdown</h4>
              <div className="space-y-2">
                <ScoreBar label="Sentiment"     value={analysis.scoreBreakdown.sentiment}     color={cfg.bar} />
                <ScoreBar label="Topic focus"   value={analysis.scoreBreakdown.topicFocus}    color={cfg.bar} />
                <ScoreBar label="Voice quality" value={analysis.scoreBreakdown.voiceQuality}  color={cfg.bar} />
                <ScoreBar label="Participation" value={analysis.scoreBreakdown.participation} color={cfg.bar} />
              </div>
            </div>
          )}

          {/* Sentiment arc */}
          {analysis.sentimentArc && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sentiment Arc</h4>
              <div className="flex items-end justify-between gap-2 bg-slate-900/50 rounded-lg p-3">
                <SentimentPhase label="Early"  data={analysis.sentimentArc.early} />
                <div className="flex-1 flex items-center justify-center">
                  <div className="h-px flex-1 bg-slate-700" />
                  <span className="text-xs text-gray-500 mx-2">{analysis.sentimentArc.arc?.replace(/_/g, ' ')}</span>
                  <div className="h-px flex-1 bg-slate-700" />
                </div>
                <SentimentPhase label="Middle" data={analysis.sentimentArc.middle} />
                <div className="flex-1 flex items-center justify-center">
                  <div className="h-px flex-1 bg-slate-700" />
                </div>
                <SentimentPhase label="Late"   data={analysis.sentimentArc.late} />
              </div>
            </div>
          )}

          {/* Topic drift */}
          {analysis.topicDrift && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Topic Focus</h4>
              <div className="flex items-center gap-3 text-sm">
                <span className={analysis.topicDrift.onTopic ? 'text-green-400' : 'text-orange-400'}>
                  {analysis.topicDrift.onTopic ? '✓ On topic' : '⚠ Drifted'}
                </span>
                {analysis.topicDrift.driftedTo && (
                  <span className="text-gray-400 text-xs">→ {analysis.topicDrift.driftedTo}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">{analysis.topicDrift.driftSummary}</p>
            </div>
          )}

          {/* Turning points */}
          {analysis.turningPoints?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Turning Points</h4>
              <div className="space-y-2">
                {analysis.turningPoints.map((tp, i) => (
                  <div key={i} className="flex gap-3 p-2 bg-slate-900/50 rounded-lg">
                    <span className="text-lg shrink-0">{TURNING_POINT_ICONS[tp.type] || '📍'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-300">{tp.author}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${tp.impact === 'positive' ? 'bg-green-900/30 text-green-400' : tp.impact === 'negative' ? 'bg-red-900/30 text-red-400' : 'bg-slate-700 text-gray-400'}`}>
                          {tp.type?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{tp.description}</p>
                      {tp.commentSnippet && (
                        <p className="text-xs text-gray-600 mt-1 italic">"{tp.commentSnippet.slice(0, 100)}…"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dominant voices */}
          {analysis.dominantVoices?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dominant Voices</h4>
              <div className="space-y-2">
                {analysis.dominantVoices.slice(0, 4).map((v, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xs text-gray-500 w-5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-gray-300">u/{v.username}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${ROLE_COLORS[v.role] || ROLE_COLORS.balanced}`}>
                          {v.role}
                        </span>
                        <span className="text-xs text-gray-500">{v.commentCount} comments</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{v.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
            <span className="text-xs text-gray-600">
              Analysed {analysis.commentCountAtAnalysis} comments
              {analysis.analysedAt && ` · ${new Date(analysis.analysedAt).toLocaleDateString()}`}
            </span>
            <button
              onClick={forceRefresh}
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

export default ThreadAnalysisPanel;