import { useState } from 'react';
import useAuthStore from '../../store/authStore';
import useCommunityStore from '../../store/communityStore';

const CommunityCard = ({ community }) => {
  const { joinCommunity, leaveCommunity } = useCommunityStore();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);

  // Check if user is already a member
  const isMember = community.members?.some(member => 
    member._id === user?.id || member === user?.id
  );

  const handleJoinLeave = async () => {
    setLoading(true);
    try {
      if (isMember) {
        await leaveCommunity(community.name);
      } else {
        await joinCommunity(community.name);
      }
    } catch (error) {
      console.error('Join/Leave error:', error);
    }
    setLoading(false);
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-slate-600 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-white mb-2">
            c/{community.displayName}
          </h3>
          <p className="text-gray-400 text-sm mb-3">
            {community.description || 'No description available'}
          </p>
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <span>{community.memberCount} members</span>
            <span>{community.postCount} posts</span>
          </div>
        </div>
        
        {/* Join/Leave Button */}
        <button
          onClick={handleJoinLeave}
          disabled={loading}
          className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
            isMember
              ? 'bg-slate-600 hover:bg-red-600 text-white'
              : 'bg-veil-purple hover:bg-veil-indigo text-white'
          }`}
        >
          {loading ? 'Loading...' : isMember ? 'Leave' : 'Join'}
        </button>
      </div>
    </div>
  );
};

export default CommunityCard;