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
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const toneCategories = [
    { value: 'praise', label: '🌟 Praise', desc: 'Positive appreciation' },
    { value: 'constructive', label: '🛠️ Constructive', desc: 'Helpful feedback' },
    { value: 'tease', label: '😄 Tease', desc: 'Playful humor' },
    { value: 'observation', label: '👁️ Observation', desc: 'Neutral comment' },
  ];

  /* ================= SAFE AI SUGGESTION LOADER ================= */
  const loadSuggestions = async () => {
    if (!targetUserId) return;

    const result = await getSuggestions(targetUserId, '');
    if (result?.success) {
      setSuggestions(result.data.suggestions || []);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, [targetUserId, getSuggestions]);

  /* ================= SUBMIT ================= */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.content.trim()) return;

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
    }
  };

  const handleUseSuggestion = (suggestion) => {
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
          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setShowSuggestions(!showSuggestions)}
                className="text-sm text-veil-purple hover:text-veil-indigo mb-2"
              >
                💡 Need inspiration? View AI suggestions ({suggestions.length})
              </button>

              {showSuggestions && (
                <div className="space-y-2 p-3 bg-slate-700/50 rounded">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="p-2 bg-slate-600 rounded cursor-pointer hover:bg-slate-500"
                      onClick={() => handleUseSuggestion(s)}
                    >
                      <p className="text-sm text-white">{s.content}</p>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-gray-400">
                          {s.explanation}
                        </span>
                        <span className="text-xs px-2 py-1 bg-slate-700 rounded">
                          {s.tone.category} • {s.tone.intensity}/10
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Rewrite */}
          {aiSuggestion && (
            <div className="mb-6 p-4 bg-blue-900/20 border border-blue-400 rounded">
              <p className="text-blue-300 text-sm mb-2">
                AI suggests this improved version:
              </p>
              <p className="text-blue-100 mb-3">{aiSuggestion}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={useAiSuggestion}
                  className="text-xs bg-blue-600 px-3 py-1 rounded"
                >
                  Use This
                </button>
                <button
                  type="button"
                  onClick={() => setAiSuggestion(null)}
                  className="text-xs bg-slate-600 px-3 py-1 rounded"
                >
                  Keep Original
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <textarea
            value={formData.content}
            onChange={(e) =>
              setFormData({ ...formData, content: e.target.value })
            }
            placeholder="Share your honest thoughts..."
            className="w-full bg-slate-700 text-white rounded-lg p-3 min-h-[120px] border border-slate-600 focus:border-veil-purple resize-none"
            maxLength={500}
            required
          />

          {/* Submit */}
          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              disabled={submitting || loading}
              className="flex-1 bg-veil-purple hover:bg-veil-indigo text-white py-3 rounded disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send Anonymous Feedback'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-slate-600 hover:bg-slate-500 text-white rounded"
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