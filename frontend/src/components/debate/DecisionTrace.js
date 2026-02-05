import React from 'react';

/**
 * DECISION TRACE COMPONENT
 * Shows step-by-step AI reasoning
 */
const DecisionTrace = ({ trace, sources }) => {
  if (!trace || trace.length === 0) {
    return null;
  }

  const getStepIcon = (step) => {
    const stepLower = step.toLowerCase();
    if (stepLower.includes('retrieved') || stepLower.includes('found')) return '🔍';
    if (stepLower.includes('✓') || stepLower.includes('match')) return '✓';
    if (stepLower.includes('⚠️') || stepLower.includes('warning')) return '⚠️';
    if (stepLower.includes('extracted')) return '📋';
    if (stepLower.includes('detected')) return '🎯';
    if (stepLower.includes('no ') || stepLower.includes('none')) return '○';
    return '•';
  };

  const getStepColor = (step) => {
    const stepLower = step.toLowerCase();
    if (stepLower.includes('✓') || stepLower.includes('match') || stepLower.includes('verified')) {
      return 'text-green-400';
    }
    if (stepLower.includes('⚠️') || stepLower.includes('warning') || stepLower.includes('flag')) {
      return 'text-yellow-400';
    }
    if (stepLower.includes('no ') || stepLower.includes('none') || stepLower.includes('lack')) {
      return 'text-gray-400';
    }
    return 'text-blue-400';
  };

  return (
    <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
        <span>🔍</span>
        <span>AI Decision Trace</span>
      </h4>

      {/* Decision Steps */}
      <div className="space-y-2">
        {trace.map((step, index) => (
          <div
            key={index}
            className="flex items-start gap-2 text-sm"
          >
            <span className={`${getStepColor(step)} flex-shrink-0 mt-0.5`}>
              {getStepIcon(step)}
            </span>
            <span className={`${getStepColor(step)}`}>
              {step}
            </span>
          </div>
        ))}
      </div>

      {/* Sources Used */}
      {sources && sources.length > 0 && (
        <div className="pt-3 border-t border-slate-700">
          <h5 className="text-xs font-semibold text-gray-400 mb-2">
            Knowledge Sources Used:
          </h5>
          <div className="space-y-1">
            {sources.slice(0, 5).map((source, index) => (
              <div
                key={index}
                className="text-xs text-gray-500 flex items-center gap-2"
              >
                <span className="text-veil-purple">📚</span>
                <span>{source}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RAG Info */}
      <div className="pt-2 border-t border-slate-700">
        <p className="text-xs text-gray-500 italic">
          Analysis powered by RAG (Retrieval-Augmented Generation) using {sources?.length || 0} knowledge sources
        </p>
      </div>
    </div>
  );
};

export default DecisionTrace;