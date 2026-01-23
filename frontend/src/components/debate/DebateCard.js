import { Link } from 'react-router-dom';

const DebateCard = ({ debate }) => {
  const formatTime = (date) => {
    const now = new Date();
    const debateDate = new Date(date);
    const diffMs = now - debateDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-900/20 text-yellow-400 border-yellow-700',
      active: 'bg-green-900/20 text-green-400 border-green-700',
      completed: 'bg-blue-900/20 text-blue-400 border-blue-700',
      cancelled: 'bg-red-900/20 text-red-400 border-red-700'
    };
    return colors[status] || 'bg-gray-900/20 text-gray-400 border-gray-700';
  };

  const getTypeIcon = (type) => {
    const icons = {
      text: '📝',
      voice: '🎤',
      video: '📹'
    };
    return icons[type] || '💬';
  };

  return (
    <Link to={`/debates/${debate._id}`}>
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-veil-purple transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded border text-xs font-medium ${getStatusColor(debate.status)}`}>
              {debate.status}
            </span>
            <span className="text-xl">{getTypeIcon(debate.type)}</span>
            <span className="text-xs text-gray-400">
              {formatTime(debate.createdAt)}
            </span>
          </div>
          
          {debate.viewCount > 0 && (
            <div className="flex items-center space-x-1 text-xs text-gray-400">
              <span>👁️</span>
              <span>{debate.viewCount}</span>
            </div>
          )}
        </div>

        {/* Topic */}
        <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">
          {debate.topic}
        </h3>

        {/* Description */}
        {debate.description && (
          <p className="text-sm text-gray-400 mb-4 line-clamp-2">
            {debate.description}
          </p>
        )}

        {/* Participants */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-1">
              <span className="text-green-400">✓</span>
              <span className="text-gray-300">For:</span>
              <span className="text-white font-medium">
                {debate.participants?.find(p => p.side === 'for')?.user?.username || 'Open'}
              </span>
            </div>
            
            <div className="flex items-center space-x-1">
              <span className="text-red-400">✗</span>
              <span className="text-gray-300">Against:</span>
              <span className="text-white font-medium">
                {debate.participants?.find(p => p.side === 'against')?.user?.username || 'Open'}
              </span>
            </div>
          </div>

          {/* Progress indicator */}
          {debate.status === 'active' && (
            <div className="text-xs text-veil-purple font-medium">
              Round {debate.currentRound}/{debate.rounds?.length}
            </div>
          )}
        </div>

        {/* Winner (if completed) */}
        {debate.status === 'completed' && debate.winner && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-gray-400">Winner:</span>
              <span className="text-veil-purple font-semibold">
                {debate.winner === 'draw' ? 'Draw' : debate.winner.toUpperCase()}
              </span>
              {debate.finalScores && (
                <span className="text-gray-500">
                  ({debate.finalScores.for} - {debate.finalScores.against})
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

export default DebateCard;