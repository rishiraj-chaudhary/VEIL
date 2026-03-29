/**
 * HUDDLE BUTTON — Phase 11
 *
 * Floating button to start or join a huddle.
 * Place at: frontend/src/components/huddle/HuddleButton.jsx
 *
 * Usage:
 *   <HuddleButton contextType="post" contextId={post._id} />
 *   <HuddleButton />  // standalone
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const HuddleButton = ({ contextType = 'standalone', contextId = null, compact = false }) => {
  const navigate = useNavigate();
  const [mode, setMode]           = useState(null); // null | 'menu' | 'join'
  const [joinCode, setJoinCode]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const startHuddle = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/huddles', { contextType, contextId });
      const huddleId = res.data.data.huddle._id;
      navigate(`/huddle/${huddleId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start huddle');
      setLoading(false);
    }
  };

  const joinHuddle = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(`/huddles/join/${joinCode.trim().toUpperCase()}`);
      const huddleId = res.data.data.huddle._id;
      navigate(`/huddle/${huddleId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid join code');
      setLoading(false);
    }
  };

  if (mode === 'join') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Enter code (e.g. ABC123)"
          value={joinCode}
          onChange={e => setJoinCode(e.target.value.toUpperCase())}
          maxLength={6}
          className="w-36 bg-slate-800 border border-slate-600 text-white text-xs px-3 py-1.5 rounded-lg font-mono uppercase focus:outline-none focus:border-veil-purple"
          onKeyDown={e => e.key === 'Enter' && joinHuddle()}
          autoFocus
        />
        <button
          onClick={joinHuddle}
          disabled={loading || !joinCode.trim()}
          className="px-3 py-1.5 bg-veil-purple hover:bg-veil-indigo text-white text-xs rounded-lg disabled:opacity-50"
        >
          {loading ? '…' : 'Join'}
        </button>
        <button onClick={() => { setMode(null); setError(null); }} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  if (mode === 'menu') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={startHuddle}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-veil-purple hover:bg-veil-indigo text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          🎙️ {loading ? 'Starting…' : 'Start Huddle'}
        </button>
        <button
          onClick={() => setMode('join')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors"
        >
          🔗 Join with Code
        </button>
        <button onClick={() => setMode(null)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setMode('menu')}
      className={`flex items-center gap-1.5 text-gray-400 hover:text-veil-purple transition-colors ${
        compact ? 'text-xs' : 'text-sm px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 hover:border-veil-purple/50'
      }`}
    >
      🎙️ {compact ? '' : 'Huddle'}
    </button>
  );
};

export default HuddleButton;