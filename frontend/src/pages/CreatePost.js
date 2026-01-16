import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import useCommunityStore from '../store/communityStore';
import usePostStore from '../store/postStore';

const CreatePost = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState('');
  const navigate = useNavigate();

  const { createPost, loading: postLoading, error: postError } = usePostStore();
  const { communities, fetchCommunities, loading: commLoading } = useCommunityStore();

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedCommunity) {
      alert('Please select a community');
      return;
    }

    const result = await createPost({
      title,
      content,
      communityName: selectedCommunity,
    });

    if (result.success) {
      navigate('/feed');
    }
  };

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h1 className="text-2xl font-bold text-white mb-6">Create Post</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Community Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Choose Community *
              </label>
              {commLoading ? (
                <div className="text-gray-400">Loading communities...</div>
              ) : communities.length === 0 ? (
                <div className="text-gray-400">
                  No communities available.{' '}
                  <a href="/communities" className="text-veil-purple hover:underline">
                    Create one first
                  </a>
                </div>
              ) : (
                <select
                  value={selectedCommunity}
                  onChange={(e) => setSelectedCommunity(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-veil-purple"
                  required
                >
                  <option value="">Select a community</option>
                  {communities.map((community) => (
                    <option key={community._id} value={community.name}>
                      c/{community.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-veil-purple"
                placeholder="An interesting title..."
                required
                maxLength="300"
              />
              <p className="text-xs text-gray-500 mt-1">
                {title.length}/300 characters
              </p>
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Content (optional)
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-veil-purple"
                placeholder="What are your thoughts?"
                rows="8"
                maxLength="40000"
              />
              <p className="text-xs text-gray-500 mt-1">
                {content.length}/40000 characters
              </p>
            </div>

            {/* Error Message */}
            {postError && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg">
                {postError}
              </div>
            )}

            {/* Buttons */}
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={postLoading || !selectedCommunity}
                className="flex-1 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {postLoading ? 'Posting...' : 'Post'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/feed')}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        {/* Tips */}
        <div className="mt-6 bg-slate-800 rounded-lg border border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Posting Tips</h3>
          <ul className="text-sm text-gray-400 space-y-1">
            <li>• Be respectful and constructive</li>
            <li>• Choose a clear, descriptive title</li>
            <li>• Check if similar posts already exist</li>
            <li>• Follow community guidelines</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CreatePost;