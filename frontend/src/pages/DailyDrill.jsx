/**
 * DAILY DRILL
 * Route: /drill
 *
 * One prompt a day, scored immediately. The product's only daily loop — a debate
 * is episodic and gives nobody a reason to come back tomorrow.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import api from '../services/api';

const MIN_WORDS = 30;

const StreakBadge = ({ streak }) => (
  <div className="flex items-center gap-4">
    <div className="text-center">
      <div className="text-2xl font-bold text-orange-400">{streak.current}</div>
      <div className="text-xs text-gray-500">day streak</div>
    </div>
    <div className="text-center">
      <div className="text-2xl font-bold text-gray-300">{streak.longest}</div>
      <div className="text-xs text-gray-500">best</div>
    </div>
    <div className="text-center">
      <div className="text-2xl font-bold text-gray-300">{streak.total}</div>
      <div className="text-xs text-gray-500">total</div>
    </div>
  </div>
);

const ScoreRow = ({ label, value }) => {
  if (value === null || value === undefined) return null;
  const tone = value >= 70 ? 'bg-emerald-500' : value >= 45 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-20 shrink-0 capitalize">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{value}</span>
    </div>
  );
};

const DailyDrill = () => {
  const [drill, setDrill] = useState(null);
  const [streak, setStreak] = useState({ current: 0, longest: 0, total: 0 });
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/drills/today');
      setDrill(res.data.data.drill);
      setStreak(res.data.data.streak);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load today\'s drill.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const words = response.trim().split(/\s+/).filter(Boolean).length;
  const canSubmit = words >= MIN_WORDS && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post('/drills/today', { response: response.trim() });
      setDrill(res.data.data.drill);
      if (res.data.data.streak) setStreak(res.data.data.streak);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-veil-dark">
        <Navbar />
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-veil-purple" />
        </div>
      </div>
    );
  }

  const done = !!drill?.completedAt;

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8">
        <header className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Today's drill</h1>
            <p className="text-sm text-gray-400 mt-1">
              One argument. A few minutes. Scored the same way a debate turn is.
            </p>
          </div>
          <StreakBadge streak={streak} />
        </header>

        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5 mb-5">
          <div className="text-xs uppercase tracking-wide text-veil-purple mb-2">{drill?.skill}</div>
          <p className="text-lg text-white leading-snug">{drill?.prompt}</p>
        </div>

        {!done ? (
          <>
            <textarea
              value={response}
              onChange={e => setResponse(e.target.value)}
              placeholder="Make your argument…"
              className="w-full min-h-[220px] bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-sm focus:outline-none focus:border-veil-purple"
              disabled={submitting}
            />

            <div className="flex items-center justify-between mt-3">
              <span className={`text-xs ${words >= MIN_WORDS ? 'text-gray-500' : 'text-amber-400'}`}>
                {words} words{words < MIN_WORDS && ` · ${MIN_WORDS - words} more needed`}
              </span>
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="px-6 py-2.5 bg-veil-purple hover:bg-veil-indigo disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-sm"
              >
                {submitting ? 'Scoring…' : 'Submit'}
              </button>
            </div>

            {error && <p className="text-rose-400 text-sm mt-3">{error}</p>}
          </>
        ) : (
          <div className="space-y-5">
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
              <div className="flex items-baseline justify-between mb-4">
                <span className="text-sm text-gray-400">Your score</span>
                <span className="text-3xl font-bold text-white">{drill.scores?.overall ?? '—'}<span className="text-base text-gray-500">/100</span></span>
              </div>

              <div className="space-y-2">
                <ScoreRow label="substance" value={drill.scores?.substance} />
                <ScoreRow label="evidence"  value={drill.scores?.evidence} />
                <ScoreRow label="clarity"   value={drill.scores?.clarity} />
                <ScoreRow label="tone"      value={drill.scores?.tone} />
              </div>

              {drill.feedback && (
                <p className="text-sm text-gray-300 mt-4 pt-4 border-t border-slate-800">{drill.feedback}</p>
              )}

              {drill.fallacies?.length > 0 && (
                <p className="text-xs text-rose-400 mt-2">
                  Flagged: {drill.fallacies.join(', ')}
                </p>
              )}
            </div>

            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <p className="text-sm text-gray-300 mb-1">Your answer</p>
              <p className="text-sm text-gray-400 whitespace-pre-wrap">{drill.response}</p>
            </div>

            <div className="text-center py-4">
              <p className="text-gray-400 text-sm mb-3">
                Done for today. Come back tomorrow to keep the streak.
              </p>
              <Link
                to="/debates"
                className="inline-block px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg font-semibold"
              >
                Want more? Debate the AI
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyDrill;
