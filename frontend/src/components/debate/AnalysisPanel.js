import React, { useState } from 'react';
import DecisionTrace from './DecisionTrace';
import ScoreExplainer from './ScoreExplainer';

/**
 * ANALYSIS PANEL COMPONENT
 * Full expandable AI analysis display
 */
const AnalysisPanel = ({ aiAnalysis }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!aiAnalysis) {
    return null;
  }

  const {
    toneScore,
    clarityScore,
    evidenceQuality,
    overallQuality,
    fallacies = [],
    claims = [],
    rebuttals = [],
    factCheck,
    decisionTrace = [],
    retrievedSources = []
  } = aiAnalysis;

  const hasScores = toneScore || clarityScore || evidenceQuality || overallQuality;
  const hasContent = hasScores || fallacies.length > 0 || factCheck;

  if (!hasContent) {
    return (
      <div className="text-xs text-gray-500 italic">
        Analysis in progress...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact View - Always Visible */}
      <div className="space-y-1.5">
        {/* Scores */}
        {hasScores && (
          <div className="space-y-1">
            {toneScore !== undefined && (
              <ScoreExplainer
                score={toneScore}
                type="toneScore"
              />
            )}
            {clarityScore !== undefined && (
              <ScoreExplainer
                score={clarityScore}
                type="clarityScore"
              />
            )}
            {evidenceQuality !== undefined && (
              <ScoreExplainer
                score={evidenceQuality}
                type="evidenceQuality"
              />
            )}
          </div>
        )}

        {/* Fact Check */}
        {factCheck && (
          <div className="flex items-center gap-2 p-2 rounded bg-slate-900/30">
            {factCheck.verified ? (
              <>
                <span className="text-green-400 text-sm">✓</span>
                <span className="text-green-400 text-xs">
                  Claims verified ({factCheck.overallConfidence}% confidence)
                </span>
              </>
            ) : (
              <>
                <span className="text-yellow-400 text-sm">⚠️</span>
                <span className="text-yellow-400 text-xs">
                  {factCheck.flags?.length || 0} unverified claim(s)
                </span>
              </>
            )}
          </div>
        )}

        {/* Fallacies */}
        {fallacies.length > 0 && (
          <div className="space-y-1">
            {fallacies.map((fallacy, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-2 rounded bg-red-900/10 border border-red-700/30"
              >
                <span className="text-red-400 text-sm flex-shrink-0">⚠️</span>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-red-400">
                    {fallacy.type || 'Logical Fallacy'}
                  </div>
                  <div className="text-xs text-red-300/80">
                    {fallacy.explanation}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expand/Collapse Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-2 px-3 bg-slate-700/50 hover:bg-slate-700 text-gray-300 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
      >
        <span>{isExpanded ? '▼' : '▶'}</span>
        <span>{isExpanded ? 'Hide' : 'Show'} Full Analysis</span>
      </button>

      {/* Expanded View */}
      {isExpanded && (
        <div className="space-y-4 pt-3 border-t border-slate-700">
          {/* Decision Trace */}
          {decisionTrace.length > 0 && (
            <DecisionTrace
              trace={decisionTrace}
              sources={retrievedSources}
            />
          )}

          {/* Claims */}
          {claims.length > 0 && (
            <div className="bg-slate-900/30 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-gray-400 mb-2">
                📋 Claims Identified ({claims.length})
              </h5>
              <div className="space-y-1">
                {claims.map((claim, index) => (
                  <div key={index} className="text-xs text-gray-300 pl-4">
                    • {claim}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rebuttals */}
          {rebuttals.length > 0 && (
            <div className="bg-slate-900/30 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-gray-400 mb-2">
                🎯 Rebuttals Identified ({rebuttals.length})
              </h5>
              <div className="space-y-1">
                {rebuttals.map((rebuttal, index) => (
                  <div key={index} className="text-xs text-gray-300 pl-4">
                    • {rebuttal}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fact Check Details */}
          {factCheck && factCheck.checks && factCheck.checks.length > 0 && (
            <div className="bg-slate-900/30 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-gray-400 mb-2">
                🔍 Fact Check Details
              </h5>
              <div className="space-y-2">
                {factCheck.checks.map((check, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded text-xs ${
                      check.supported
                        ? 'bg-green-900/20 border border-green-700/30'
                        : 'bg-yellow-900/20 border border-yellow-700/30'
                    }`}
                  >
                    <div className="font-medium mb-1">
                      <span className={check.supported ? 'text-green-400' : 'text-yellow-400'}>
                        {check.supported ? '✓' : '⚠️'}
                      </span>
                      {' '}
                      <span className="text-gray-300">
                        {check.claim?.substring(0, 80)}
                        {check.claim?.length > 80 ? '...' : ''}
                      </span>
                    </div>
                    <div className="text-gray-400 text-xs">
                      {check.reasoning}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      Confidence: {check.confidence ? Math.round(check.confidence * 100) : 0}% ({check.level})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overall Quality */}
          {overallQuality !== undefined && (
            <div className="bg-slate-900/30 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-gray-400 mb-2">
                ⭐ Overall Quality
              </h5>
              <ScoreExplainer
                score={overallQuality}
                type="overallQuality"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalysisPanel;