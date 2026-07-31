import { useEffect, useMemo, useState } from 'react';
import { ErrorState, LoadingState } from '../components/ui';
import { Link } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import DebateCard from '../components/debate/DebateCard';
import PracticeDebateModal from '../components/debate/PracticeDebateModal';
import useDebateStore from '../store/debateStore';

// Ordered by what needs attention first: a debate waiting on you outranks one
// waiting on someone else, which outranks one that is already over.
const SECTIONS = [
  { id: 'active',    label: 'In progress', icon: '\u26a1', hint: 'a turn is due' },
  { id: 'pending',   label: 'Waiting',     icon: '\u23f3', hint: 'needs an opponent or a ready check' },
  { id: 'completed', label: 'Finished',    icon: '\u2713',  hint: 'scored and closed' },
];

const FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'active',    label: 'In progress' },
  { id: 'pending',   label: 'Waiting' },
  { id: 'completed', label: 'Finished' },
];

const Debates = () => {
  const { debates, fetchDebates, loading, error } = useDebateStore();
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchDebates();
  }, [fetchDebates]);

  // 'cancelled' is deliberately absent from SECTIONS, so it is grouped but never
  // rendered — a cancelled debate is noise, not a task.
  const grouped = useMemo(() => {
    const buckets = { active: [], pending: [], completed: [], cancelled: [] };
    for (const debate of debates) {
      (buckets[debate.status] ?? buckets.pending).push(debate);
    }
    // Newest first within each section.
    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return buckets;
  }, [debates]);

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Debates</h1>
            <p className="text-slate-400">Structured discourse & reasoning</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPracticeOpen(true)}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-lg transition-colors font-semibold"
            >
              🤖 Debate the AI
            </button>
            <Link
              to="/debates/create"
              className="px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-veil-on-accent rounded-lg transition-colors font-semibold"
            >
              + Start Debate
            </Link>
          </div>
        </div>

        {!loading && debates.length > 0 && (
          <div className="flex items-center gap-2 mb-6">
            {FILTERS.map(({ id, label }) => {
              const count = id === 'all' ? debates.length : grouped[id].length;
              return (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === id
                      ? 'bg-veil-purple text-veil-on-accent'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {label}
                  <span className={`ml-2 text-xs ${filter === id ? 'text-slate-200' : 'text-slate-600'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading debates…" />

        ) : error ? (
          // The store already tracked this; the page simply never read it, so a
          // failed fetch rendered an empty list indistinguishable from "none yet".
          <ErrorState title="Couldn't load debates" body={error} onRetry={fetchDebates} />

        ) : debates.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
            <p className="text-slate-400 text-lg mb-2">No debates yet</p>
            <p className="text-slate-500 text-sm mb-5">
              You don't need an opponent to start — the AI will argue back right now.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPracticeOpen(true)}
                className="px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-veil-on-accent rounded-lg font-semibold"
              >
                🤖 Debate the AI
              </button>
              <Link
                to="/debates/create"
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
              >
                Challenge a person
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {SECTIONS.filter(s => filter === 'all' || filter === s.id).map(section => {
              const items = grouped[section.id];
              if (items.length === 0) return null;

              return (
                <section key={section.id}>
                  <div className="flex items-baseline gap-3 mb-4">
                    <h2 className="text-lg font-semibold text-white">
                      {section.icon} {section.label}
                    </h2>
                    <span className="text-sm text-slate-500">{items.length}</span>
                    <span className="text-xs text-slate-600">— {section.hint}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map(debate => (
                      <DebateCard key={debate._id} debate={debate} />
                    ))}
                  </div>
                </section>
              );
            })}

            {SECTIONS.every(s => (filter !== 'all' && filter !== s.id) || grouped[s.id].length === 0) && (
              <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-slate-400">Nothing here right now.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <PracticeDebateModal isOpen={practiceOpen} onClose={() => setPracticeOpen(false)} />
    </div>
  );
};

export default Debates;