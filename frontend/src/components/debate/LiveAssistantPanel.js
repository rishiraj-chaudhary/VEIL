
/**
 * LIVE ASSISTANT PANEL — Phase 13
 * Shows real-time warnings, opportunities, suggestions, and argument strength.
 *
 * Place at: frontend/src/components/debate/LiveAssistantPanel.jsx
 */

const COLOR = {
  red:    'bg-red-900/20 border-red-700/50 text-red-300',
  yellow: 'bg-yellow-900/20 border-yellow-700/50 text-yellow-300',
  blue:   'bg-blue-900/20 border-blue-700/50 text-blue-300',
};

const InsightCard = ({ insight, color, icon }) => (
  <div className={`p-3 rounded-lg border ${COLOR[color]}`}>
    <div className="flex items-start gap-2">
      <span className="text-base shrink-0">{icon}</span>
      <div>
        <h4 className="text-sm font-semibold mb-0.5">{insight.title}</h4>
        <p className="text-xs text-gray-300 leading-relaxed">{insight.message}</p>
      </div>
    </div>
  </div>
);

const StrengthBar = ({ score }) => {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  const label = score >= 70 ? 'Strong' : score >= 40 ? 'Developing' : 'Weak';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Argument Strength</span>
        <span className={score >= 70 ? 'text-green-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'}>
          {label} · {score}/100
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
};

const LiveAssistantPanel = ({ insights, isAnalyzing }) => {
  const hasContent =
    insights?.warnings?.length ||
    insights?.opportunities?.length ||
    insights?.suggestions?.length;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isAnalyzing ? 'bg-yellow-400 animate-pulse' : hasContent ? 'bg-green-500' : 'bg-slate-600'}`} />
          <span className="text-sm font-semibold text-white">Live Assistant</span>
        </div>
        {isAnalyzing && (
          <span className="text-xs text-gray-500 animate-pulse">Analysing…</span>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* Strength bar */}
        {insights?.stats?.strengthScore != null && (
          <StrengthBar score={insights.stats.strengthScore} />
        )}

        {/* No content yet */}
        {!hasContent && !isAnalyzing && (
          <p className="text-xs text-gray-500 text-center py-4 leading-relaxed">
            Start typing your argument and I'll provide real-time feedback on fallacies, rebuttals, and evidence.
          </p>
        )}

        {/* Warnings */}
        {insights?.warnings?.map((w, i) => (
          <InsightCard key={`w-${i}`} insight={w} color="red" icon="⚠️" />
        ))}

        {/* Opportunities */}
        {insights?.opportunities?.map((o, i) => (
          <InsightCard key={`o-${i}`} insight={o} color="yellow" icon="💡" />
        ))}

        {/* Suggestions */}
        {insights?.suggestions?.map((s, i) => (
          <InsightCard key={`s-${i}`} insight={s} color="blue" icon="✨" />
        ))}

        {/* Stats footer */}
        {insights?.stats && (
          <div className="pt-3 border-t border-slate-700 flex items-center gap-4 text-xs text-gray-500">
            <span>{insights.stats.wordCount} words</span>
            {insights.stats.hasEvidence && (
              <span className="text-green-400">✓ Evidence cited</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveAssistantPanel;