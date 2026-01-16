import { Link } from 'react-router-dom';

const CommunityCard = ({ community }) => {
  return (
    <Link 
      to={`/c/${community.name}`}
      className="block bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-veil-purple transition-all hover:shadow-lg hover:shadow-veil-purple/20"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-white mb-2">
            c/{community.name}
          </h3>
          <p className="text-gray-400 text-sm mb-3 line-clamp-2">
            {community.description || 'No description'}
          </p>
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <span>👥 {community.memberCount} members</span>
            <span>📝 {community.postCount} posts</span>
          </div>
        </div>
        <div className="ml-4">
          <div className="w-16 h-16 bg-gradient-to-br from-veil-purple to-veil-indigo rounded-lg flex items-center justify-center text-2xl">
            {community.displayName?.charAt(0).toUpperCase() || 'C'}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default CommunityCard;