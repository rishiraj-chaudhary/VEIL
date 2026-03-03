import React from 'react';

const VerdictExplainer = ({ verdict, overallQuality }) => {
  // Safety check
  if (!verdict) {
    return (
      <div className="mt-4 bg-gray-900 rounded-lg p-4 border border-gray-700">
        <p className="text-gray-400 text-sm">No analysis data available</p>
      </div>
    );
  }

  const decisionTrace = verdict.decisionTrace;
  
  // Check if it's an array
  const isArray = Array.isArray(decisionTrace);
  
  // No trace data
  if (!decisionTrace || (isArray && decisionTrace.length === 0)) {
    return (
      <div className="mt-4 bg-gray-900 rounded-lg p-4 border border-gray-700">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white mb-2">AI Analysis Summary</h3>
          {overallQuality && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Overall Quality:</span>
              <span className={`text-lg font-bold ${
                overallQuality >= 70 ? 'text-green-400' : 
                overallQuality >= 50 ? 'text-yellow-400' : 
                'text-red-400'
              }`}>
                {overallQuality}/100
              </span>
            </div>
          )}
        </div>
        <p className="text-gray-400 text-sm">No detailed trace available</p>
      </div>
    );
  }

  // ✅ Parse array format - handle both strings AND objects
  if (isArray) {
    const extractScore = (str, pattern) => {
      const match = str.match(pattern);
      return match ? parseInt(match[1]) : null;
    };

    // Parse each trace item (could be string or object)
    const steps = decisionTrace.map((item, idx) => {
      // ✅ If it's an object, extract its properties
      if (typeof item === 'object' && item !== null) {
        return {
          type: item.step || 'other',
          title: item.message || item.step || 'Analysis Step',
          score: item.score,
          details: item.message || JSON.stringify(item),
          icon: getIconForStep(item.step),
          impact: item.impact,
          metadata: item.data,
          isGood: item.impact === 'positive'
        };
      }
      
      // ✅ If it's a string, parse it like before
      if (typeof item === 'string') {
        const line = item;
        
        // Knowledge Retrieval
        if (line.includes('Retrieved') || line.includes('documents')) {
          const docsMatch = line.match(/(\d+)\s+documents/);
          const knowledgeMatch = line.match(/(\d+)\s+knowledge/);
          const memoryMatch = line.match(/(\d+)\s+memory/);
          
          return {
            type: 'retrieval',
            title: '🔍 Knowledge Retrieval',
            details: line,
            icon: '🔍',
            metadata: {
              total: docsMatch ? parseInt(docsMatch[1]) : 0,
              knowledge: knowledgeMatch ? parseInt(knowledgeMatch[1]) : 0,
              memory: memoryMatch ? parseInt(memoryMatch[1]) : 0
            }
          };
        }
        
        // Fallacy Detection
        if (line.includes('fallacies') || line.includes('Fallacies')) {
          const noFallacies = line.includes('No fallacies') || line.includes('0 fallacies');
          return {
            type: 'fallacy',
            title: '⚠️ Fallacy Detection',
            details: line,
            icon: noFallacies ? '✓' : '⚠️',
            isGood: noFallacies
          };
        }
        
        // Tone Analysis
        if (line.includes('Tone:')) {
          const score = extractScore(line, /Tone:\s*(\d+)\/100/);
          return {
            type: 'tone',
            title: '🎭 Tone Analysis',
            score,
            details: line,
            icon: '🎭'
          };
        }
        
        // Clarity Analysis
        if (line.includes('Clarity:')) {
          const score = extractScore(line, /Clarity:\s*(\d+)\/100/);
          return {
            type: 'clarity',
            title: '📝 Clarity Analysis',
            score,
            details: line,
            icon: '📝'
          };
        }
        
        // Evidence Analysis
        if (line.includes('Evidence:')) {
          const score = extractScore(line, /Evidence:\s*(\d+)\/100/);
          return {
            type: 'evidence',
            title: '📊 Evidence Quality',
            score,
            details: line,
            icon: '📊'
          };
        }
        
        // Claims
        if (line.includes('Extracted') && line.includes('claims')) {
          const claimCount = line.match(/(\d+)\s+claims?/);
          return {
            type: 'claims',
            title: '💡 Claims Extracted',
            details: line,
            icon: '💡',
            count: claimCount ? parseInt(claimCount[1]) : 0
          };
        }
        
        // Rebuttals
        if (line.includes('Found') && line.includes('rebuttals')) {
          const rebuttalCount = line.match(/(\d+)\s+rebuttals?/);
          return {
            type: 'rebuttals',
            title: '🔄 Rebuttals Found',
            details: line,
            icon: '🔄',
            count: rebuttalCount ? parseInt(rebuttalCount[1]) : 0
          };
        }
        
        // Overall Quality
        if (line.includes('Overall Quality')) {
          const score = extractScore(line, /Overall Quality:\s*(\d+)\/100/);
          return {
            type: 'overall',
            title: '🎯 Final Quality Score',
            score,
            details: line,
            icon: '🎯'
          };
        }
        
        // Generic string
        return {
          type: 'other',
          title: 'Analysis Step',
          details: line,
          icon: '•'
        };
      }
      
      // Unknown type
      return {
        type: 'unknown',
        title: 'Data',
        details: String(item),
        icon: '•'
      };
    });

    return (
      <div className="mt-4 bg-gray-900 rounded-lg p-4 border border-gray-700">
        
        {/* Header */}
        <div className="mb-4 pb-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-2">
            🤖 AI Analysis Breakdown
          </h3>
          {overallQuality && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Overall Quality:</span>
              <span className={`text-xl font-bold ${
                overallQuality >= 70 ? 'text-green-400' : 
                overallQuality >= 50 ? 'text-yellow-400' : 
                'text-red-400'
              }`}>
                {overallQuality}/100
              </span>
            </div>
          )}
        </div>

        {/* Analysis Steps */}
        <div className="space-y-3">
          {steps.map((step, idx) => (
            <div 
              key={idx} 
              className={`rounded-lg p-3 ${
                step.isGood ? 'bg-green-900/20 border border-green-700/30' :
                step.impact === 'negative' ? 'bg-red-900/20 border border-red-700/30' :
                step.impact === 'positive' ? 'bg-green-900/20 border border-green-700/30' :
                'bg-gray-800 border border-gray-700'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-xl flex-shrink-0">{step.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <h4 className="font-semibold text-white text-sm">
                      {step.title}
                    </h4>
                    {step.score !== null && step.score !== undefined && (
                      <span className={`text-sm font-bold flex-shrink-0 ${
                        step.score >= 70 ? 'text-green-400' : 
                        step.score >= 50 ? 'text-yellow-400' : 
                        'text-red-400'
                      }`}>
                        {step.score}/100
                      </span>
                    )}
                    {step.count !== undefined && (
                      <span className={`text-sm font-bold flex-shrink-0 ${
                        step.count === 0 ? 'text-gray-400' :
                        step.count >= 3 ? 'text-green-400' :
                        'text-yellow-400'
                      }`}>
                        {step.count} found
                      </span>
                    )}
                  </div>
                  <p className="text-gray-300 text-xs break-words">
                    {step.details}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="mt-4 bg-gray-900 rounded-lg p-4 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-2">AI Analysis</h3>
      <p className="text-gray-400 text-sm">Analysis format not recognized</p>
    </div>
  );
};

// Helper function to get icon for step type
const getIconForStep = (stepType) => {
  const icons = {
    'initialization': '🚀',
    'knowledge_retrieval': '🔍',
    'fallacy_detection': '⚠️',
    'tone_analysis': '🎭',
    'clarity_analysis': '📝',
    'evidence_analysis': '📊',
    'claims_extraction': '💡',
    'rebuttal_analysis': '🔄',
    'fact_check': '✓',
    'overall_quality': '🎯',
    'summary': '📋'
  };
  return icons[stepType] || '•';
};

export default VerdictExplainer;