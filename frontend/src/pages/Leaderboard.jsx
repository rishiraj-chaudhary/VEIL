import React, { useEffect, useState } from 'react';
import Navbar from '../components/common/Navbar';

const Leaderboard = () => {
  const [activeTab, setActiveTab] = useState('overall');
  const [leaderboards, setLeaderboards] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboards();
  }, []);

  const fetchLeaderboards = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5001/api/coach/leaderboard/all');
      const data = await response.json();
      
      if (data.success) {
        setLeaderboards(data.data);
      }
    } catch (error) {
      console.error('Error fetching leaderboards:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankColor = (rank) => {
    const colors = {
      1: 'text-yellow-400',
      2: 'text-gray-300',
      3: 'text-orange-400'
    };
    return colors[rank] || 'text-gray-400';
  };

  const getRankIcon = (rank) => {
    const icons = {
      1: '🥇',
      2: '🥈',
      3: '🥉'
    };
    return icons[rank] || `#${rank}`;
  };

  const getTierBadge = (tier) => {
    const badges = {
      novice: { color: 'bg-gray-600', icon: '🌱' },
      apprentice: { color: 'bg-blue-600', icon: '📚' },
      expert: { color: 'bg-purple-600', icon: '⭐' },
      master: { color: 'bg-red-600', icon: '👑' },
      legend: { color: 'bg-yellow-500', icon: '🏆' }
    };
    
    const badge = badges[tier] || badges.novice;
    
    return (
      <span className={`${badge.color} px-2 py-1 rounded text-xs font-semibold`}>
        {badge.icon} {tier?.toUpperCase()}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading leaderboards...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />
    <div className="min-h-screen bg-slate-900 text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h1 className="text-4xl font-bold mb-2">🏆 Leaderboards</h1>
        <p className="text-gray-400">Compete with the best debaters</p>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex gap-4 border-b border-slate-700">
          {['overall', 'improvers', 'categories'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-semibold ${
                activeTab === tab
                  ? 'border-b-2 border-purple-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'overall' && (
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4">🥇 Top Debaters</h2>
            <div className="space-y-3">
              {leaderboards?.overall.map((user) => (
                <div
                  key={user.username}
                  className="bg-slate-700 rounded-lg p-4 flex items-center justify-between hover:bg-slate-600 transition"
                >
                  <div className="flex items-center gap-4">
                    <span className={`text-2xl font-bold ${getRankColor(user.rank)}`}>
                      {getRankIcon(user.rank)}
                    </span>
                    <div>
                      <p className="font-semibold text-lg">{user.username}</p>
                      <div className="flex gap-2 items-center">
                        {getTierBadge(user.tier)}
                        <span className="text-sm text-gray-400">
                          {user.totalDebates} debates
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-400">{user.winRate}%</p>
                    <p className="text-sm text-gray-400">Win Rate</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'improvers' && (
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4">📈 Top Improvers</h2>
            <div className="space-y-3">
              {leaderboards?.improvers.map((user) => (
                <div
                  key={user.username}
                  className="bg-slate-700 rounded-lg p-4 flex items-center justify-between hover:bg-slate-600 transition"
                >
                  <div className="flex items-center gap-4">
                    <span className={`text-2xl font-bold ${getRankColor(user.rank)}`}>
                      {getRankIcon(user.rank)}
                    </span>
                    <div>
                      <p className="font-semibold text-lg">{user.username}</p>
                      <span className="text-sm px-2 py-1 bg-purple-600 rounded">
                        {user.velocity} growth
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-400">+{user.growth}</p>
                    <p className="text-sm text-gray-400">Growth Score</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tone Leaders */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4">🤝 Tone Masters</h3>
              <div className="space-y-2">
                {leaderboards?.categoryLeaders.tone.map((user) => (
                  <div key={user.username} className="flex justify-between items-center bg-slate-700 p-3 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getRankIcon(user.rank)}</span>
                      <span>{user.username}</span>
                    </div>
                    <span className="font-bold text-green-400">{user.score}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Clarity Leaders */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4">💬 Clarity Champions</h3>
              <div className="space-y-2">
                {leaderboards?.categoryLeaders.clarity.map((user) => (
                  <div key={user.username} className="flex justify-between items-center bg-slate-700 p-3 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getRankIcon(user.rank)}</span>
                      <span>{user.username}</span>
                    </div>
                    <span className="font-bold text-blue-400">{user.score}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Evidence Leaders */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4">📊 Evidence Experts</h3>
              <div className="space-y-2">
                {leaderboards?.categoryLeaders.evidence.map((user) => (
                  <div key={user.username} className="flex justify-between items-center bg-slate-700 p-3 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getRankIcon(user.rank)}</span>
                      <span>{user.username}</span>
                    </div>
                    <span className="font-bold text-purple-400">{user.score}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Logic Leaders */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4">🧠 Logic Legends</h3>
              <div className="space-y-2">
                {leaderboards?.categoryLeaders.logic.map((user) => (
                  <div key={user.username} className="flex justify-between items-center bg-slate-700 p-3 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getRankIcon(user.rank)}</span>
                      <span>{user.username}</span>
                    </div>
                    <span className="font-bold text-yellow-400">{user.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
};

export default Leaderboard;