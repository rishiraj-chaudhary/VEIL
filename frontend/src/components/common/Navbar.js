/**
 * NAVBAR
 *
 * Previously had no responsive classes at all: four links, a dropdown, Create,
 * Slicks, username, karma and Logout in one flex row at every width. On a phone
 * that overflowed sideways and pushed the account controls off-screen — and
 * since it renders on every page, it was the first thing a mobile visitor saw.
 *
 * Below `md` this collapses to a brand and one menu button. Above it, the
 * previous layout is preserved.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useSlickStore from '../../store/slickStore.js';

const PRIMARY = [
  { to: '/debates',    label: 'Debate' },
  { to: '/reputation', label: 'Track Record' },
  { to: '/drill',      label: 'Daily Drill' },
  { to: '/coach',      label: 'Progress' },
];

const SECONDARY = [
  { to: '/communities',     label: 'Communities' },
  { to: '/leaderboard',     label: 'Leaderboard' },
  { to: '/huddles',         label: 'Huddles' },
  { to: '/persona',         label: 'Persona' },
  { to: '/knowledge-graph', label: 'Knowledge Graph' },
  { to: '/ai-usage',        label: 'AI Usage' },
];

const Navbar = () => {
  const { user, logout } = useAuthStore();
  const { currency }     = useSlickStore();
  const navigate         = useNavigate();
  const location         = useLocation();

  const [moreOpen, setMoreOpen]     = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const moreRef = useRef(null);

  // Route changes must close both, or the drawer covers the page just navigated to.
  useEffect(() => {
    setDrawerOpen(false);
    setMoreOpen(false);
  }, [location.pathname]);

  // Click-outside and Escape for the desktop dropdown.
  useEffect(() => {
    if (!moreOpen) return undefined;

    const onDown = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false); };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // NavLink sets aria-current from isActive, so assistive tech gets the same
  // signal the underline gives everyone else.
  const deskLink = ({ isActive }) =>
    isActive
      ? 'text-white border-b-2 border-veil-purple pb-1'
      : 'text-slate-400 hover:text-white transition-colors pb-1';

  const drawerLink = ({ isActive }) =>
    `block px-3 py-2.5 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-slate-800 text-white font-semibold'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <nav className="bg-slate-900/80 backdrop-blur-lg border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-16 gap-4">

          {/* Brand + desktop nav */}
          <div className="flex items-center gap-8 min-w-0">
            <Link to="/" className="shrink-0">
              <h1 className="text-2xl font-bold text-white tracking-tight">VEIL</h1>
            </Link>

            <div className="hidden md:flex items-center gap-6">
              {PRIMARY.map(item => (
                <NavLink key={item.to} to={item.to} className={deskLink}>{item.label}</NavLink>
              ))}

              <div className="relative" ref={moreRef}>
                <button
                  type="button"
                  onClick={() => setMoreOpen(o => !o)}
                  aria-expanded={moreOpen}
                  aria-haspopup="true"
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  More
                  <span aria-hidden="true" className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {moreOpen && (
                  <div className="absolute top-9 left-0 bg-slate-800 border border-slate-700 rounded-xl shadow-xl w-56 py-2 z-50">
                    {SECONDARY.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className="block px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Desktop account controls */}
          <div className="hidden md:flex items-center gap-4 shrink-0">
            <Link
              to="/create-post"
              className="bg-veil-purple hover:bg-veil-indigo px-4 py-2 rounded-lg text-veil-on-accent font-semibold text-sm transition-colors"
            >
              + Create
            </Link>

            <Link
              to="/slicks"
              className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-full hover:bg-slate-700 transition-colors text-sm text-slate-300"
            >
              Slicks
              {currency.balance > 0 && (
                <span className="bg-slate-600 text-white text-xs px-2 py-0.5 rounded-full">{currency.balance}</span>
              )}
            </Link>

            <span className="text-slate-400 text-sm whitespace-nowrap">
              {user?.username} · <span className="text-white font-medium">{user?.karma || 0}</span>
            </span>

            <button
              type="button"
              onClick={handleLogout}
              className="border border-red-500/50 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors text-sm"
            >
              Logout
            </button>
          </div>

          {/* Mobile trigger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(o => !o)}
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav"
            aria-label={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {drawerOpen
                ? <path d="M18 6 6 18M6 6l12 12" />
                : <path d="M3 12h18M3 6h18M3 18h18" />}
            </svg>
          </button>
        </div>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div id="mobile-nav" className="md:hidden pb-4 border-t border-slate-800 pt-3">
            <div className="flex flex-col gap-0.5">
              {PRIMARY.map(item => (
                <NavLink key={item.to} to={item.to} className={drawerLink}>{item.label}</NavLink>
              ))}
            </div>

            <div className="h-px bg-slate-800 my-3" />

            <div className="flex flex-col gap-0.5">
              {SECONDARY.map(item => (
                <NavLink key={item.to} to={item.to} className={drawerLink}>{item.label}</NavLink>
              ))}
              <NavLink to="/slicks" className={drawerLink}>
                Slicks{currency.balance > 0 ? ` · ${currency.balance}` : ''}
              </NavLink>
            </div>

            <div className="h-px bg-slate-800 my-3" />

            <Link
              to="/create-post"
              className="block text-center bg-veil-purple hover:bg-veil-indigo text-veil-on-accent font-semibold px-4 py-2.5 rounded-lg transition-colors mb-3"
            >
              + Create
            </Link>

            <div className="flex items-center justify-between px-3">
              <span className="text-sm text-slate-400">
                {user?.username} · <span className="text-white font-medium">{user?.karma || 0} karma</span>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-red-400 hover:text-red-300 text-sm transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
