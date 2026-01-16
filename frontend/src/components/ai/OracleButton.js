import { useState } from 'react';
import useAIStore from '../../store/aiStore';

const OracleButton = ({ onGenerate, postId }) => {
  const { enabled, loading, remainingRequests } = useAIStore();
  const [showOptions, setShowOptions] = useState(false);

  const handleGenerate = (options = {}) => {
    onGenerate(options);
    setShowOptions(false);
  };

  if (!enabled) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowOptions(!showOptions)}
        disabled={loading}
        className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-veil-purple hover:bg-veil-indigo text-white rounded-lg transition-colors disabled:opacity-50"
      >
        <span>🔮</span>
        <span>{loading ? 'Generating...' : '@oracle'}</span>
        {!loading && (
          <span className="text-xs opacity-75">({remainingRequests})</span>
        )}
      </button>

      {/* Options Menu */}
      {showOptions && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3 z-50">
          <div className="text-sm text-gray-300 mb-3">
            🔮 What should Oracle help with?
          </div>

          <div className="space-y-2">
            <button
              onClick={() => handleGenerate({ tone: 'professional' })}
              className="w-full text-left px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              💼 <span className="font-semibold">Professional</span>
              <div className="text-xs text-gray-400">Formal, well-structured reply</div>
            </button>

            <button
              onClick={() => handleGenerate({ tone: 'casual' })}
              className="w-full text-left px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              😎 <span className="font-semibold">Casual</span>
              <div className="text-xs text-gray-400">Friendly, conversational tone</div>
            </button>

            <button
              onClick={() => handleGenerate({ tone: 'analytical', smart: true })}
              className="w-full text-left px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              🧠 <span className="font-semibold">Analytical</span>
              <div className="text-xs text-gray-400">Data-driven, logical argument</div>
            </button>

            <button
              onClick={() => handleGenerate({ brief: true })}
              className="w-full text-left px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              ⚡ <span className="font-semibold">Quick Reply</span>
              <div className="text-xs text-gray-400">2-3 sentences max</div>
            </button>
          </div>

          <button
            onClick={() => setShowOptions(false)}
            className="mt-3 w-full text-xs text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default OracleButton;