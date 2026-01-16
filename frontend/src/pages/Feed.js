import { useCallback, useEffect, useState } from 'react';
import Navbar from '../components/common/Navbar';
import PostCard from '../components/post/PostCard';
import { useSocket, useSocketEvent } from '../hooks/useSocket';
import usePostStore from '../store/postStore';

const Feed = () => {
  const { posts, fetchPosts, loading } = usePostStore();
  const [sortBy, setSortBy] = useState('hot');
  const socket = useSocket();

  // Listen for any vote updates
  useSocketEvent('vote-update', useCallback((data) => {
    console.log('⬆️ Feed: Vote update received');
    // Refresh posts to show updated votes
    fetchPosts({ sort: sortBy });
  }, [sortBy, fetchPosts]));

  useEffect(() => {
    fetchPosts({ sort: sortBy });
  }, [sortBy, fetchPosts]);

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Sort Options */}
        <div className="flex space-x-2 mb-6">
          {['hot', 'new', 'top'].map((sort) => (
            <button
              key={sort}
              onClick={() => setSortBy(sort)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                sortBy === sort
                  ? 'bg-veil-purple text-white'
                  : 'bg-slate-800 text-gray-400 hover:text-white'
              }`}
            >
              {sort.charAt(0).toUpperCase() + sort.slice(1)}
            </button>
          ))}
        </div>

        {/* Posts */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-veil-purple"></div>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
            <p className="text-gray-400 text-lg mb-4">
              No posts yet. Be the first to create one!
            </p>
            <a
              href="/create-post"
              className="inline-block px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg transition-colors"
            >
              Create Post
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post._id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Feed;