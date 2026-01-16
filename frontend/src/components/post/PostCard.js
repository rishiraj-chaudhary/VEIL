import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import usePostStore from '../../store/postStore';

const PostCard = ({ post }) => {
  const { votePost } = usePostStore();
  const [userVote, setUserVote] = useState(0);
  const [upvotes, setUpvotes] = useState(post.upvotes);
  const [downvotes, setDownvotes] = useState(post.downvotes);
  const { refreshUser } = useAuthStore();

  const karma = upvotes - downvotes;

  const handleVote = async (vote) => {
    const newVote = userVote === vote ? 0 : vote;
    
    // Calculate changes to upvotes and downvotes
    let upvoteChange = 0;
    let downvoteChange = 0;
  
    // Remove old vote if exists
    if (userVote === 1) upvoteChange -= 1;
    if (userVote === -1) downvoteChange -= 1;
  
    // Add new vote if not 0
    if (newVote === 1) upvoteChange += 1;
    if (newVote === -1) downvoteChange += 1;
  
    // Optimistic update
    setUpvotes(upvotes + upvoteChange);
    setDownvotes(downvotes + downvoteChange);
    setUserVote(newVote);
    
    // Send to backend
    const result = await votePost(post._id, newVote);
    
    if (!result.success) {
      // Rollback on failure
      setUpvotes(upvotes);
      setDownvotes(downvotes);
      setUserVote(userVote);
      console.error('Vote failed:', result.error);
    } else {
      // Refresh user karma in navbar
      await refreshUser();
    }
  };

  const formatTime = (date) => {
    const now = new Date();
    const postDate = new Date(date);
    const diffMs = now - postDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors">
      <div className="flex">
        {/* Vote Section */}
        <div className="bg-slate-900 p-2 flex flex-col items-center justify-start space-y-1">
          <button
            onClick={() => handleVote(1)}
            className={`p-1 rounded hover:bg-slate-800 transition-colors ${
              userVote === 1 ? 'text-orange-500' : 'text-gray-400'
            }`}
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 10l5-5 5 5H5z" />
            </svg>
          </button>
          
          <span className={`text-sm font-bold ${
            karma > 0 ? 'text-orange-500' : 
            karma < 0 ? 'text-blue-500' : 
            'text-gray-400'
          }`}>
            {karma}
          </span>
          
          <button
            onClick={() => handleVote(-1)}
            className={`p-1 rounded hover:bg-slate-800 transition-colors ${
              userVote === -1 ? 'text-blue-500' : 'text-gray-400'
            }`}
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M15 10l-5 5-5-5h10z" />
            </svg>
          </button>
        </div>

        {/* Content Section */}
        <div className="flex-1 p-4">
          <div className="flex items-center space-x-2 text-xs text-gray-400 mb-2">
            <Link 
              to={`/c/${post.community?.name}`}
              className="font-semibold hover:text-white"
            >
              c/{post.community?.name}
            </Link>
            <span>•</span>
            <span>Posted by u/{post.author?.username}</span>
            <span>•</span>
            <span>{formatTime(post.createdAt)}</span>
          </div>

          <Link to={`/post/${post._id}`}>
            <h3 className="text-lg font-semibold text-white mb-2 hover:text-veil-purple transition-colors">
              {post.title}
            </h3>
          </Link>

          {post.content && (
            <p className="text-gray-300 text-sm mb-3 line-clamp-3">
              {post.content}
            </p>
          )}

          <div className="flex items-center space-x-4 text-sm text-gray-400">
            <Link 
              to={`/post/${post._id}`}
              className="hover:text-white transition-colors"
            >
              💬 {post.commentCount} comments
            </Link>
            <button className="hover:text-white transition-colors">
              Share
            </button>
            <button className="hover:text-white transition-colors">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostCard;