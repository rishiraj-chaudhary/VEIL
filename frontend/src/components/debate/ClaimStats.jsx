import axios from 'axios';
import { useEffect, useState } from 'react';

/**
 * CLAIM STATS COMPONENT
 * 
 * Shows statistics for a specific claim:
 * - Total uses across all debates
 * - Times refuted
 * - Success rate (win percentage)
 * - Related/similar claims
 * - Counter-claims that refute it
 */

const ClaimStats = ({ claimText, compact = false }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    if (claimText && claimText.trim().length > 10) {
      fetchClaimStats();
    }
  }, [claimText]);

  const fetchClaimStats = async () => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/knowledge-graph/claims/stats`,
        { claimText },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      setStats(response.data.data);
      setError(null);
    } catch (err) {
      if (err.response?.status === 404) {
        setStats(null); // Claim not in graph yet
      } else {
        setError('Failed to load claim stats');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-xs text-gray-500 italic">
        Loading claim stats...
      </div>
    );
  }

  if (error) {
    return null; // Silently fail
  }

  if (!stats) {
    return (
      <div className="text-xs text-gray-500 italic">
        🆕 First time this claim appears
      </div>
    );
  }

  // Compact mode - just show badge
  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="inline-flex items-center space-x-2 px-3 py-1 bg-purple-900/20 border border-purple-700/50 rounded-full text-xs text-purple-400 hover:bg-purple-900/30 transition-colors"
      >
        <span>📊</span>
        <span>Used {stats.stats.totalUses}x</span>
        {stats.stats.successRate > 0 && (
          <span className="text-green-400">• {stats.stats.successRate}% win rate</span>
        )}
        <span className="text-gray-500">▸</span>
      </button>
    );
  }

  // Full stats display
  return (
    <div className="bg-slate-800/50 border border-purple-700/30 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-purple-400">📊</span>
          <span className="text-sm font-semibold text-white">Knowledge Graph</span>
        </div>
        {compact && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-gray-500 hover:text-gray-400"
          >
            Collapse ▾
          </button>
        )}
      </div>

      {/* Topic Badge */}
      <div className="flex items-center space-x-2">
        <span className="px-2 py-1 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-300">
          {stats.topic}
        </span>
        <span className="text-xs text-gray-500">
          "{stats.originalText.substring(0, 60)}..."
        </span>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900/50 rounded p-3">
          <div className="text-2xl font-bold text-white">
            {stats.stats.totalUses}
          </div>
          <div className="text-xs text-gray-400">Times Used</div>
        </div>

        <div className="bg-slate-900/50 rounded p-3">
          <div className="text-2xl font-bold text-orange-400">
            {stats.stats.timesRefuted}
          </div>
          <div className="text-xs text-gray-400">Times Refuted</div>
        </div>

        {stats.stats.winsWithClaim + stats.stats.lossesWithClaim > 0 && (
          <>
            <div className="bg-slate-900/50 rounded p-3">
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl font-bold text-green-400">
                  {stats.stats.successRate}%
                </span>
              </div>
              <div className="text-xs text-gray-400">Win Rate</div>
            </div>

            <div className="bg-slate-900/50 rounded p-3">
              <div className="text-2xl font-bold text-blue-400">
                {stats.stats.avgQualityScore}
              </div>
              <div className="text-xs text-gray-400">Avg Quality</div>
            </div>
          </>
        )}
      </div>

      {/* Related Claims */}
      {stats.relatedClaims && stats.relatedClaims.length > 0 && (
        <div className="pt-2 border-t border-slate-700">
          <div className="text-xs font-semibold text-gray-400 mb-2">
            🔗 Similar Claims ({stats.relatedClaims.length})
          </div>
          <div className="space-y-1">
            {stats.relatedClaims.slice(0, 3).map((related, idx) => (
              <div
                key={idx}
                className="text-xs text-gray-300 bg-slate-900/30 rounded p-2"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-purple-400">{related.similarity}% similar</span>
                  <span className="text-gray-500">{related.uses} uses</span>
                </div>
                <div className="text-gray-400">"{related.text.substring(0, 80)}..."</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Counter Claims */}
      {stats.counterClaims && stats.counterClaims.length > 0 && (
        <div className="pt-2 border-t border-slate-700">
          <div className="text-xs font-semibold text-gray-400 mb-2">
            ⚔️ Common Refutations ({stats.counterClaims.length})
          </div>
          <div className="space-y-1">
            {stats.counterClaims.slice(0, 2).map((counter, idx) => (
              <div
                key={idx}
                className="text-xs text-gray-300 bg-red-900/10 border border-red-700/30 rounded p-2"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-red-400">
                    {counter.effectiveness}/10 effectiveness
                  </span>
                  <span className="text-gray-500">{counter.uses} uses</span>
                </div>
                <div className="text-gray-400">"{counter.text.substring(0, 80)}..."</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insight */}
      {stats.stats.totalUses >= 5 && (
        <div className="pt-2 border-t border-slate-700">
          <div className="text-xs text-gray-400 italic">
            💡 This is a {stats.stats.totalUses >= 10 ? 'commonly used' : 'frequently appearing'} argument
            {stats.stats.successRate >= 60 && ' with strong persuasive power'}
            {stats.stats.timesRefuted >= 3 && ' but has been successfully challenged before'}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClaimStats;