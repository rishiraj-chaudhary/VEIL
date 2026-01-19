import { useEffect, useState } from 'react';
import useSlickStore from '../../store/slickStore.js';

const CreateSlickForm = ({ targetUserId, targetUsername, onClose }) => {
  const { createSlick, getSuggestions, loading } = useSlickStore();

  const [formData, setFormData] = useState({
    content: '',
    tone: {
      category: 'constructive',
      intensity: 5,
    },
    visibility: 'public',
  });

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const toneCategories = [
    { value: 'praise', label: '🌟 Praise', desc: 'Positive appreciation' },
    { value: 'constructive', label: '🛠️ Constructive', desc: 'Helpful feedback' },
    { value: 'tease', label: '😄 Tease', desc: 'Playful humor' },
    { value: 'observation', label: '👁️ Observation', desc: 'Neutral comment' },
  ];

  /* ================= FIXED: Load AI suggestions on mount ================= */
  useEffect(() => {
    loadSuggestions();
  }, [targetUserId]);

  const loadSuggestions = async () => {
    if (!targetUserId) return;

    console.log('🔄 Loading AI suggestions for user:', targetUserId);
    setLoadingSuggestions(true);

    try {
      const result = await getSuggestions(targetUserId, '');
      console.log('✅ Suggestions loaded:', result);
      
      if (result?.success && result.data) {
        // Handle different response structures
        const suggestionsArray = result.data.suggestions || result.data || [];
        console.log('📋 Setting suggestions:', suggestionsArray);
        setSuggestions(suggestionsArray);
      } else {
        console.warn('⚠️ No suggestions in response:', result);
        setSuggestions([]);
      }
    } catch (error) {
      console.error('❌ Failed to load suggestions:', error);
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.content.trim()) {
      alert('Please enter feedback content (min 10 characters)');
      return;
    }

    if (formData.content.trim().length < 10) {
      alert('Feedback must be at least 10 characters long');
      return;
    }

    setSubmitting(true);

    const result = await createSlick({
      content: formData.content,
      targetUserId,
      tone: formData.tone,
      visibility: formData.visibility,
    });

    setSubmitting(false);

    if (result?.success) {
      onClose();
    } else if (result?.suggestion) {
      setAiSuggestion(result.suggestion);
    } else {
      alert(result?.error || 'Failed to send feedback');
    }
  };

  const handleUseSuggestion = (suggestion) => {
    console.log('📝 Using suggestion:', suggestion);
    setFormData({
      ...formData,
      content: suggestion.content,
      tone: suggestion.tone,
    });
    setShowSuggestions(false);
  };

  const useAiSuggestion = () => {
    setFormData({
      ...formData,
      content: aiSuggestion,
    });
    setAiSuggestion(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-white">
              Send Anonymous Feedback to {targetUsername}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-400 text-sm mt-2">
            Share honest feedback anonymously. Your identity will be encrypted.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* AI Suggestions Button - FIXED */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => {
                if (suggestions.length === 0) {
                  loadSuggestions();
                }
                setShowSuggestions(!showSuggestions);
              }}
              disabled={loadingSuggestions}
              className="flex items-center space-x-2 text-sm text-veil-purple hover:text-veil-indigo mb-2 disabled:opacity-50"
            >
              <span>💡</span>
              <span>
                {loadingSuggestions ? 'Loading AI suggestions...' : 
                 suggestions.length > 0 ? `View ${suggestions.length} AI suggestions` : 
                 'Get AI suggestions'}
              </span>
            </button>

            {/* Suggestions Display - ENHANCED */}
            {showSuggestions && (
              <div className="space-y-2 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                {loadingSuggestions ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-veil-purple"></div>
                    <span className="ml-3 text-gray-400">Generating personalized suggestions...</span>
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="text-center py-4 text-gray-400">
                    <p>No suggestions available yet.</p>
                    <button
                      type="button"
                      onClick={loadSuggestions}
                      className="mt-2 text-veil-purple hover:text-veil-indigo text-sm"
                    >
                      Try loading again
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-gray-400 mb-3">
                      Click any suggestion to use it:
                    </div>
                    {suggestions.map((s, i) => (
                      <div
                        key={i}
                        className="p-3 bg-slate-600 rounded-lg cursor-pointer hover:bg-slate-500 transition-colors border border-transparent hover:border-veil-purple"
                        onClick={() => handleUseSuggestion(s)}
                      >
                        <p className="text-sm text-white mb-2">{s.content}</p>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400">
                            {s.explanation}
                          </span>
                          <span className="text-xs px-2 py-1 bg-slate-700 rounded">
                            {s.tone?.category} • {s.tone?.intensity}/10
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* AI Rewrite Suggestion */}
          {aiSuggestion && (
            <div className="mb-6 p-4 bg-blue-900/20 border border-blue-400 rounded-lg">
              <p className="text-blue-300 text-sm mb-2">
                AI suggests this improved version:
              </p>
              <p className="text-blue-100 mb-3">{aiSuggestion}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={useAiSuggestion}
                  className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded transition-colors"
                >
                  Use This
                </button>
                <button
                  type="button"
                  onClick={() => setAiSuggestion(null)}
                  className="text-xs bg-slate-600 hover:bg-slate-500 px-3 py-1 rounded transition-colors"
                >
                  Keep Original
                </button>
              </div>
            </div>
          )}

          {/* Content Textarea */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Your Feedback
            </label>
            <textarea
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              placeholder="Share your honest thoughts... (minimum 10 characters)"
              className="w-full bg-slate-700 text-white rounded-lg p-3 min-h-[120px] border border-slate-600 focus:border-veil-purple resize-none"
              maxLength={500}
              required
            />
            <div className="flex justify-between mt-1">
              <span className={`text-xs ${formData.content.length < 10 ? 'text-red-400' : 'text-gray-400'}`}>
                {formData.content.length < 10 ? `${10 - formData.content.length} more characters needed` : `${formData.content.length}/500`}
              </span>
            </div>
          </div>

          {/* Tone Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tone
            </label>
            <div className="grid grid-cols-2 gap-2">
              {toneCategories.map((tone) => (
                <button
                  key={tone.value}
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      tone: { ...formData.tone, category: tone.value },
                    })
                  }
                  className={`p-3 rounded-lg border transition-colors text-left ${
                    formData.tone.category === tone.value
                      ? 'bg-veil-purple border-veil-purple text-white'
                      : 'bg-slate-700 border-slate-600 text-gray-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-medium">{tone.label}</div>
                  <div className="text-xs opacity-75">{tone.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Intensity Slider */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Intensity: {formData.tone.intensity}/10
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={formData.tone.intensity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  tone: { ...formData.tone, intensity: parseInt(e.target.value) },
                })
              }
              className="w-full"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              disabled={submitting || loading || formData.content.length < 10}
              className="flex-1 bg-veil-purple hover:bg-veil-indigo text-white py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending...' : 'Send Anonymous Feedback'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateSlickForm;