/**
 * ARGUMENT TRACK RECORD
 * Route: /reputation
 *
 * The product's central promise made visible: every claim a user has advanced in
 * a debate, and how it held up when someone challenged it.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import api from '../services/api';

const TIER_STYLES = {
  Ironclad:  'text-emerald-300 border-emerald-500/40 bg-emerald-900/20',
  Solid:     'text-cyan-300 border-cyan-500/40 bg-cyan-900/20',
  Contested: 'text-amber-300 border-amber-500/40 bg-amber-900/20',
  Brittle:   'text-rose-300 border-rose-500/40 bg-rose-900/20',
  Untested:  'text-gray-300 border-slate-600 bg-slate-800/60',
};

const Stat = ({ label, value, hint }) => (
  <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="text-xs text-gray-400 mt-1">{label}</div>
    {hint && <div className="text-xs text-gray-600 mt-1">{hint}</div>}
  </div>
);

const ResilienceBar = ({ score }) => (
  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
    <div
      className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all"
      style={{ width: `${Math.max(2, score)}%` }}
    />
  </div>
);

const ClaimRow = ({ claim, tone }) => {
  const score = claim.stats?.claimResilienceScore ?? 0;
  const refutations = claim.stats?.refutationCount ?? 0;

  return (
    <div className="py-3 border-b border-slate-800 last:border-0">
      <p className="text-sm text-gray-200 leading-snug">{claim.originalText}</p>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
        <span className={tone === 'strong' ? 'text-emerald-400' : 'text-rose-400'}>
          {score}/100 resilience
        </span>
        <span>·</span>
        <span>challenged {refutations}×</span>
        {claim.topic && <><span>·</span><span className="capitalize">{claim.topic}</span></>}
      </div>
    </div>
  );
};

const Panel = ({ title, subtitle, children }) => (
  <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
    <h3 className="text-sm font-semibold text-white">{title}</h3>
    {subtitle && <p className="text-xs text-gray-500 mt-0.5 mb-2">{subtitle}</p>}
    {children}
  </div>
);

const ReputationPage = () => {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(userId ? `/reputation/${userId}` : '/reputation/me');
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your track record.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

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

  if (error) {
    return (
      <div className="min-h-screen bg-veil-dark">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  const tierStyle = TIER_STYLES[data.tier] || TIER_STYLES.Untested;
  const hasContested = data.contestedClaims > 0;

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            {data.username ? `${data.username}'s track record` : 'Your argument track record'}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Every claim you make in a debate is recorded. When someone challenges it, how it
            holds up is recorded too.
          </p>
        </header>

        <div className={`rounded-xl border p-5 mb-6 ${tierStyle}`}>
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-xs uppercase tracking-wide opacity-70">Resilience</div>
              <div className="text-3xl font-bold">{data.tier}</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{data.resilienceScore}</div>
              <div className="text-xs opacity-70">out of 100</div>
            </div>
          </div>
          <ResilienceBar score={data.resilienceScore} />
          <p className="text-sm mt-3 opacity-90">{data.tierBlurb}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Claims made" value={data.totalClaims} />
          <Stat label="Challenged" value={data.contestedClaims} hint="someone argued against them" />
          <Stat label="Survived" value={data.survivedClaims} hint="held up under challenge" />
          <Stat
            label="Survival rate"
            value={data.survivalRate === null ? '—' : `${data.survivalRate}%`}
          />
        </div>

        {!hasContested && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 mb-6">
            <p className="text-sm text-gray-300">
              You have made <strong className="text-white">{data.totalClaims}</strong> claims, but none
              have been challenged yet. A track record only means something once your arguments
              have been tested — debate someone (or the AI) and see which of your claims survive.
            </p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Panel title="Strongest claims" subtitle="Held up best when challenged">
            {data.notable?.strongest?.length
              ? data.notable.strongest.map(c => <ClaimRow key={c._id} claim={c} tone="strong" />)
              : <p className="text-xs text-gray-600">Nothing challenged yet.</p>}
          </Panel>

          <Panel title="Weakest claims" subtitle="Broke down under challenge">
            {data.notable?.weakest?.length
              ? data.notable.weakest.map(c => <ClaimRow key={c._id} claim={c} tone="weak" />)
              : <p className="text-xs text-gray-600">Nothing challenged yet.</p>}
          </Panel>
        </div>

        {data.topics?.length > 0 && (
          <Panel title="What you argue about" subtitle="Claims by subject, with average resilience">
            <div className="space-y-2 mt-2">
              {data.topics.map(t => (
                <div key={t.topic} className="flex items-center gap-3">
                  <span className="text-sm text-gray-300 capitalize w-32 shrink-0">{t.topic}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-veil-purple rounded-full"
                      style={{ width: `${Math.min(100, t.avgResilience ?? 0)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-24 text-right">
                    {t.claims} claim{t.claims === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
};

export default ReputationPage;
