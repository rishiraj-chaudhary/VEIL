/**
 * PRACTICE DEBATE MODAL
 *
 * Starts a debate against the AI opponent. Exists because a debate normally
 * needs a second person to show up, which is the single biggest reason a user
 * bounces before ever using the product.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const DIFFICULTIES = [
  { id: 'easy',     label: 'Sparring',     hint: 'Makes simple points, concedes readily' },
  { id: 'balanced', label: 'Even match',   hint: 'Argues clearly, engages your points' },
  { id: 'hard',     label: 'Strong',       hint: 'Cites evidence, attacks weak reasoning' },
  { id: 'brutal',   label: 'Championship', hint: 'Competitive standard, concedes nothing' },
];

const STYLES = [
  { id: 'evidence',   label: 'Evidence-driven' },
  { id: 'socratic',   label: 'Socratic' },
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'empathetic', label: 'Empathetic' },
];

const SUGGESTED_TOPICS = [
  'Social media does more harm than good for teenagers',
  'Remote work should be a legal right',
  'AI-generated art is real art',
  'University education should be free',
  'Nuclear power is essential to decarbonisation',
];

const PracticeDebateModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [side, setSide] = useState('for');
  const [difficulty, setDifficulty] = useState('balanced');
  const [style, setStyle] = useState('evidence');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const start = async () => {
    if (topic.trim().length < 3) {
      setError('Give your debate a topic first.');
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const res = await api.post('/debates/ai', {
        topic: topic.trim(),
        side,
        difficulty,
        style,
      });
      navigate(`/debates/${res.data.data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start the practice debate.');
      setStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-bold text-white">Debate the AI</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-gray-400 mb-5">
          No waiting for an opponent. Your arguments are scored the same way, and the claims
          you make still count towards your track record.
        </p>

        <label className="block text-xs font-medium text-gray-400 mb-1">Topic</label>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="What should the debate be about?"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm mb-2 focus:outline-none focus:border-veil-purple"
        />
        <div className="flex flex-wrap gap-1.5 mb-5">
          {SUGGESTED_TOPICS.map(t => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className="text-xs px-2 py-1 rounded-md bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              {t.length > 38 ? `${t.slice(0, 38)}…` : t}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-gray-400 mb-1">You argue</label>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {['for', 'against'].map(s => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                side === s ? 'bg-veil-purple text-white' : 'bg-slate-800 text-gray-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-gray-400 mb-1">Difficulty</label>
        <div className="space-y-1.5 mb-5">
          {DIFFICULTIES.map(d => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                difficulty === d.id
                  ? 'border-veil-purple bg-veil-purple/10'
                  : 'border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="text-sm text-white">{d.label}</div>
              <div className="text-xs text-gray-500">{d.hint}</div>
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-gray-400 mb-1">Opponent style</label>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {STYLES.map(s => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={`py-2 rounded-lg text-sm transition-colors ${
                style === s.id ? 'bg-slate-700 text-white' : 'bg-slate-800 text-gray-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}

        <button
          onClick={start}
          disabled={starting}
          className="w-full py-3 bg-veil-purple hover:bg-veil-indigo disabled:opacity-50 text-white rounded-lg font-semibold transition-colors"
        >
          {starting ? 'Setting up…' : 'Start debating'}
        </button>
      </div>
    </div>
  );
};

export default PracticeDebateModal;
