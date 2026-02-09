import React, { useState } from 'react';

const DecisionTreeVisualization = ({ decisionTrace }) => {
  const [expandedSteps, setExpandedSteps] = useState(new Set());

  // Safety check
  if (!decisionTrace || !Array.isArray(decisionTrace)) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-gray-600">
        <p className="text-gray-400">No decision trace available.</p>
      </div>
    );
  }

  const toggleStep = (stepName) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepName)) {
      newExpanded.delete(stepName);
    } else {
      newExpanded.add(stepName);
    }
    setExpandedSteps(newExpanded);
  };

  const getImpactColor = (impact) => {
    switch (impact) {
      case 'positive': return 'border-green-500 bg-green-900/20';
      case 'negative': return 'border-red-500 bg-red-900/20';
      default: return 'border-blue-500 bg-blue-900/20';
    }
  };

  const getImpactIcon = (impact) => {
    switch (impact) {
      case 'positive': return '✅';
      case 'negative': return '❌';
      default: return 'ℹ️';
    }
  };

  const getStepIcon = (step) => {
    if (!step) return '•';
    
    const icons = {
      initialization: '🚀',
      knowledge_retrieval: '📚',
      fallacy_detection: '🔍',
      tone_analysis: '🗣️',
      clarity_analysis: '📝',
      evidence_analysis: '📊',
      claims_extraction: '💭',
      rebuttal_analysis: '⚔️',
      fact_check: '✓',
      overall_quality: '⭐',
      summary: '📋'
    };
    return icons[step] || '•';
  };

  // Filter out invalid traces
  const validTraces = decisionTrace.filter(trace => 
    trace && typeof trace === 'object' && trace.message
  );

  if (validTraces.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-gray-600">
        <p className="text-gray-400">No valid decision steps available.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-gray-600">
      <h4 className="text-xl font-bold text-white mb-4 flex items-center">
        <span className="mr-2">🌲</span>
        AI Decision Process
      </h4>

      <div className="space-y-3">
        {validTraces.map((trace, index) => {
          const stepName = trace.step || `step_${index}`;
          const isExpanded = expandedSteps.has(stepName);
          const hasDetails = trace.data && Object.keys(trace.data).length > 0;

          return (
            <div
              key={index}
              className={`border-l-4 ${getImpactColor(trace.impact)} rounded-r-lg transition-all`}
            >
              <div
                className={`p-4 ${hasDetails ? 'cursor-pointer hover:bg-slate-700/50' : ''} transition-colors`}
                onClick={() => hasDetails && toggleStep(stepName)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start flex-1">
                    <span className="text-2xl mr-3">
                      {getStepIcon(trace.step)}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white capitalize">
                          {trace.step ? trace.step.replace(/_/g, ' ') : 'Analysis Step'}
                        </span>
                        <span className="text-xl">{getImpactIcon(trace.impact)}</span>
                        {trace.score !== undefined && (
                          <span className={`text-sm font-bold ${
                            trace.score > 0 ? 'text-green-400' : trace.score < 0 ? 'text-red-400' : 'text-gray-400'
                          }`}>
                            {trace.score > 0 ? '+' : ''}{trace.score}
                          </span>
                        )}
                      </div>
                      <div className="text-gray-300 mt-1">
                        {trace.message}
                      </div>
                      {hasDetails && (
                        <div className="text-xs text-gray-500 mt-2">
                          {isExpanded ? '▼ Click to collapse' : '▶ Click to expand details'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && hasDetails && (
                  <div className="mt-4 pl-11 space-y-3 border-t border-gray-700 pt-3">
                    
                    {/* Tips */}
                    {trace.data.tips && Array.isArray(trace.data.tips) && trace.data.tips.length > 0 && (
                      <div className="bg-yellow-900/20 rounded p-3 border border-yellow-500/30">
                        <div className="text-yellow-400 font-semibold mb-2 text-sm">
                          💡 Tips for Improvement
                        </div>
                        <ul className="space-y-1 text-xs text-gray-300">
                          {trace.data.tips.map((tip, idx) => (
                            <li key={idx}>• {tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Reasoning */}
                    {trace.data.reasoning && (
                      <div className="bg-blue-900/20 rounded p-3 border border-blue-500/30">
                        <div className="text-blue-400 font-semibold mb-1 text-sm">
                          Reasoning
                        </div>
                        <div className="text-xs text-gray-300">
                          {trace.data.reasoning}
                        </div>
                      </div>
                    )}

                    {/* Formula */}
                    {trace.data.formula && (
                      <div className="bg-purple-900/20 rounded p-3 border border-purple-500/30">
                        <div className="text-purple-400 font-semibold mb-1 text-sm">
                          Formula
                        </div>
                        <code className="text-xs text-gray-300">
                          {trace.data.formula}
                        </code>
                      </div>
                    )}

                    {/* Breakdown */}
                    {trace.data.breakdown && typeof trace.data.breakdown === 'object' && (
                      <div className="bg-slate-700/50 rounded p-3">
                        <div className="text-white font-semibold mb-2 text-sm">
                          Score Breakdown
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(trace.data.breakdown).map(([key, value]) => (
                            <div key={key} className="bg-slate-600/50 rounded p-2">
                              <div className="text-xs text-gray-400 capitalize">
                                {key.replace(/_/g, ' ')}
                              </div>
                              <div className="text-sm text-white font-semibold">
                                {typeof value === 'object' 
                                  ? `${value.score || value.count || '-'} ${value.weight ? `(${value.weight})` : ''}`
                                  : value
                                }
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fallacies */}
                    {trace.data.fallacies && Array.isArray(trace.data.fallacies) && trace.data.fallacies.length > 0 && (
                      <div className="bg-red-900/20 rounded p-3 border border-red-500/30">
                        <div className="text-red-400 font-semibold mb-2 text-sm">
                          Detected Fallacies
                        </div>
                        <div className="space-y-2">
                          {trace.data.fallacies.map((fallacy, idx) => (
                            <div key={idx} className="bg-red-900/30 rounded p-2">
                              <div className="text-white font-semibold text-xs capitalize">
                                {fallacy.type}
                              </div>
                              <div className="text-xs text-gray-300 mt-1">
                                {fallacy.explanation}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Claims */}
                    {trace.data.claims && Array.isArray(trace.data.claims) && trace.data.claims.length > 0 && (
                      <div className="bg-green-900/20 rounded p-3 border border-green-500/30">
                        <div className="text-green-400 font-semibold mb-2 text-sm">
                          Extracted Claims
                        </div>
                        <ul className="space-y-1 text-xs text-gray-300">
                          {trace.data.claims.map((claim, idx) => (
                            <li key={idx}>• {claim}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Rebuttals */}
                    {trace.data.rebuttals && Array.isArray(trace.data.rebuttals) && trace.data.rebuttals.length > 0 && (
                      <div className="bg-orange-900/20 rounded p-3 border border-orange-500/30">
                        <div className="text-orange-400 font-semibold mb-2 text-sm">
                          Rebuttals
                        </div>
                        <ul className="space-y-1 text-xs text-gray-300">
                          {trace.data.rebuttals.map((rebuttal, idx) => (
                            <li key={idx}>• {rebuttal}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Strengths/Weaknesses */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {trace.data.strengths && Array.isArray(trace.data.strengths) && trace.data.strengths.length > 0 && (
                        <div className="bg-green-900/20 rounded p-3 border border-green-500/30">
                          <div className="text-green-400 font-semibold mb-2 text-sm">
                            ✅ Strengths
                          </div>
                          <ul className="space-y-1 text-xs text-gray-300">
                            {trace.data.strengths.map((strength, idx) => (
                              <li key={idx}>• {strength}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {trace.data.weaknesses && Array.isArray(trace.data.weaknesses) && trace.data.weaknesses.length > 0 && (
                        <div className="bg-red-900/20 rounded p-3 border border-red-500/30">
                          <div className="text-red-400 font-semibold mb-2 text-sm">
                            ⚠️ Weaknesses
                          </div>
                          <ul className="space-y-1 text-xs text-gray-300">
                            {trace.data.weaknesses.map((weakness, idx) => (
                              <li key={idx}>• {weakness}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DecisionTreeVisualization;