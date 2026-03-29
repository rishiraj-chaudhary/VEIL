/**
 * HUDDLES PAGE — Phase 11
 * Route: /huddles
 * Place at: frontend/src/pages/HuddlesPage.jsx
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import api from '../services/api';

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const cfg = {
    waiting:   { color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-700/40', label: 'Waiting' },
    active:    { color: 'text-green-400',  bg: 'bg-green-900/20 border-green-700/40',   label: 'Active' },
    ended:     { color: 'text-gray-400',   bg: 'bg-slate-700/50 border-slate-600',      label: 'Ended' },
    cancelled: { color: 'text-red-400',    bg: 'bg-red-900/20 border-red-700/40',       label: 'Cancelled' },
  }[status] || { color: 'text-gray-400', bg: 'bg-slate-700', label: status };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
};

// ── Huddle history card ────────────────────────────────────────────────────────
const HuddleCard = ({ huddle, currentUserId, onOpen }) => {
  const isHost     = huddle.host?._id === currentUserId || huddle.host === currentUserId;
  const peer       = isHost ? huddle.guest : huddle.host;
  const duration   = huddle.duration ? `${Math.floor(huddle.duration / 60)}m ${huddle.duration % 60}s` : null;
  const hasSummary = !!huddle.aiSummary?.summary;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-veil-purple/20 flex items-center justify-center text-sm">
            🎙️
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {isHost ? 'Your huddle' : `Huddle with ${huddle.host?.username}`}
            </p>
            <p className="text-xs text-gray-500">
              {peer ? `with ${peer.username}` : 'No peer joined'}
              {duration && ` · ${duration}`}
            </p>
          </div>
        </div>
        <StatusBadge status={huddle.status} />
      </div>

      {/* AI summary snippet */}
      {hasSummary && (
        <p className="text-xs text-gray-400 line-clamp-2 mb-3 border-l-2 border-veil-purple/30 pl-2">
          {huddle.aiSummary.summary}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">
          {new Date(huddle.createdAt).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-2">
          {huddle.status === 'waiting' && isHost && (
            <span className="text-xs text-yellow-400 font-mono bg-yellow-900/20 px-2 py-1 rounded">
              {huddle.joinCode}
            </span>
          )}
          <button
            onClick={() => onOpen(huddle)}
            className="text-xs text-veil-purple hover:underline"
          >
            {huddle.status === 'ended' ? 'View summary →' : 'Open →'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const HuddlesPage = () => {
  const navigate   = useNavigate();
  const [huddles, setHuddles]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [starting, setStarting]   = useState(false);
  const [joining, setJoining]     = useState(false);
  const [joinCode, setJoinCode]   = useState('');
  const [error, setError]         = useState(null);

  const user = JSON.parse(localStorage.getItem('veil_user') || '{}');

  useEffect(() => {
    fetchHuddles();
  }, []);

  const fetchHuddles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/huddles/my');
      setHuddles(res.data.data.huddles || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const startHuddle = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await api.post('/huddles', { contextType: 'standalone' });
      navigate(`/huddle/${res.data.data.huddle._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start huddle');
      setStarting(false);
    }
  };

  const joinHuddle = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setError(null);
    try {
      const res = await api.post(`/huddles/join/${joinCode.trim().toUpperCase()}`);
      navigate(`/huddle/${res.data.data.huddle._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid join code');
      setJoining(false);
    }
  };

  const openHuddle = (huddle) => navigate(`/huddle/${huddle._id}`);

  const activeHuddles = huddles.filter(h => ['waiting', 'active'].includes(h.status));
  const pastHuddles   = huddles.filter(h => h.status === 'ended');

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">🎙️ Huddles</h1>
          <p className="text-gray-400">Real-time audio/video conversations with AI-powered summaries and post generation.</p>
        </div>

        {/* Start / Join */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">

          {/* Start new */}
          <div className="bg-gradient-to-br from-veil-purple/10 to-slate-800 border border-veil-purple/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-veil-purple/20 flex items-center justify-center text-xl">🎙️</div>
              <div>
                <h2 className="text-base font-semibold text-white">Start a Huddle</h2>
                <p className="text-xs text-gray-400">Create a room and share the code</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Your conversation will be transcribed and AI will generate a summary, extract key claims, and offer to publish a post.
            </p>
            <button
              onClick={startHuddle}
              disabled={starting}
              className="w-full py-2.5 bg-veil-purple hover:bg-veil-indigo text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {starting
                ? <><div className="w-4 h-4 border-t-2 border-white rounded-full animate-spin" /> Starting…</>
                : '+ Start Huddle'}
            </button>
          </div>

          {/* Join existing */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl">🔗</div>
              <div>
                <h2 className="text-base font-semibold text-white">Join a Huddle</h2>
                <p className="text-xs text-gray-400">Enter a 6-character join code</p>
              </div>
            </div>
            <input
              type="text"
              placeholder="e.g. ABC123"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-full bg-slate-900 border border-slate-600 text-white text-sm px-4 py-2.5 rounded-lg font-mono uppercase mb-3 focus:outline-none focus:border-veil-purple tracking-widest"
              onKeyDown={e => e.key === 'Enter' && joinHuddle()}
            />
            <button
              onClick={joinHuddle}
              disabled={joining || !joinCode.trim()}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {joining
                ? <><div className="w-4 h-4 border-t-2 border-white rounded-full animate-spin" /> Joining…</>
                : 'Join Huddle'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {/* How it works */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 mb-10">
          <h3 className="text-sm font-semibold text-white mb-4">How it works</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { step: '1', icon: '🎙️', label: 'Start huddle', desc: 'Get a 6-char code' },
              { step: '2', icon: '🔗', label: 'Share code',   desc: 'Peer joins with code' },
              { step: '3', icon: '💬', label: 'Discuss',      desc: 'Audio/video + captions' },
              { step: '4', icon: '✦',  label: 'AI summary',   desc: 'Claims + post draft' },
            ].map(({ step, icon, label, desc }) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl mx-auto mb-2">
                  {icon}
                </div>
                <p className="text-xs font-semibold text-white">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Active huddles */}
        {activeHuddles.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Active</h2>
            <div className="space-y-3">
              {activeHuddles.map(h => (
                <HuddleCard key={h._id} huddle={h} currentUserId={user.id} onOpen={openHuddle} />
              ))}
            </div>
          </div>
        )}

        {/* Past huddles */}
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
            Past Huddles {pastHuddles.length > 0 && <span className="text-gray-500 font-normal normal-case">({pastHuddles.length})</span>}
          </h2>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-veil-purple" />
            </div>
          ) : pastHuddles.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="text-4xl mb-3">🎙️</div>
              <p className="text-gray-400 text-sm">No past huddles yet.</p>
              <p className="text-gray-500 text-xs mt-1">Start one above and invite someone to join.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pastHuddles.map(h => (
                <HuddleCard key={h._id} huddle={h} currentUserId={user.id} onOpen={openHuddle} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default HuddlesPage;