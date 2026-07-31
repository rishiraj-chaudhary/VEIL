/**
 * SHARED UI PRIMITIVES
 *
 * Extracted because the same spinner was hand-written in 25 files and one card
 * shell was copy-pasted 11 times, so restyling meant a 25-file sweep.
 *
 * ── Affordance without hue ──────────────────────────────────────────────────
 * The palette is monochrome: colour is reserved entirely for the resilience
 * tiers, so it always signals status and never decoration. That removes the
 * usual cue for "this is interactive", and two devices replace it:
 *
 *   · primary actions INVERT — a light fill with dark text, which nothing else
 *     in the interface does, so it reads as the action at a glance
 *   · links UNDERLINE — they sit inside body text at the same weight and
 *     colour, so the underline is the only thing distinguishing them
 *
 * Underlining links is not decoration here. Without it, a monochrome link is
 * invisible, which is the one real cost of dropping the accent hue.
 */

const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ── Button ───────────────────────────────────────────────────────────────── */

const BUTTON_VARIANTS = {
  // The only inverted surface in the app. One per view.
  primary:   'bg-veil-purple hover:bg-veil-indigo text-veil-on-accent',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600',
  ghost:     'bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-100',
  danger:    'bg-transparent hover:bg-red-500/10 text-red-400 border border-red-500/40',
};

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export const Button = ({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}) => (
  <button
    type={type}
    className={cx(
      'font-semibold rounded-lg transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
      'disabled:opacity-40 disabled:cursor-not-allowed',
      BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.secondary,
      BUTTON_SIZES[size] ?? BUTTON_SIZES.md,
      className,
    )}
    {...rest}
  >
    {children}
  </button>
);

/* ── Link ─────────────────────────────────────────────────────────────────── */

/**
 * Always underlined. With no accent hue, a link that only changes colour is
 * indistinguishable from the text around it.
 */
export const TextLink = ({ className = '', children, ...rest }) => (
  <a
    className={cx(
      'text-slate-100 underline underline-offset-2 decoration-slate-500',
      'hover:decoration-slate-100 transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-100 rounded-sm',
      className,
    )}
    {...rest}
  >
    {children}
  </a>
);

/* ── Card ─────────────────────────────────────────────────────────────────── */

export const Card = ({ className = '', children, ...rest }) => (
  <div
    className={cx('bg-slate-800 border border-slate-700 rounded-xl p-5', className)}
    {...rest}
  >
    {children}
  </div>
);

/* ── Badge ────────────────────────────────────────────────────────────────── */

/**
 * The only coloured thing in the interface. Each tier keeps its hue because
 * these encode meaning — an argument's durability — rather than styling.
 */
const BADGE_TONES = {
  ironclad:  'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  solid:     'text-cyan-300    border-cyan-500/40    bg-cyan-500/10',
  contested: 'text-amber-300   border-amber-500/40   bg-amber-500/10',
  brittle:   'text-orange-300  border-orange-500/40  bg-orange-500/10',
  fragile:   'text-rose-300    border-rose-500/40    bg-rose-500/10',
  untested:  'text-slate-300   border-slate-600      bg-slate-600/20',
  neutral:   'text-slate-300   border-slate-600      bg-slate-600/20',
};

export const Badge = ({ tone = 'neutral', className = '', children, ...rest }) => (
  <span
    className={cx(
      'inline-block text-xs font-semibold px-2 py-0.5 rounded border',
      BADGE_TONES[tone] ?? BADGE_TONES.neutral,
      className,
    )}
    {...rest}
  >
    {children}
  </span>
);

/* ── Spinner ──────────────────────────────────────────────────────────────── */

const SPINNER_SIZES = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };

/**
 * `label` is announced to screen readers and shown beside the spinner. A bare
 * spinner is the wrong control for this deployment: the backend sleeps after 15
 * minutes idle, so a cold start can run close to a minute, and an unexplained
 * spinner that long reads as a broken page.
 */
export const Spinner = ({ size = 'md', label, className = '' }) => (
  <div className={cx('flex items-center gap-3', className)} role="status" aria-live="polite">
    <div
      className={cx(
        'animate-spin rounded-full border-2 border-slate-700 border-t-slate-100 shrink-0',
        SPINNER_SIZES[size] ?? SPINNER_SIZES.md,
      )}
    />
    {label
      ? <span className="text-sm text-slate-400">{label}</span>
      : <span className="sr-only">Loading</span>}
  </div>
);

/** Centred full-panel loading state. */
export const LoadingState = ({ label = 'Loading…', className = '' }) => (
  <div className={cx('flex justify-center py-16', className)}>
    <Spinner size="lg" label={label} />
  </div>
);

/* ── EmptyState ───────────────────────────────────────────────────────────── */

/**
 * Also used for errors via `tone="error"`. Every empty state names the next
 * action, so nothing is a dead end.
 */
export const EmptyState = ({
  title,
  body,
  action,
  tone = 'empty',
  className = '',
}) => (
  <div className={cx('text-center py-12 px-4', className)}>
    <p className={cx(
      'text-base font-semibold mb-1',
      tone === 'error' ? 'text-rose-300' : 'text-slate-100',
    )}>
      {title}
    </p>
    {body && <p className="text-sm text-slate-400 max-w-sm mx-auto mb-5">{body}</p>}
    {action}
  </div>
);

/**
 * Standard failure panel. The default copy explains the cold start rather than
 * blaming the user, because that is the most common cause here.
 */
export const ErrorState = ({ title = "Couldn't load this", body, onRetry }) => (
  <EmptyState
    tone="error"
    title={title}
    body={body ?? 'The server may still be waking up. This usually clears within a minute.'}
    action={onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
  />
);

const ui = { Button, TextLink, Card, Badge, Spinner, LoadingState, EmptyState, ErrorState };

export default ui;
