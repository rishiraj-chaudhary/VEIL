/**
 * COMMUNITY PAGE
 * Route: /c/:name
 *
 * Shows community header, CommunityMemoryPanel, and filtered posts.
 * Place at: frontend/src/pages/CommunityPage.js
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import CommunityHealthPanel from '../components/community/CommunityHealthPanel';
import CommunityMemoryPanel from '../components/community/CommunityMemoryPanel';
import PostCard from '../components/post/PostCard';
import useAuthStore from '../store/authStore';
import useCommunityStore from '../store/communityStore';
import usePostStore from '../store/postStore';

const SORT_TABS = [
  { id: 'hot', label: '🔥 Hot' },
  { id: 'new', label: '✨ New' },
  { id: 'top', label: '📈 Top' },
];

const CommunityPage = () => {
  const { name } = useParams();
  const navigate  = useNavigate();
  const { user }  = useAuthStore();

  const {
    currentCommunity: community,
    currentCommunityLoading,
    fetchCommunity,
    joinCommunity,
    leaveCommunity,
  } = useCommunityStore();
  const { posts, fetchPosts, loading } = usePostStore();

  const [sortBy, setSortBy]           = useState('hot');
  const [joining, setJoining]         = useState(false);
  const [actionError, setActionError] = useState(null);

  // Resolved by name against the API — the paginated communities list only
  // holds the first page, so small communities were never found there.
  useEffect(() => {
    fetchCommunity(name);
  }, [fetchCommunity, name]);

  const loadPosts = useCallback((sort) => {
    fetchPosts({ sort, community: name });
  }, [fetchPosts, name]);

  useEffect(() => {
    loadPosts(sortBy);
  }, [sortBy, name]); // eslint-disable-line

  const isMember = community?.members?.some(
    m => m._id === user?.id || m === user?.id
  );

  const handleJoinLeave = async () => {
    setJoining(true);
    setActionError(null);

    const result = isMember
      ? await leaveCommunity(name)
      : await joinCommunity(name);

    if (!result.success) setActionError(result.error);
    setJoining(false);
  };

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Back */}
        <button
          onClick={() => navigate('/communities')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm mb-6 transition-colors"
        >
          ← Communities
        </button>

        {!community && !currentCommunityLoading && (
          <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
            <p className="text-slate-400 text-lg">c/{name} does not exist.</p>
          </div>
        )}

        {/* Community header */}
        {community && (
          <>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h1 className="text-2xl font-bold text-white">c/{community.displayName}</h1>
                <p className="text-slate-400 text-sm mt-1">{community.description || 'No description available'}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span>{community.memberCount} members</span>
                  <span>{community.postCount} posts</span>
                </div>
              </div>
              <button
                onClick={handleJoinLeave}
                disabled={joining}
                className={`px-5 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
                  isMember
                    ? 'bg-slate-600 hover:bg-red-600 text-white'
                    : 'bg-veil-purple hover:bg-veil-indigo text-veil-on-accent'
                }`}
              >
                {joining ? '...' : isMember ? 'Leave' : 'Join'}
              </button>
            </div>
            {actionError && (
              <p className="text-red-400 text-sm mb-2">{actionError}</p>
            )}
          </>
        )}

        {community && (
          <>
            {/* Community memory panel */}
            <CommunityMemoryPanel
              communityName={name}
              postCount={community.postCount ?? 0}
            />

            {/* Community health panel */}
            <CommunityHealthPanel communityName={name} />

            {/* Sort tabs */}
            <div className="flex items-center gap-2 mt-6 mb-5">
              {SORT_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setSortBy(id)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    sortBy === id
                      ? 'bg-veil-purple text-veil-on-accent'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Posts */}
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-veil-purple" />
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-lg mb-4">No posts in c/{name} yet.</p>
                <a
                  href="/create-post"
                  className="inline-block px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-veil-on-accent rounded-lg transition-colors"
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
          </>
        )}
      </div>
    </div>
  );
};

export default CommunityPage;