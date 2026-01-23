import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import useDebateStore from '../store/debateStore';

const CreateDebate = () => {
  const navigate = useNavigate();
  const { createDebate, loading, error } = useDebateStore();
  
  const [formData, setFormData] = useState({
    topic: '',
    description: '',
    type: 'text',
    initiatorSide: 'for',
    visibility: 'public'
  });

  const [submitError, setSubmitError] = useState(null);

  console.log('🎯 CreateDebate rendered');
  console.log('Loading:', loading);
  console.log('Error:', error);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('📝 Form submitted with data:', formData);
    
    setSubmitError(null);

    try {
      const result = await createDebate(formData);
      console.log('✅ Create result:', result);
      
      if (result.success) {
        console.log('✅ Success! Navigating to:', `/debates/${result.data.debate._id}`);
        navigate(`/debates/${result.data.debate._id}`);
      } else {
        console.error('❌ Creation failed:', result.error);
        setSubmitError(result.error || 'Failed to create debate');
      }
    } catch (err) {
      console.error('❌ Exception during creation:', err);
      setSubmitError(err.message || 'An error occurred');
    }
  };

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />
      
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h1 className="text-2xl font-bold text-white mb-6">Create Debate</h1>
          
          {/* Error Display */}
          {(error || submitError) && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg mb-6">
              {error || submitError}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Topic */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Debate Topic *
              </label>
              <input
                type="text"
                value={formData.topic}
                onChange={(e) => {
                  console.log('Topic changed:', e.target.value);
                  setFormData({...formData, topic: e.target.value});
                }}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-veil-purple"
                placeholder="What should we debate about?"
                required
                minLength="3"
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.topic.length}/300 characters
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description (optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-veil-purple"
                rows="3"
                placeholder="Additional context..."
              />
            </div>

            {/* Side Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Your Side
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    console.log('Selected: FOR');
                    setFormData({...formData, initiatorSide: 'for'});
                  }}
                  className={`p-3 rounded-lg border transition-colors ${
                    formData.initiatorSide === 'for'
                      ? 'bg-green-900/20 border-green-700 text-green-400'
                      : 'bg-slate-700 border-slate-600 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  ✓ For
                </button>
                <button
                  type="button"
                  onClick={() => {
                    console.log('Selected: AGAINST');
                    setFormData({...formData, initiatorSide: 'against'});
                  }}
                  className={`p-3 rounded-lg border transition-colors ${
                    formData.initiatorSide === 'against'
                      ? 'bg-red-900/20 border-red-700 text-red-400'
                      : 'bg-slate-700 border-slate-600 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  ✗ Against
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Currently selected: <span className="text-white font-medium">{formData.initiatorSide.toUpperCase()}</span>
              </p>
            </div>

            {/* Info */}
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
              <p className="text-sm text-blue-300">
                💡 <strong>How it works:</strong> Once someone joins the opposing side and both mark ready, the debate begins!
              </p>
            </div>

            {/* Submit */}
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading || formData.topic.length < 3}
                className="flex-1 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg transition-colors disabled:opacity-50 font-semibold"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <span className="animate-spin mr-2">⏳</span>
                    Creating...
                  </span>
                ) : (
                  'Create Debate'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  console.log('Cancel clicked, navigating to /debates');
                  navigate('/debates');
                }}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>

          {/* Debug Info */}
          <div className="mt-6 p-4 bg-slate-900 rounded-lg border border-slate-700">
            <p className="text-xs text-gray-400 font-mono mb-2">Debug Info:</p>
            <pre className="text-xs text-gray-500">
              {JSON.stringify({ loading, hasError: !!error, formData }, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateDebate;