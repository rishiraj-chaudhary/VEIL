import { useEffect, useState } from 'react';
import Navbar from '../components/common/Navbar';
import CommunityCard from '../components/community/CommunityCard';
import CreateCommunityModal from '../components/community/CreateCommunityModal';
import useCommunityStore from '../store/communityStore';

const Communities = () => {
  const { communities, fetchCommunities, loading } = useCommunityStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Communities
            </h1>
            <p className="text-gray-400">
              Join communities and start discussions
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg transition-colors font-semibold"
          >
            + Create Community
          </button>
        </div>

        {/* Communities Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-veil-purple"></div>
          </div>
        ) : communities.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">
              No communities yet. Be the first to create one!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {communities.map((community) => (
              <CommunityCard key={community._id} community={community} onJoinLeave={fetchCommunities} />
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