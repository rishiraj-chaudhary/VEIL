/**
 * COMMUNITIES PAGE — updated
 * Cards link to /c/:name — no CommunityMemoryPanel here (moved to CommunityPage + Feed)
 *
 * Place at: frontend/src/pages/Communities.js
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import CreateCommunityModal from '../components/community/CreateCommunityModal';
import useAuthStore from '../store/authStore';
import useCommunityStore from '../store/communityStore';

const Communities = () => {
  const navigate = useNavigate();
  const { communities, fetchCommunities, joinCommunity, leaveCommunity, loading } = useCommunityStore();
  const { user } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [joiningId, setJoiningId]     = useState(null);

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  const isMember = (community) =>
    community.members?.some(m => m._id === user?.id || m === user?.id);

  const handleJoinLeave = async (e, community) => {
    e.stopPropagation(); // don't navigate when clicking button
    setJoiningId(community._id);
    try {
      if (isMember(community)) {
        await leaveCommunity(community.name);
      } else {
        await joinCommunity(community.name);
      }
      await fetchCommunities();
    } catch (err) {
      console.error('Join/leave error:', err);
    }
    setJoiningId(null);
  };

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Communities</h1>
            <p className="text-gray-400">Join communities and start discussions</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg transition-colors font-semibold"
          >
            + Create Community
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-veil-purple" />
          </div>
        ) : communities.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No communities yet. Be the first to create one!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {communities.map((community) => (
              <div
                key={community._id}
                onClick={() => navigate(`/c/${community.name}`)}
                className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-veil-purple/50 transition-colors cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="text-lg font-semibold text-white mb-1 truncate">
                      c/{community.displayName}
                    </h3>
                    <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                      {community.description || 'No description available'}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{community.memberCount} members</span>
                      <span>{community.postCount} posts</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleJoinLeave(e, community)}
                    disabled={joiningId === community._id}
                    className={`shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
                      isMember(community)
                        ? 'bg-slate-600 hover:bg-red-600 text-white'
                        : 'bg-veil-purple hover:bg-veil-indigo text-white'
                    }`}
                  >
                    {joiningId === community._id ? '...' : isMember(community) ? 'Leave' : 'Join'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateCommunityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default Communities;