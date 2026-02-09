import React, { useState } from 'react';
import DecisionTreeVisualization from './DecisionTreeVisualization';
import ScoreBreakdownModal from './ScoreBreakdownModal';

const VerdictExplainer = ({ turn, showComparison = false, opponentTurn = null }) => {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (!turn?.aiAnalysis) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-gray-600">
        <p className="text-gray-400">AI analysis not yet available for this turn.</p>
      </div>
    );
  }

  const { aiAnalysis } = turn;
  
  // ✅ FIX: Handle both old (string array) and new (object array) formats
  let decisionTrace = aiAnalysis.decisionTrace || [];
  
  // Convert old string format to new object format
  if (Array.isArray(decisionTrace) && decisionTrace.length > 0 && typeof decisionTrace[0] === 'string') {
    console.log('⚠️ Converting old string trace to new format');
    decisionTrace = decisionTrace.map((message, index) => ({
      step: `legacy_step_${index}`,
      message: message,
      impact: 'neutral',
      data: {}
    }));
  }

  // If decisionTrace is not an array at all, make it an empty array
  if (!Array.isArray(decisionTrace)) {
    console.warn('⚠️ decisionTrace is not an array:', typeof decisionTrace);
    decisionTrace = [];
  }

  const { 
    overallQuality, 
    toneScore, 
    clarityScore, 
    evidenceQuality 
  } = aiAnalysis;

  // Extract structured data from decision trace
  const getTraceStep = (stepName) => {
    return decisionTrace.find(step => step.step === stepName);
  };

  const overallStep = getTraceStep('overall_quality');
  const toneStep = getTraceStep('tone_analysis');
  const clarityStep = getTraceStep('clarity_analysis');
  const evidenceStep = getTraceStep('evidence_analysis');
  const fallacyStep = getTraceStep('fallacy_detection');
  const summaryStep = getTraceStep('summary');

  // ✅ FIX: Fallback data when structured trace is missing
  const getFallbackData = () => {
    return {
      strengths: [
        ...(toneScore >= 70 ? ['Respectful tone'] : []),
        ...(clarityScore >= 70 ? ['Clear structure'] : []),
        ...(evidenceQuality >= 70 ? ['Strong evidence'] : []),
        ...((aiAnalysis.fallacies?.length || 0) === 0 ? ['No fallacies'] : [])
      ],
      weaknesses: [
        ...(toneScore < 70 ? ['Tone could be more respectful'] : []),
        ...(clarityScore < 70 ? ['Structure could be clearer'] : []),
        ...(evidenceQuality < 70 ? ['Needs more evidence'] : []),
        ...((aiAnalysis.fallacies?.length || 0) > 0 ? [`${aiAnalysis.fallacies.length} fallacy(ies) detected`] : [])
      ]
    };
  };

  const fallbackData = summaryStep?.data || getFallbackData();

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-blue-400';
    if (score >= 40) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getImpactIcon = (impact) => {
    if (impact === 'positive') return '✅';
    if (impact === 'negative') return '❌';
    return 'ℹ️';
  };

  return (
    <div className="space-y-4">
      
      {/* Header with Overall Score */}
      <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg p-6 border border-purple-500/30">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-white mb-2">
              AI Verdict Analysis
            </h3>
            <p className="text-gray-300">
              {overallStep?.data?.category || (overallQuality >= 80 ? 'Excellent' : overallQuality >= 60 ? 'Good' : overallQuality >= 40 ? 'Fair' : 'Poor')}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400 mb-1">Overall Quality</div>
            <div className={`text-5xl font-bold ${getScoreColor(overallQuality)}`}>
              {overallQuality}
            </div>
            <div className="text-xs text-gray-400 mt-1">/100</div>
          </div>
        </div>

        {/* Quick Strengths/Weaknesses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {fallbackData.strengths?.length > 0 && (
            <div className="bg-green-900/20 rounded-lg p-4 border border-green-500/30">
              <div className="text-green-400 font-semibold mb-2">✅ Strengths</div>
              <ul className="space-y-1 text-sm text-gray-300">
                {fallbackData.strengths.map((strength, idx) => (
                  <li key={idx}>• {strength}</li>
                ))}
              </ul>
            </div>
          )}

          {fallbackData.weaknesses?.length > 0 && (
            <div className="bg-red-900/20 rounded-lg p-4 border border-red-500/30">
              <div className="text-red-400 font-semibold mb-2">⚠️ Areas to Improve</div>
              <ul className="space-y-1 text-sm text-gray-300">
                {fallbackData.weaknesses.map((weakness, idx) => (
                  <li key={idx}>• {weakness}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-gray-700">
        <button
          onClick={() => setSelectedTab('overview')}
          className={`px-4 py-2 font-semibold transition-colors ${
            selectedTab === 'overview'
              ? 'text-purple-400 border-b-2 border-purple-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          📊 Score Breakdown
        </button>
        <button
          onClick={() => setSelectedTab('decision-tree')}
          className={`px-4 py-2 font-semibold transition-colors ${
            selectedTab === 'decision-tree'
              ? 'text-purple-400 border-b-2 border-purple-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🌲 Decision Tree
        </button>
        <button
          onClick={() => setSelectedTab('tips')}
          className={`px-4 py-2 font-semibold transition-colors ${
            selectedTab === 'tips'
              ? 'text-purple-400 border-b-2 border-purple-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          💡 Improvement Tips
        </button>
      </div>

      {/* Tab Content */}
      {selectedTab === 'overview' && (
        <div className="space-y-4">
          
          {/* Score Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Tone Score */}
            <div className="bg-slate-800 rounded-lg p-5 border border-gray-600 hover:border-purple-500/50 transition-all cursor-pointer"
                 onClick={() => setShowBreakdown(true)}>
              <div className="flex justify-between items-start mb-3">
                <div className="text-gray-400 text-sm">Tone</div>
                <div className={`text-2xl font-bold ${getScoreColor(toneScore)}`}>
                  {toneScore}
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-2">
                {toneStep?.data?.category || (toneScore >= 80 ? 'Excellent' : toneScore >= 60 ? 'Good' : toneScore >= 40 ? 'Fair' : 'Poor')}
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    toneScore >= 70 ? 'bg-green-500' : toneScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${toneScore}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Click for details
              </p>
            </div>

            {/* Clarity Score */}
            <div className="bg-slate-800 rounded-lg p-5 border border-gray-600 hover:border-purple-500/50 transition-all cursor-pointer"
                 onClick={() => setShowBreakdown(true)}>
              <div className="flex justify-between items-start mb-3">
                <div className="text-gray-400 text-sm">Clarity</div>
                <div className={`text-2xl font-bold ${getScoreColor(clarityScore)}`}>
                  {clarityScore}
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-2">
                {clarityStep?.data?.category || (clarityScore >= 80 ? 'Very Clear' : clarityScore >= 60 ? 'Clear' : clarityScore >= 40 ? 'Somewhat Clear' : 'Unclear')}
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    clarityScore >= 70 ? 'bg-green-500' : clarityScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${clarityScore}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Click for details
              </p>
            </div>

            {/* Evidence Score */}
            <div className="bg-slate-800 rounded-lg p-5 border border-gray-600 hover:border-purple-500/50 transition-all cursor-pointer"
                 onClick={() => setShowBreakdown(true)}>
              <div className="flex justify-between items-start mb-3">
                <div className="text-gray-400 text-sm">Evidence</div>
                <div className={`text-2xl font-bold ${getScoreColor(evidenceQuality)}`}>
                  {evidenceQuality}
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-2">
                {evidenceStep?.data?.category || (evidenceQuality >= 80 ? 'Strong Evidence' : evidenceQuality >= 60 ? 'Moderate Evidence' : evidenceQuality >= 40 ? 'Weak Evidence' : 'No Evidence')}
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    evidenceQuality >= 70 ? 'bg-green-500' : evidenceQuality >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${evidenceQuality}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Click for details
              </p>
            </div>
          </div>

          {/* Fallacy Warning */}
          {(fallacyStep?.data?.fallacies?.length > 0 || aiAnalysis.fallacies?.length > 0) && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-start">
                <span className="text-2xl mr-3">⚠️</span>
                <div className="flex-1">
                  <div className="text-red-400 font-semibold mb-2">
                    Logical Fallacies Detected
                  </div>
                  <div className="space-y-2">
                    {(fallacyStep?.data?.fallacies || aiAnalysis.fallacies || []).map((fallacy, idx) => (
                      <div key={idx} className="bg-red-900/30 rounded p-3">
                        <div className="text-white font-semibold capitalize mb-1">
                          {fallacy.type}
                        </div>
                        <div className="text-sm text-gray-300">
                          {fallacy.explanation}
                        </div>
                        <div className="text-xs text-red-400 mt-1">
                          Penalty: -5 points
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Formula Explanation */}
          {overallStep?.data?.formula && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
              <div className="text-blue-400 font-semibold mb-2">
                📐 Score Calculation Formula
              </div>
              <code className="text-sm text-gray-300 block mb-3">
                {overallStep.data.formula}
              </code>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                {Object.entries(overallStep.data.breakdown).map(([key, value]) => (
                  <div key={key} className="bg-blue-900/30 rounded p-2">
                    <div className="text-gray-400 capitalize">{key}</div>
                    <div className="text-white font-semibold">
                      {typeof value === 'object' ? value.score || value.count || '-' : value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {selectedTab === 'decision-tree' && (
        <DecisionTreeVisualization decisionTrace={decisionTrace} />
      )}

      {selectedTab === 'tips' && (
        <div className="space-y-4">
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-6">
            <h4 className="text-xl font-bold text-white mb-4">💡 How to Improve Your Score</h4>
            
            {/* Tone Tips */}
            {toneScore < 70 && (
              <div className="mb-4">
                <div className="text-purple-400 font-semibold mb-2">🗣️ Tone Improvement</div>
                <ul className="space-y-1 text-gray-300 ml-4">
                  {(toneStep?.data?.tips || [
                    'Avoid aggressive or dismissive language',
                    'Focus on arguments, not the person',
                    'Use respectful phrases like "I understand your point, but..."',
                    'Acknowledge valid points made by opponents'
                  ]).map((tip, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Clarity Tips */}
            {clarityScore < 70 && (
              <div className="mb-4">
                <div className="text-blue-400 font-semibold mb-2">📝 Clarity Improvement</div>
                <ul className="space-y-1 text-gray-300 ml-4">
                  {(clarityStep?.data?.tips || [
                    'Organize arguments with clear topic sentences',
                    'Use transition words (however, therefore, moreover)',
                    'Break complex ideas into smaller, digestible points',
                    'Aim for 15-25 words per sentence on average'
                  ]).map((tip, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-blue-400 mr-2">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Evidence Tips */}
            {evidenceQuality < 70 && (
              <div className="mb-4">
                <div className="text-green-400 font-semibold mb-2">📊 Evidence Improvement</div>
                <ul className="space-y-1 text-gray-300 ml-4">
                  {(evidenceStep?.data?.tips || [
                    'Include specific citations or sources (e.g., "According to Smith 2023...")',
                    'Use data and statistics to support claims',
                    'Provide concrete examples and case studies',
                    'Reference peer-reviewed research when possible'
                  ]).map((tip, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-green-400 mr-2">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fallacy Tips */}
            {(aiAnalysis.fallacies?.length > 0 || fallacyStep?.data?.fallacies?.length > 0) && (
              <div className="mb-4">
                <div className="text-red-400 font-semibold mb-2">🚫 Avoid Fallacies</div>
                <ul className="space-y-1 text-gray-300 ml-4">
                  {(fallacyStep?.data?.tips || [
                    'Review common logical fallacies',
                    'Focus on addressing arguments directly',
                    'Avoid personal attacks and emotional manipulation'
                  ]).map((tip, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-red-400 mr-2">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* General Tips */}
            {overallQuality < 70 && (
              <div>
                <div className="text-yellow-400 font-semibold mb-2">⭐ General Tips</div>
                <ul className="space-y-1 text-gray-300 ml-4">
                  {(overallStep?.data?.tips || [
                    'Focus on areas with lowest scores',
                    'Balance emotion with logic',
                    'Support claims with evidence',
                    'Maintain respectful discourse'
                  ]).map((tip, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-yellow-400 mr-2">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Success Message */}
            {overallQuality >= 70 && toneScore >= 70 && clarityScore >= 70 && evidenceQuality >= 70 && (
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 text-center">
                <div className="text-2xl mb-2">🎉</div>
                <div className="text-green-400 font-semibold mb-2">Excellent Work!</div>
                <div className="text-gray-300 text-sm">
                  You're demonstrating strong debate skills across all categories. Keep up the great work!
                </div>
              </div>
            )}
          </div>

          {/* Educational Resources */}
          <div className="bg-slate-800 rounded-lg p-6 border border-gray-600">
            <h4 className="text-lg font-bold text-white mb-3">📚 Debate Resources</h4>
            <div className="space-y-3 text-sm text-gray-300">
              
              <div className="bg-slate-700/50 rounded p-4">
                <h5 className="text-white font-semibold mb-2">🚫 Common Logical Fallacies</h5>
                <ul className="space-y-1 text-xs ml-4">
                  <li><strong>Ad Hominem:</strong> Attacking the person instead of their argument</li>
                  <li><strong>Straw Man:</strong> Misrepresenting opponent's position to make it easier to attack</li>
                  <li><strong>Appeal to Emotion:</strong> Using emotions to manipulate instead of logic</li>
                  <li><strong>False Dilemma:</strong> Presenting only two options when more exist</li>
                  <li><strong>Slippery Slope:</strong> Assuming a chain of events without proof</li>
                </ul>
              </div>

              <div className="bg-slate-700/50 rounded p-4">
                <h5 className="text-white font-semibold mb-2">📝 Argument Structure</h5>
                <ul className="space-y-1 text-xs ml-4">
                  <li><strong>Claim:</strong> State your main point clearly</li>
                  <li><strong>Evidence:</strong> Support with data, studies, or examples</li>
                  <li><strong>Reasoning:</strong> Explain how evidence supports your claim</li>
                  <li><strong>Rebuttal:</strong> Address counter-arguments</li>
                  <li><strong>Conclusion:</strong> Reinforce your main point</li>
                </ul>
              </div>

              <div className="bg-slate-700/50 rounded p-4">
                <h5 className="text-white font-semibold mb-2">⭐ Best Practices</h5>
                <ul className="space-y-1 text-xs ml-4">
                  <li>✓ Use specific, credible sources</li>
                  <li>✓ Stay on topic and address opponent's actual arguments</li>
                  <li>✓ Maintain respectful tone throughout</li>
                  <li>✓ Structure arguments with clear transitions</li>
                  <li>✓ Anticipate and address counter-arguments</li>
                  <li>✓ Avoid absolute language without evidence</li>
                </ul>
              </div>

              <div className="bg-blue-900/20 border border-blue-500/30 rounded p-4">
                <h5 className="text-blue-400 font-semibold mb-2">💡 Pro Tip</h5>
                <p className="text-xs text-gray-300">
                  The AI values <strong>evidence-based arguments</strong> (30% weight) most heavily, 
                  followed by <strong>clarity</strong> and <strong>tone</strong> (25% each). 
                  Always cite your sources and maintain respectful discourse!
                </p>
              </div>
              
            </div>
          </div>
        </div>
      )}

      {/* Score Breakdown Modal */}
      {showBreakdown && (
        <ScoreBreakdownModal
          turn={turn}
          onClose={() => setShowBreakdown(false)}
        />
      )}

    </div>
  );
};

export default VerdictExplainer;