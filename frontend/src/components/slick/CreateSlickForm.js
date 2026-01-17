import { useEffect, useState } from 'react';
import useSlickStore from '../../store/slickStore';

const CreateSlickForm = ({ targetUserId, targetUsername, onClose }) => {
  const { createSlick, getSuggestions, loading } = useSlickStore();
  // Remove the unused communities import

  const [formData, setFormData] = useState({
    content: '',
    tone: {
      category: 'constructive',
      intensity: 5
    },
    visibility: 'public'
  });

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const toneCategories = [
    { value: 'praise', label: '🌟 Praise', desc: 'Positive appreciation' },
    { value: 'constructive', label: '🛠️ Constructive', desc: 'Helpful feedback' },
    { value: 'tease', label: '😄 Tease', desc: 'Playful humor' },
    { value: 'observation', label: '👁️ Observation', desc: 'Neutral comment' }
  ];

  // Fix the useEffect
  useEffect(() => {
    const loadSuggestions = async () => {
      const result = await getSuggestions(targetUserId, '');
      if (result.success) {
        setSuggestions(result.data.suggestions || []);
      }
    };
    
    if (targetUserId) {
      loadSuggestions();
    }
  }, [targetUserId, getSuggestions]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.content.trim()) return;

    setSubmitting(true);
    const result = await createSlick({
      content: formData.content,
      targetUserId,
      tone: formData.tone,
      visibility: formData.visibility
    });

    if (result.success) {
      onClose();
    } else {
      setAiSuggestion(result.suggestion);
    }
    setSubmitting(false);
  };

  // Fix the function name (not a hook)
  const handleUseSuggestion = (suggestion) => {
    setFormData({
      ...formData,
      content: suggestion.content,
      tone: suggestion.tone
    });
    setShowSuggestions(false);
  };

  const useAiSuggestion = () => {
    setFormData({
      ...formData,
      content: aiSuggestion
    });
    setAiSuggestion(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      {/* Rest of your component JSX - replace the onClick with: */}
      {/* onClick={() => handleUseSuggestion(suggestion)} */}
      
      {/* Keep all the rest of your JSX the same */}
    </div>
  );
};

export default CreateSlickForm;