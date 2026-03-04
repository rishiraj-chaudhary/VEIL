import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useSlickStore from '../../store/slickStore.js';

const Navbar = () => {
  const { user, logout } = useAuthStore();
  const { currency } = useSlickStore();
  const navigate = useNavigate();
  const [aiOpen, setAiOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    isActive
      ? "text-white border-b-2 border-veil-purple pb-1"
      : "text-gray-400 hover:text-white transition";

  return (
    <nav className="bg-slate-900/80 backdrop-blur-lg border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center h-16">

          {/* LEFT SECTION */}
          <div className="flex items-center space-x-8">

            {/* Logo */}
            <Link to="/" className="flex items-center">
              <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-veil-purple to-veil-accent">
                VEIL
              </h1>
            </Link>

            {/* Core Navigation */}
            <div className="flex items-center space-x-6">
              <NavLink to="/feed" className={navLinkClass}>Feed</NavLink>
              <NavLink to="/communities" className={navLinkClass}>Communities</NavLink>
              <NavLink to="/debates" className={navLinkClass}>⚖️ Debates</NavLink>
              <NavLink to="/leaderboard" className={navLinkClass}>🏆 Leaderboard</NavLink>
            </div>

            {/* AI Dropdown */}
            <div className="relative">
              <button
                onClick={() => setAiOpen(!aiOpen)}
                className="text-gray-400 hover:text-white transition flex items-center gap-1"
              >
                🤖 AI
                <span className={`transform transition ${aiOpen ? "rotate-180" : ""}`}>▾</span>
              </button>

              {aiOpen && (
                <div className="absolute top-10 left-0 bg-slate-800 border border-slate-700 rounded-xl shadow-xl w-48 py-2">
                  <NavLink to="/coach" className="block px-4 py-2 text-gray-300 hover:bg-slate-700 hover:text-white">
                    🎓 AI Coach
                  </NavLink>
                  <NavLink to="/persona" className="block px-4 py-2 text-gray-300 hover:bg-slate-700 hover:text-white">
                    📸 Persona
                  </NavLink>
                  <NavLink to="/knowledge-graph" className="block px-4 py-2 text-gray-300 hover:bg-slate-700 hover:text-white">
                    📊 Knowledge Graph
                  </NavLink>
                  <NavLink to="/ai-usage" className="block px-4 py-2 text-gray-300 hover:bg-slate-700 hover:text-white">
                    💰 Usage
                  </NavLink>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SECTION */}
          <div className="flex items-center space-x-5">

            {/* Create Button */}
            <Link
              to="/create-post"
              className="bg-veil-purple hover:bg-purple-600 px-4 py-2 rounded-lg text-white font-medium transition"
            >
              + Create
            </Link>

            {/* Slicks Pill */}
            <Link
              to="/slicks"
              className="flex items-center gap-2 bg-slate-800/70 backdrop-blur px-4 py-2 rounded-full hover:bg-slate-700 transition"
            >
              🎭 Slicks
              {currency.balance > 0 && (
                <span className="bg-veil-purple text-xs px-2 py-1 rounded-full">
                  {currency.balance}
                </span>
              )}
            </Link>

            {/* User Info */}
            <div className="flex items-center space-x-3">
              <span className="text-gray-400 text-sm">
                {user?.username}
              </span>
              <span className="text-veil-purple font-semibold text-sm">
                {user?.karma || 0} karma
              </span>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="border border-red-500 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg transition text-sm"
            >
              Logout
            </button>

          </div>

        </div>
      </div>
    </nav>
  );
};

export default Navbar;