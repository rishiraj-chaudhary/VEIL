import React from 'react';

const ScoreBreakdownModal = ({ turn, onClose }) => {
  if (!turn?.aiAnalysis) return null;

  const { aiAnalysis } = turn;
  
  // Handle both old and new formats
  let decisionTrace = aiAnalysis.decisionTrace || [];
  if (Array.isArray(decisionTrace) && decisionTrace.length > 0 && typeof decisionTrace[0] === 'string') {
    decisionTrace = decisionTrace.map((message, index) => ({
      step: `legacy_step_${index}`,
      message: message,
      impact: 'neutral',
      data: {}
    }));
  }
  
  const { overallQuality, toneScore, clarityScore, evidenceQuality } = aiAnalysis;

  const getTraceStep = (stepName) => {
    return decisionTrace.find(step => step.step === stepName);
  };

  const toneStep = getTraceStep('tone_analysis');
  const clarityStep = getTraceStep('clarity_analysis');
  const evidenceStep = getTraceStep('evidence_analysis');
  const fallacyStep = getTraceStep('fallacy_detection');
  const overallStep = getTraceStep('overall_quality');

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-purple-500/30">
        
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-gray-700 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">
            📊 Detailed Score Breakdown
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Overall Score */}
          <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg p-6 border border-purple-500/30">
            <div className="text-center">
              <div className="text-gray-300 mb-2">Overall Quality Score</div>
              <div className="text-6xl font-bold text-white mb-3">
                {overallQuality}
                <span className="text-2xl text-gray-400">/100</span>
              </div>
              <div className="text-lg text-gray-300">
                {overallStep?.data?.category || (overallQuality >= 80 ? 'Excellent' : overallQuality >= 60 ? 'Good' : overallQuality >= 40 ? 'Fair' : 'Poor')}
              </div>
            </div>
          </div>

          {/* Component Scores */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Tone */}
            <div className="bg-slate-800 rounded-lg p-5 border border-gray-600">
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">🗣️</div>
                <div className="text-2xl font-bold text-white">{toneScore}</div>
                <div className="text-sm text-gray-400">Tone</div>
              </div>
              <div className="text-xs text-gray-300 space-y-2">
                <div><strong>Category:</strong> {toneStep?.data?.category || (toneScore >= 80 ? 'Excellent' : toneScore >= 60 ? 'Good' : 'Fair')}</div>
                <div><strong>Weight:</strong> 25%</div>
                {toneStep?.data?.reasoning && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-gray-400 mb-1">Reasoning:</div>
                    <div>{toneStep.data.reasoning}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Clarity */}
            <div className="bg-slate-800 rounded-lg p-5 border border-gray-600">
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">📝</div>
                <div className="text-2xl font-bold text-white">{clarityScore}</div>
                <div className="text-sm text-gray-400">Clarity</div>
              </div>
              <div className="text-xs text-gray-300 space-y-2">
                <div><strong>Category:</strong> {clarityStep?.data?.category || (clarityScore >= 80 ? 'Very Clear' : clarityScore >= 60 ? 'Clear' : 'Unclear')}</div>
                <div><strong>Weight:</strong> 25%</div>
                {clarityStep?.data?.claimCount !== undefined && (
                  <div><strong>Claims:</strong> {clarityStep.data.claimCount}</div>
                )}
                {clarityStep?.data?.reasoning && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-gray-400 mb-1">Reasoning:</div>
                    <div>{clarityStep.data.reasoning}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Evidence */}
            <div className="bg-slate-800 rounded-lg p-5 border border-gray-600">
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">📊</div>
                <div className="text-2xl font-bold text-white">{evidenceQuality}</div>
                <div className="text-sm text-gray-400">Evidence</div>
              </div>
              <div className="text-xs text-gray-300 space-y-2">
                <div><strong>Category:</strong> {evidenceStep?.data?.category || (evidenceQuality >= 80 ? 'Strong' : evidenceQuality >= 60 ? 'Moderate' : 'Weak')}</div>
                <div><strong>Weight:</strong> 30%</div>
                {evidenceStep?.data?.verified !== undefined && (
                  <div><strong>Verified:</strong> {evidenceStep.data.verified ? 'Yes ✓' : 'No'}</div>
                )}
                {evidenceStep?.data?.reasoning && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-gray-400 mb-1">Reasoning:</div>
                    <div>{evidenceStep.data.reasoning}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Fallacy Penalties */}
          {(fallacyStep?.data?.fallacies?.length > 0 || aiAnalysis.fallacies?.length > 0) && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-5">
              <h3 className="text-xl font-bold text-red-400 mb-4">
                ⚠️ Fallacy Penalties ({fallacyStep?.data?.deduction || (-5 * (aiAnalysis.fallacies?.length || 0))} points)
              </h3>
              <div className="space-y-3">
                {(fallacyStep?.data?.fallacies || aiAnalysis.fallacies || []).map((fallacy, idx) => (
                  <div key={idx} className="bg-red-900/30 rounded p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold text-white capitalize">
                        {fallacy.type}
                      </div>
                      <div className="text-red-400 font-bold">
                        -5 points
                      </div>
                    </div>
                    <div className="text-sm text-gray-300">
                      {fallacy.explanation}
                    </div>
                    {fallacy.severity && (
                      <div className="mt-2 text-xs text-gray-400">
                        Severity: {fallacy.severity}/10
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formula */}
          {overallStep?.data?.formula && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-5">
              <h3 className="text-xl font-bold text-blue-400 mb-3">
                📐 Calculation Formula
              </h3>
              <code className="block bg-slate-900 rounded p-4 text-sm text-gray-300 mb-4">
                {overallStep.data.formula}
              </code>
              <div className="text-sm text-gray-400">
                This weighted formula ensures evidence quality (30%) and tone/clarity (25% each)
                are the primary factors in your score.
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-gray-700 p-6">
          <button
            onClick={onClose}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-semibold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default ScoreBreakdownModal;