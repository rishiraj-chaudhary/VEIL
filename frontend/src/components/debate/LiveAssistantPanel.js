import React from 'react';

/**
 * LIVE ASSISTANT PANEL
 * 
 * Displays real-time suggestions while user types
 */
const LiveAssistantPanel = ({ insights, isAnalyzing, onDismiss }) => {
  console.log('🎨 Panel rendered with:', { insights, isAnalyzing });
  if (!insights || (!insights.suggestions?.length && !insights.warnings?.length && !insights.opportunities?.length)) {
    return null;
  }

  const { suggestions, warnings, opportunities } = insights;

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <h3 className="text-sm font-semibold text-white">Live Assistant</h3>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Analyzing Indicator */}
      {isAnalyzing && (
        <div className="p-3 bg-slate-900/50 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-gray-400">Analyzing...</span>
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Warnings (High Priority) */}
        {warnings?.length > 0 && (
          <div className="space-y-2">
            {warnings.map((warning, idx) => (
              <InsightCard
                key={`warning-${idx}`}
                insight={warning}
                color="red"
                icon="⚠️"
              />
            ))}
          </div>
        )}

        {/* Opportunities (Medium Priority) */}
        {opportunities?.length > 0 && (
          <div className="space-y-2">
            {opportunities.map((opp, idx) => (
              <InsightCard
                key={`opp-${idx}`}
                insight={opp}
                color="yellow"
                icon="💡"
              />
            ))}
          </div>
        )}

        {/* Suggestions (Low Priority) */}
        {suggestions?.length > 0 && (
          <div className="space-y-2">
            {suggestions.map((sug, idx) => (
              <InsightCard
                key={`sug-${idx}`}
                insight={sug}
                color="blue"
                icon="✨"
              />
            ))}
          </div>
        )}
      </div>

      {/* Stats Footer */}
      {insights.stats && (
        <div className="p-3 border-t border-slate-700 bg-slate-900/30">
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>Words: {insights.stats.wordCount}</span>
            {insights.stats.hasEvidence && (
              <span className="text-green-400">✓ Has evidence</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Individual insight card
 */
const InsightCard = ({ insight, color, icon }) => {
  const colorClasses = {
    red: 'bg-red-900/20 border-red-700/50 text-red-300',
    yellow: 'bg-yellow-900/20 border-yellow-700/50 text-yellow-300',
    blue: 'bg-blue-900/20 border-blue-700/50 text-blue-300'
  };

  return (
    <div className={`p-3 rounded border ${colorClasses[color]}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold mb-1">
            {insight.title}
          </h4>
          <p className="text-xs text-gray-300">
            {insight.message}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LiveAssistantPanel;