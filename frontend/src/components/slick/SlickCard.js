import { useState } from 'react';
import useSlickStore from '../../store/slickStore.js';

const SlickCard = ({ slick, isReceived = true }) => {
  const { reactToSlick, revealAuthor, currency } = useSlickStore();
  const [showRevealConfirm, setShowRevealConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const formatTimeAgo = (date) => {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
  
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };
  
  const getToneColor = (tone) => {
    const colors = {
      praise: 'text-green-400 bg-green-900/20',
      constructive: 'text-blue-400 bg-blue-900/20',
      tease: 'text-orange-400 bg-orange-900/20',
      observation: 'text-purple-400 bg-purple-900/20'
    };
    return colors[tone] || 'text-gray-400 bg-gray-900/20';
  };

  const getCredibilityColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const handleReaction = async (reaction) => {
    const result = await reactToSlick(slick._id, reaction);
    if (!result.success) {
      alert('Failed to react: ' + result.error);
    }
  };

  const handleReveal = async () => {
    setLoading(true);
    const result = await revealAuthor(slick._id);
    setLoading(false);
    setShowRevealConfirm(false);
    
    if (!result.success) {
      alert('Failed to reveal: ' + result.error);
    }
  };

  const canReveal = isReceived && !slick.identityReveal?.isRevealed;
  const isRevealed = slick.identityReveal?.isRevealed || slick.revealedAuthor;

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 mb-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center space-x-3">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getToneColor(slick.tone.category)}`}>
            {slick.tone.category} • {slick.tone.intensity}/10
          </span>
          <span className={`text-xs font-medium ${getCredibilityColor(slick.credibilityScore)}`}>
            {slick.credibilityScore}% credible
          </span>
        </div>
        
        <div className="text-xs text-gray-400">
        {formatTimeAgo(slick.createdAt)}
        </div>
      </div>

      {/* Content */}
      <div className="mb-4">
        <p className="text-white leading-relaxed">{slick.content}</p>
        
        {slick.aiAnalysis?.rewrittenVersion && slick.aiAnalysis.rewrittenVersion !== slick.content && (
          <div className="mt-2 p-2 bg-blue-900/20 rounded border-l-2 border-blue-400">
            <p className="text-xs text-blue-300 mb-1">AI-enhanced version:</p>
            <p className="text-sm text-blue-100">{slick.aiAnalysis.rewrittenVersion}</p>
          </div>
        )}
      </div>

      {/* Author Info */}
      <div className="mb-4">
        {isRevealed ? (
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-veil-purple rounded-full flex items-center justify-center">
              <span className="text-xs font-bold">
                {slick.revealedAuthor?.username[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <span className="text-sm text-white font-medium">
              {slick.revealedAuthor?.username || 'User'}
            </span>
            <span className="text-xs text-gray-400">
              ({slick.revealedAuthor?.karma || 0} karma)
            </span>
            <span className="text-xs text-green-400">• Revealed</span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Anonymous</span>
            
            {canReveal && (
              <div className="flex items-center space-x-2">
                {slick.revealOption?.canReveal ? (
                  <button
                    onClick={() => setShowRevealConfirm(true)}
                    className="text-xs bg-veil-purple hover:bg-veil-indigo px-3 py-1 rounded transition-colors"
                  >
                    Reveal ({slick.revealOption.cost} coins)
                  </button>
                ) : (
                  <span className="text-xs text-gray-500">
                    Reveal available in {Math.ceil((new Date(slick.unlockAt) - new Date()) / (1000 * 60 * 60 * 24))} days
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reactions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {Object.entries(slick.reactions).map(([reaction, count]) => (
            <button
              key={reaction}
              onClick={() => handleReaction(reaction)}
              className="flex items-center space-x-1 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <span>{getReactionEmoji(reaction)}</span>
              <span>{count}</span>
            </button>
          ))}
        </div>
        
        {!isReceived && (
          <div className="text-xs text-gray-500">
            To: {slick.targetUser?.username}
          </div>
        )}
      </div>

      {/* Reveal Confirmation Modal */}
      {showRevealConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-3">Reveal Author?</h3>
            <p className="text-gray-300 mb-4">
              This will cost {slick.revealOption?.cost || 0} VeilCoins. You currently have {currency.balance} coins.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleReveal}
                disabled={loading}
                className="flex-1 bg-veil-purple hover:bg-veil-indigo text-white py-2 px-4 rounded transition-colors disabled:opacity-50"
              >
                {loading ? 'Revealing...' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowRevealConfirm(false)}
                className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-2 px-4 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const getReactionEmoji = (reaction) => {
  const emojis = {
    agree: '👍',
    disagree: '👎', 
    funny: '😂',
    insightful: '💡',
    unfair: '⚠️'
  };
  return emojis[reaction] || '👍';
};

export default SlickCard;