import { useState } from 'react';
import useCommentStore from '../../store/commentStore';
import CommentForm from './CommentForm';

const CommentItem = ({ comment, depth = 0 }) => {
  const { voteComment } = useCommentStore();
  const [userVote, setUserVote] = useState(0);
  const [showReplyForm, setShowReplyForm] = useState(false);

  const handleVote = async (vote) => {
    const newVote = userVote === vote ? 0 : vote;
    setUserVote(newVote);
    await voteComment(comment._id, newVote);
  };

  const formatTime = (date) => {
    const now = new Date();
    const commentDate = new Date(date);
    const diffMs = now - commentDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const handleReplySuccess = () => {
    setShowReplyForm(false);
  };

  return (
    <div 
      className={`flex gap-2 ${depth > 0 ? 'border-l-2 border-slate-700 pl-4' : ''}`}
    >
      {/* Vote buttons */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => handleVote(1)}
          className={`p-1 hover:bg-slate-700 rounded transition-colors ${
            userVote === 1 ? 'text-orange-500' : 'text-gray-400'
          }`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M5 10l5-5 5 5H5z" />
          </svg>
        </button>
        
        <span className={`text-xs font-bold ${
          comment.karma > 0 ? 'text-orange-500' : 
          comment.karma < 0 ? 'text-blue-500' : 
          'text-gray-400'
        }`}>
          {comment.karma || 0}
        </span>
        
        <button
          onClick={() => handleVote(-1)}
          className={`p-1 hover:bg-slate-700 rounded transition-colors ${
            userVote === -1 ? 'text-blue-500' : 'text-gray-400'
          }`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M15 10l-5 5-5-5h10z" />
          </svg>
        </button>
      </div>

      {/* Comment content */}
      <div className="flex-1">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
          <span className="font-semibold text-gray-300">
            u/{comment.author?.username || 'deleted'}
          </span>
          <span>•</span>
          <span>{formatTime(comment.createdAt)}</span>
        </div>

        <p className="text-gray-200 text-sm mb-2 whitespace-pre-wrap">{comment.content}</p>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          <button
            onClick={() => setShowReplyForm(!showReplyForm)}
            className="hover:text-white transition-colors font-medium"
          >
            {showReplyForm ? 'Cancel Reply' : 'Reply'}
          </button>
          <button className="hover:text-white transition-colors">
            Share
          </button>
        </div>

        {/* Reply form with @oracle */}
        {showReplyForm && (
          <div className="mt-3 bg-slate-900 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-gray-400 mb-2">
              Replying to <span className="text-veil-purple">@{comment.author?.username}</span>
            </div>
            <CommentForm
              postId={comment.post}
              parentId={comment._id}
              replyingToUsername={comment.author?.username}
              onCancel={() => setShowReplyForm(false)}
              onSuccess={handleReplySuccess}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentItem;