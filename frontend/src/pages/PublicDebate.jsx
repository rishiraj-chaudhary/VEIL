/**
 * PUBLIC DEBATE REPLAY
 * Route: /d/:id — no authentication required.
 *
 * The only page that works without an account. Every other route is behind
 * ProtectedRoute, which meant nothing this product creates could ever be seen by
 * someone who had not already signed up.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const SIDE_STYLES = {
  for:     'border-emerald-600/40 bg-emerald-950/20',
  against: 'border-rose-600/40 bg-rose-950/20',
};

const ScorePill = ({ label, value }) => {
  if (value === null || value === undefined) return null;

  const tone = value >= 70 ? 'text-emerald-400' : value >= 45 ? 'text-amber-400' : 'text-rose-400';
  return (
    <span className="text-xs text-gray-500">
      {label} <span className={tone}>{value}</span>
    </span>
  );
};

const PublicDebate = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/debates/public/${id}`);
      if (!res.ok) {
        setError('This debate is not available publicly.');
        return;
      }
      setData((await res.json()).data);
    } catch {
      setError('Could not load this debate.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-veil-dark flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-gray-400 mb-4">{error}</p>
          <Link to="/" className="text-veil-purple hover:underline text-sm">Go to VEIL</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-veil-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-veil-purple" />
      </div>
    );
  }

  const { debate, turns } = data;

  return (
    <div className="min-h-screen bg-veil-dark">
      <header className="border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-white font-bold">VEIL</Link>
          <Link
            to="/register"
            className="text-xs px-4 py-2 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg"
          >
            Argue something yourself
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold text-white">{debate.topic}</h1>
            <button
              onClick={share}
              className="shrink-0 text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg"
            >
              {copied ? 'Link copied' : 'Share'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
            {debate.participants.map(p => (
              <span
                key={`${p.username}-${p.side}`}
                className={`px-3 py-1 rounded-lg border ${SIDE_STYLES[p.side] || 'border-slate-700'}`}
              >
                <span className="text-white">{p.username}</span>
                {p.isAI && <span className="text-gray-500 text-xs"> (AI)</span>}
                <span className="text-gray-500 text-xs uppercase ml-2">{p.side}</span>
              </span>
            ))}
          </div>

          {debate.winner && (
            <p className="text-sm text-gray-400 mt-3">
              Verdict:{' '}
              <span className="text-white font-medium">
                {debate.winner === 'draw' ? 'Draw' : `${debate.winner.toUpperCase()} side`}
              </span>
              {debate.finalScores && (
                <span className="text-gray-600">
                  {' '}· for {debate.finalScores.for} — against {debate.finalScores.against}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {turns.map(turn => (
            <article
              key={turn._id}
              className={`rounded-xl border p-5 ${SIDE_STYLES[turn.side] || 'border-slate-700'}`}
            >
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-white font-medium">
                  {turn.username}
                  <span className="text-gray-500 text-xs uppercase ml-2">{turn.side}</span>
                </span>
                <span className="text-xs text-gray-600">Round {turn.round}</span>
              </div>

              <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{turn.content}</p>

              <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-800">
                <ScorePill label="quality" value={turn.scores.overall} />
                <ScorePill label="clarity" value={turn.scores.clarity} />
                <ScorePill label="evidence" value={turn.scores.evidence} />
                {turn.scores.fallacies.length > 0 && (
                  <span className="text-xs text-rose-400">
                    {turn.scores.fallacies.join(', ')}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center border-t border-slate-800 pt-8">
          <p className="text-gray-400 text-sm mb-3">
            Every claim made here is scored and tracked. Arguments have a record.
          </p>
          <Link
            to="/register"
            className="inline-block px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg font-semibold"
          >
            Debate the AI in 60 seconds
          </Link>
        </div>
      </main>
    </div>
  );
};

export default PublicDebate;
