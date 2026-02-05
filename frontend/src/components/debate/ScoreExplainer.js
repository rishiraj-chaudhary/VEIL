import React, { useState } from 'react';

/**
 * SCORE EXPLAINER COMPONENT
 * Shows why each score was assigned
 */
const ScoreExplainer = ({ score, type, explanation }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!score && score !== 0) return null;

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-blue-400';
    if (score >= 40) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Work';
  };

  const getScoreIcon = (score) => {
    if (score >= 80) return '🌟';
    if (score >= 60) return '✓';
    if (score >= 40) return '○';
    return '⚠️';
  };

  const getTypeLabel = (type) => {
    const labels = {
      toneScore: 'Tone',
      clarityScore: 'Clarity',
      evidenceQuality: 'Evidence Quality',
      overallQuality: 'Overall Quality'
    };
    return labels[type] || type;
  };

  const getTypeExplanation = (type, score) => {
    const explanations = {
      toneScore: {
        high: 'Respectful, professional language with no personal attacks or inflammatory rhetoric.',
        medium: 'Generally appropriate tone with minor issues in word choice or phrasing.',
        low: 'Contains aggressive language, personal attacks, or inflammatory statements.'
      },
      clarityScore: {
        high: 'Clear, well-structured argument that\'s easy to follow and understand.',
        medium: 'Main points are understandable but could be more clearly articulated.',
        low: 'Unclear or poorly structured argument that\'s difficult to follow.'
      },
      evidenceQuality: {
        high: 'Strong evidence from credible sources with proper context and relevance.',
        medium: 'Some evidence provided but could be stronger or more directly relevant.',
        low: 'Little to no evidence, or evidence lacks credibility or relevance.'
      },
      overallQuality: {
        high: 'Excellent contribution combining strong reasoning, evidence, and presentation.',
        medium: 'Solid contribution with room for improvement in some areas.',
        low: 'Contribution needs significant improvement in multiple areas.'
      }
    };

    const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
    return explanations[type]?.[level] || explanation || 'No detailed explanation available.';
  };

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-sm hover:bg-slate-800/50 rounded px-2 py-1 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={getScoreColor(score)}>
            {getScoreIcon(score)}
          </span>
          <span className="text-gray-300">
            {getTypeLabel(type)}:
          </span>
          <span className={`font-semibold ${getScoreColor(score)}`}>
            {score}/100
          </span>
          <span className={`text-xs ${getScoreColor(score)}`}>
            ({getScoreLabel(score)})
          </span>
        </div>
        <span className="text-gray-500 text-xs">
          {isOpen ? '▼' : '▶'} Why?
        </span>
      </button>

      {isOpen && (
        <div className="bg-slate-800/30 rounded px-3 py-2 ml-4 space-y-2">
          <p className="text-xs text-gray-400">
            {explanation || getTypeExplanation(type, score)}
          </p>

          {/* Score breakdown visual */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  score >= 80 ? 'bg-green-500' :
                  score >= 60 ? 'bg-blue-500' :
                  score >= 40 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-12 text-right">
              {score}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScoreExplainer;