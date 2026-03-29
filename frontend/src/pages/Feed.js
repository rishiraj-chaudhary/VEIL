/**
 * FEED PAGE — updated
 * - Community filter pills at top
 * - CommunityMemoryPanel shown when community selected
 * - c/ labels on posts are clickable (handled via onCommunityClick prop to PostCard)
 *
 * Place at: frontend/src/pages/Feed.js
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import CommunityMemoryPanel from '../components/community/CommunityMemoryPanel';
import PostCard from '../components/post/PostCard';
import { useSocketEvent } from '../hooks/useSocket';
import useCommunityStore from '../store/communityStore';
import usePostStore from '../store/postStore';

// ── AI badge ──────────────────────────────────────────────────────────────────

const AIBadge = ({ generatedAt }) => (
  <div className="flex items-center gap-2 px-3 py-2 bg-veil-purple/10 border border-veil-purple/30 rounded-lg">
    <span className="text-veil-purple text-sm">✦</span>
    <span className="text-xs text-veil-purple font-medium">AI-ranked feed</span>
    {generatedAt && (
      <span className="text-xs text-gray-500 ml-auto">
        {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    )}
  </div>
);

// ── Community filter pills ────────────────────────────────────────────────────

const CommunityFilterBar = ({ communities, selected, onSelect }) => (
  <div className="flex items-center gap-2 flex-wrap mb-5">
    <button
      onClick={() => onSelect(null)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
        !selected
          ? 'bg-veil-purple border-veil-purple text-white'
          : 'bg-slate-800 border-slate-700 text-gray-400 hover:text-white hover:border-slate-500'
      }`}
    >
      All
    </button>
    {communities.map((c) => (
      <button
        key={c._id}
        onClick={() => onSelect(c)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
          selected?._id === c._id
            ? 'bg-veil-purple border-veil-purple text-white'
            : 'bg-slate-800 border-slate-700 text-gray-400 hover:text-white hover:border-slate-500'
        }`}
      >
        c/{c.name}
      </button>
    ))}
  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────

const Feed = () => {
  const navigate = useNavigate();
  const { posts, fetchPosts, fetchFeed, feedRanked, feedGeneratedAt, loading } = usePostStore();
  const { communities, fetchCommunities } = useCommunityStore();

  const [sortBy, setSortBy]                   = useState('hot');
  const [selectedCommunity, setSelectedCommunity] = useState(null);

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  const loadFeed = useCallback((sort, community = null) => {
    if (sort === 'ai') {
      fetchFeed();
    } else {
      fetchPosts({ sort, ...(community ? { community: community.name } : {}) });
    }
  }, [fetchPosts, fetchFeed]);

  useSocketEvent('vote-update', useCallback(() => {
    loadFeed(sortBy, selectedCommunity);
  }, [sortBy, selectedCommunity, loadFeed]));

  useEffect(() => {
    loadFeed(sortBy, selectedCommunity);
  }, [sortBy, selectedCommunity]); // eslint-disable-line

  const handleCommunitySelect = (community) => {
    setSelectedCommunity(community);
    // AI feed is global — switch back to hot when filtering by community
    if (sortBy === 'ai') setSortBy('hot');
  };

  // Called when user clicks a c/ label on a post card
  const handlePostCommunityClick = (communityName) => {
    const found = communities.find(c => c.name === communityName);
    if (found) {
      handleCommunitySelect(found);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const SORT_TABS = [
    { id: 'hot', label: '🔥 Hot' },
    { id: 'new', label: '✨ New' },
    { id: 'top', label: '📈 Top' },
    { id: 'ai',  label: '✦ For You' },
  ];

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Community filter pills */}
        {communities.length > 0 && (
          <CommunityFilterBar
            communities={communities}
            selected={selectedCommunity}
            onSelect={handleCommunitySelect}
          />
        )}

        {/* Community memory panel — inline when community selected */}
        {selectedCommunity && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400 font-medium">
                c/{selectedCommunity.displayName}
              </span>
              <button
                onClick={() => navigate(`/c/${selectedCommunity.name}`)}
                className="text-xs text-veil-purple hover:underline"
              >
                View community →
              </button>
            </div>
            <CommunityMemoryPanel
              communityName={selectedCommunity.name}
              postCount={selectedCommunity.postCount}
            />
          </div>
        )}

        {/* Sort tabs */}
        <div className="flex items-center gap-2 mb-5">
          {SORT_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSortBy(id)}
              disabled={id === 'ai' && !!selectedCommunity}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                sortBy === id
                  ? id === 'ai'
                    ? 'bg-veil-purple text-white shadow-lg shadow-veil-purple/20'
                    : 'bg-veil-purple text-white'
                  : 'bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* AI feed banner */}
        {sortBy === 'ai' && feedRanked && !loading && (
          <div className="mb-4">
            <AIBadge generatedAt={feedGeneratedAt} />
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-veil-purple" />
            {sortBy === 'ai' && (
              <p className="text-gray-500 text-sm mt-4">Personalising your feed…</p>
            )}
          </div>

        ) : posts.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
            <p className="text-gray-400 text-lg mb-4">
              {sortBy === 'ai'
                ? 'Start debating and posting to unlock your personalised feed.'
                : selectedCommunity
                  ? `No posts in c/${selectedCommunity.name} yet.`
                  : 'No posts yet. Be the first to create one!'}
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
              <PostCard
                key={post._id}
                post={post}
                ranked={sortBy === 'ai'}
                onCommunityClick={handlePostCommunityClick}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default Feed;