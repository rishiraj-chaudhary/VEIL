import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CommentForm from '../components/comment/CommentForm';
import CommentList from '../components/comment/CommentList';
import Navbar from '../components/common/Navbar';
import { useSocket, useSocketEvent } from '../hooks/useSocket';
import useCommentStore from '../store/commentStore';
import usePostStore from '../store/postStore';

const PostDetail = () => {
  const { id } = useParams();
  const { fetchPost, currentPost, loading, votePost } = usePostStore();
  const { createComment } = useCommentStore();

  const socket = useSocket();

  const [userVote, setUserVote] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);

  // Join / leave post room
  useEffect(() => {
    if (id) {
      socket.emit('join-post', id);
      console.log('📡 Joined post room:', id);
    }

    return () => {
      if (id) {
        socket.emit('leave-post', id);
        console.log('📡 Left post room:', id);
      }
    };
  }, [id, socket]);

  // Viewer count updates
  useSocketEvent(
    'viewer-count',
    useCallback((count) => {
      console.log('👁️ Viewer count:', count);
      setViewerCount(count);
    }, [])
  );

  // Vote updates
  useSocketEvent(
    'vote-update',
    useCallback(
      (data) => {
        if (data.postId === id) {
          console.log('⬆️ Vote update received:', data);
          fetchPost(id);
        }
      },
      [id, fetchPost]
    )
  );

  // New comments
  useSocketEvent(
    'new-comment',
    useCallback(
      () => {
        console.log('💬 New comment received');
        fetchPost(id);
      },
      [id, fetchPost]
    )
  );

  // Initial fetch
  useEffect(() => {
    fetchPost(id);
  }, [id, fetchPost]);

  const handleVote = async (vote) => {
    const newVote = userVote === vote ? 0 : vote;
    setUserVote(newVote);
    await votePost(id, newVote);
    await fetchPost(id);
  };

  const handleReply = async (parentId, content) => {
    await createComment({
      content,
      postId: id,
      parentId,
    });
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

  if (loading || !currentPost) {
    return (
      <div className="min-h-screen bg-veil-dark">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-veil-purple"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Post */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 mb-6">
          <div className="flex">
            {/* Vote Section */}
            <div className="bg-slate-900 p-4 flex flex-col items-center space-y-2">
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

              <span
                className={`text-lg font-bold ${
                  currentPost.karma > 0
                    ? 'text-orange-500'
                    : currentPost.karma < 0
                    ? 'text-blue-500'
                    : 'text-gray-400'
                }`}
              >
                {currentPost.karma}
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

            {/* Content */}
            <div className="flex-1 p-6">
              <div className="flex items-center space-x-2 text-sm text-gray-400 mb-3">
                <Link
                  to={`/c/${currentPost.community?.name}`}
                  className="font-semibold hover:text-white"
                >
                  c/{currentPost.community?.name}
                </Link>
                <span>•</span>
                <span>Posted by u/{currentPost.author?.username}</span>
                <span>•</span>
                <span>{formatTime(currentPost.createdAt)}</span>
              </div>

              {/* Viewer count */}
              {viewerCount > 0 && (
                <div className="flex items-center space-x-2 text-sm text-veil-purple mb-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path
                      fillRule="evenodd"
                      d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{viewerCount} viewing</span>
                </div>
              )}

              <h1 className="text-2xl font-bold text-white mb-4">
                {currentPost.title}
              </h1>

              {currentPost.content && (
                <p className="text-gray-300 mb-4 whitespace-pre-wrap">
                  {currentPost.content}
                </p>
              )}

              <div className="flex items-center space-x-4 text-sm text-gray-400 border-t border-slate-700 pt-4">
                <span>💬 {currentPost.commentCount} comments</span>
              </div>
            </div>
          </div>
        </div>

        {/* Comment Form */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Add a Comment
          </h2>
          <CommentForm postId={id} onCommentCreated={() => fetchPost(id)} />
        </div>

        {/* Comments */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Comments ({currentPost.commentCount})
          </h2>
          <CommentList postId={id} onReply={handleReply} />
        </div>
      </div>
    </div>
  );
};

export default PostDetail;