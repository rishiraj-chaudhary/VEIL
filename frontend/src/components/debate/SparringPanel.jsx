/**
 * SPARRING PANEL — inline in the turn composer
 *
 * Sits under the textarea while you write a turn. You ask it to spar, it looks up
 * how each claim in your draft has held up in past debates here, attacks the weak
 * ones, and offers a revision you can drop straight into the draft and keep editing.
 *
 * Deliberately not a separate page: the point is to catch a fragile claim before
 * it is submitted, which only works where the argument is actually being written.
 */

import { useState } from 'react';
import api from '../../services/api';

const MIN_DRAFT = 40;

const BAND_STYLES = {
  ironclad:  'text-emerald-300 border-emerald-500/40 bg-emerald-900/20',
  solid:     'text-cyan-300 border-cyan-500/40 bg-cyan-900/20',
  contested: 'text-amber-300 border-amber-500/40 bg-amber-900/20',
  brittle:   'text-orange-300 border-orange-500/40 bg-orange-900/20',
  fragile:   'text-rose-300 border-rose-500/40 bg-rose-900/20',
  untested:  'text-gray-300 border-gray-600 bg-gray-800/60',
};

/**
 * Locate a claim in the *current* draft rather than trusting offsets from the
 * response. Applying one revision shifts every later offset, and the user is
 * free to keep typing between sparring and applying, so stored positions go
 * stale immediately.
 */
export const locateClaim = (draft, claim) => {
  const exact = draft.indexOf(claim);
  if (exact >= 0) return { start: exact, end: exact + claim.length };

  const words = claim.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const match = new RegExp(escaped.join('\\s+'), 'i').exec(draft);

  return match ? { start: match.index, end: match.index + match[0].length } : null;
};

const Badge = ({ band }) => (
  <span className={`text-xs px-2 py-0.5 rounded border ${BAND_STYLES[band] ?? BAND_STYLES.untested}`}>
    {band}
  </span>
);

const Finding = ({ finding, draft, onApply, applied }) => {
  const [copied, setCopied] = useState(false);
  const canApply = Boolean(finding.repair) && locateClaim(draft, finding.claim) !== null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(finding.repair.revised);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900/40">
      <div className="px-4 py-3 border-b border-gray-700/60">
        <p className="text-sm text-white">{finding.claim}</p>

        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 flex-wrap">
          {finding.trackRecord?.found ? (
            <>
              <Badge band={finding.trackRecord.band} />
              <span>
                used {finding.trackRecord.uses}×, challenged {finding.trackRecord.refutations}×,
                resilience {finding.trackRecord.resilience}/100
              </span>
            </>
          ) : (
            <>
              <Badge band="untested" />
              <span>no track record yet</span>
            </>
          )}
          <span className={finding.survived ? 'text-emerald-400' : 'text-rose-400'}>
            · attack {finding.strength}/10 · {finding.survived ? 'holds' : 'needs revision'}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-rose-400 mb-1">
            {finding.vector || 'Attack'}
          </div>
          <p className="text-sm text-gray-300">{finding.attack}</p>
        </div>

        {finding.repair && (
          <div className="border-l-2 border-emerald-500/40 pl-3">
            <div className="text-xs uppercase tracking-wide text-emerald-400 mb-1">
              Suggested revision
            </div>
            <p className="text-sm text-gray-200">{finding.repair.revised}</p>
            <p className="text-xs text-gray-500 mt-1">{finding.repair.change}</p>

            <div className="flex items-center gap-3 mt-2">
              {applied ? (
                <span className="text-xs text-emerald-400">✓ applied to your draft — edit it freely</span>
              ) : canApply ? (
                <button
                  type="button"
                  onClick={() => onApply(finding)}
                  className="text-xs px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  Apply to draft
                </button>
              ) : (
                <span className="text-xs text-gray-500">
                  This claim no longer matches your draft — copy the revision instead.
                </span>
              )}

              <button
                type="button"
                onClick={copy}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SparringPanel = ({ topic, side, draft, onApplyRevision }) => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(() => new Set());
  const [open, setOpen] = useState(false);

  const tooShort = draft.trim().length < MIN_DRAFT;

  const run = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setApplied(new Set());

    try {
      const { data } = await api.post('/sparring', {
        topic,
        side,
        draft: draft.trim().slice(0, 2000),
      });
      setResult(data.data);
      setOpen(true);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not run a sparring session right now.');
    } finally {
      setLoading(false);
    }
  };

  const apply = (finding) => {
    const at = locateClaim(draft, finding.claim);
    if (!at) return;

    onApplyRevision(draft.slice(0, at.start) + finding.repair.revised + draft.slice(at.end));
    setApplied(prev => new Set(prev).add(finding.claim));
  };

  return (
    <div className="mt-4 border-t border-gray-700 pt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <button
            type="button"
            onClick={run}
            disabled={loading || tooShort}
            className="text-sm px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {loading ? 'Sparring…' : '🥊 Spar with this draft'}
          </button>
          <p className="text-xs text-gray-500 mt-1.5">
            {tooShort
              ? `Write at least ${MIN_DRAFT} characters to spar.`
              : 'Attacks your weakest claims using how they have actually been beaten here.'}
          </p>
        </div>

        {result && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            {open ? 'Hide results' : 'Show results'}
          </button>
        )}
      </div>

      {loading && (
        <p className="text-xs text-gray-500 mt-3">
          Looking up your track record, then attacking the weakest claims…
        </p>
      )}

      {error && (
        <div className="mt-3 border border-rose-500/40 bg-rose-900/20 text-rose-200 rounded-lg px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {result && open && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
            <span><strong className="text-white">{result.summary.claimsTested}</strong> tested</span>
            <span><strong className="text-rose-300">{result.summary.claimsNeedingWork}</strong> need revision</span>
            <span className="text-gray-600">
              {result.summary.llmCalls}/{result.summary.budget} model calls
            </span>
            {result.summary.budgetExhausted && (
              <span className="text-amber-400">budget reached — some claims untested</span>
            )}
          </div>

          {result.fallacies?.length > 0 && (
            <div className="border border-amber-500/30 bg-amber-900/10 rounded-lg px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-amber-400 mb-1">
                Structural problems
              </div>
              <ul className="space-y-0.5">
                {result.fallacies.map((f, i) => (
                  <li key={i} className="text-xs text-gray-300">
                    <span className="text-amber-300">{f.type}</span>
                    {f.quote && <span className="text-gray-500"> — “{f.quote}”</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.findings.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              Nothing here needed testing — every claim already has a strong track record.
            </p>
          ) : (
            result.findings.map((f, i) => (
              <Finding
                key={i}
                finding={f}
                draft={draft}
                applied={applied.has(f.claim)}
                onApply={apply}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SparringPanel;
