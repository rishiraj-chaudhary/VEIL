import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import usePersonaStore from '../store/personaStore';

const PersonaDriftDashboard = () => {
  const navigate = useNavigate();
  const {
    latestSnapshot,
    timeline,
    significantDrifts,
    evolutionStats,
    snapshots,
    loading,
    error,
    fetchLatestSnapshot,
    fetchTimeline,
    fetchSignificantDrifts,
    fetchEvolutionStats,
    fetchSnapshots,
    createSnapshot
  } = usePersonaStore();

  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        fetchLatestSnapshot(),
        fetchTimeline(),
        fetchSignificantDrifts(),
        fetchEvolutionStats(),
        fetchSnapshots()
      ]);
    };
    loadData();
  }, []);

  const handleCreateSnapshot = async () => {
    setCreatingSnapshot(true);
    try {
      await createSnapshot(30);
      
      // Reload all data
      await Promise.all([
        fetchLatestSnapshot(),
        fetchTimeline(),
        fetchSnapshots()
      ]);
      
      alert('✅ Snapshot created successfully! Your persona has been captured.');
    } catch (error) {
      alert('❌ Failed to create snapshot. Please try again.');
    } finally {
      setCreatingSnapshot(false);
    }
  };

  // Check if user can create a new snapshot (prevent duplicates within 24 hours)
  const canCreateSnapshot = () => {
    if (!latestSnapshot) return true;
    
    const hoursSinceLastSnapshot = 
      (Date.now() - new Date(latestSnapshot.timestamp)) / (1000 * 60 * 60);
    
    return hoursSinceLastSnapshot >= 24;
  };

  const getNextSnapshotTime = () => {
    if (!latestSnapshot) return null;
    
    const nextTime = new Date(latestSnapshot.timestamp);
    nextTime.setHours(nextTime.getHours() + 24);
    
    return nextTime;
  };

  // Loading state
  if (loading && !latestSnapshot) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <div className="text-white text-xl">Loading your persona data...</div>
        </div>
      </div>
    );
  }

  // No data state - IMPROVED
  if (!latestSnapshot && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-xl p-8 max-w-2xl border border-purple-500/30">
          <div className="text-center">
            <div className="text-6xl mb-4">📸</div>
            <h2 className="text-3xl font-bold text-white mb-4">Welcome to Persona Evolution</h2>
            <p className="text-gray-300 mb-6 text-lg leading-relaxed">
              Track how your communication style evolves over time. We analyze your debates, 
              posts, and comments to create snapshots of your personality traits.
            </p>

            {/* What You'll Get */}
            <div className="bg-slate-700/50 rounded-lg p-6 mb-6 text-left">
              <h3 className="text-white font-semibold mb-3">📊 What you'll see:</h3>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start">
                  <span className="text-purple-400 mr-2">•</span>
                  <span><strong>Personality Traits</strong> - Empathy, formality, humor, and more</span>
                </li>
                <li className="flex items-start">
                  <span className="text-purple-400 mr-2">•</span>
                  <span><strong>Communication Tone</strong> - Analytical, sarcastic, supportive, etc.</span>
                </li>
                <li className="flex items-start">
                  <span className="text-purple-400 mr-2">•</span>
                  <span><strong>Evolution Timeline</strong> - See how you've changed over time</span>
                </li>
                <li className="flex items-start">
                  <span className="text-purple-400 mr-2">•</span>
                  <span><strong>Discussion Topics</strong> - What you talk about most</span>
                </li>
              </ul>
            </div>

            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
              <p className="text-blue-300 text-sm">
                💡 <strong>How it works:</strong> We analyze your last 30 days of activity 
                to create a snapshot. Create snapshots regularly to track your evolution!
              </p>
            </div>

            <button
              onClick={handleCreateSnapshot}
              disabled={creatingSnapshot}
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-lg font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
            >
              {creatingSnapshot ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Your First Snapshot...
                </span>
              ) : (
                '📸 Create Your First Snapshot'
              )}
            </button>

            <p className="text-gray-500 text-sm mt-4">
              This will analyze your last 30 days of activity
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Prepare trait radar data
  const radarData = latestSnapshot?.traits ? [
    { trait: 'Empathy', value: latestSnapshot.traits.empathy },
    { trait: 'Formality', value: latestSnapshot.traits.formality },
    { trait: 'Humor', value: latestSnapshot.traits.humor },
    { trait: 'Complexity', value: latestSnapshot.traits.vocabularyComplexity },
    { trait: 'Aggressiveness', value: latestSnapshot.traits.aggressiveness }
  ] : [];

  // Prepare drift timeline data
  const driftTimelineData = timeline.map(item => ({
    date: new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    drift: item.driftScore,
    tone: item.tone
  }));

  return (
    
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              📸 Persona Evolution
            </h1>
            <p className="text-gray-400">
              Track how your communication style evolves over time
            </p>
            
            {/* Snapshot Count */}
            <div className="mt-2 text-sm text-gray-500">
              {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} captured
            </div>
          </div>

          <div className="text-right">
            {/* Create Snapshot Button */}
            {canCreateSnapshot() ? (
              <button
                onClick={handleCreateSnapshot}
                disabled={creatingSnapshot}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {creatingSnapshot ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </>
                ) : (
                  <>
                    <span>+ New Snapshot</span>
                  </>
                )}
              </button>
            ) : (
              <div className="text-right">
                <div className="bg-slate-700/50 px-4 py-2 rounded-lg border border-gray-600">
                  <div className="text-gray-400 text-sm">Next snapshot available:</div>
                  <div className="text-white font-semibold">
                    {getNextSnapshotTime()?.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  (One snapshot per 24 hours)
                </p>
              </div>
            )}

            {/* Help Button */}
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="mt-2 text-gray-400 hover:text-white text-sm underline"
            >
              What is this?
            </button>
          </div>
        </div>

        {/* Explanation Modal */}
        {showExplanation && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-white">How Persona Evolution Works</h3>
              <button
                onClick={() => setShowExplanation(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-gray-300">
              <p>
                <strong className="text-white">📸 Snapshots:</strong> We analyze your last 30 days 
                of debates, posts, and comments to create a snapshot of your personality traits.
              </p>
              <p>
                <strong className="text-white">📊 Drift Score:</strong> Shows how much your persona 
                has changed since your last snapshot (0 = no change, 100 = major change).
              </p>
              <p>
                <strong className="text-white">⏱️ Frequency:</strong> You can create one snapshot per 24 hours. 
                Snapshots are also created automatically after every 10 debates.
              </p>
              <p>
                <strong className="text-white">🔒 Privacy:</strong> Your snapshots are private and 
                only visible to you.
              </p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 flex justify-between items-center">
            <span>{error}</span>
            <button
              onClick={() => usePersonaStore.getState().clearError()}
              className="text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-gray-700">
          <button
            onClick={() => setSelectedTab('overview')}
            className={`px-4 py-2 font-semibold transition-colors ${
              selectedTab === 'overview'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setSelectedTab('timeline')}
            className={`px-4 py-2 font-semibold transition-colors ${
              selectedTab === 'timeline'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
            disabled={timeline.length < 2}
          >
            Timeline {timeline.length < 2 && <span className="text-xs">(Need 2+ snapshots)</span>}
          </button>
          <button
            onClick={() => setSelectedTab('evolution')}
            className={`px-4 py-2 font-semibold transition-colors ${
              selectedTab === 'evolution'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
            disabled={!evolutionStats || evolutionStats.totalSnapshots < 2}
          >
            Evolution {(!evolutionStats || evolutionStats.totalSnapshots < 2) && <span className="text-xs">(Need 2+ snapshots)</span>}
          </button>
        </div>

        {/* Tab Content - SAME AS BEFORE (keeping your existing tab content) */}
        {selectedTab === 'overview' && (
          <div className="space-y-6">
            
            {/* Latest Snapshot Summary */}
            <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Latest Snapshot</h2>
                  <p className="text-gray-400">
                    {new Date(latestSnapshot.timestamp).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Drift Score</div>
                  <div className={`text-3xl font-bold ${
                    (latestSnapshot.driftAnalysis?.overallDriftScore || 0) > 50
                      ? 'text-orange-400'
                      : (latestSnapshot.driftAnalysis?.overallDriftScore || 0) > 0
                      ? 'text-yellow-400'
                      : 'text-green-400'
                  }`}>
                    {latestSnapshot.driftAnalysis?.overallDriftScore || 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {latestSnapshot.driftAnalysis?.overallDriftScore === 0 
                      ? 'First snapshot' 
                      : latestSnapshot.driftAnalysis?.overallDriftScore > 50
                      ? 'Major change'
                      : 'Minor change'}
                  </div>
                </div>
              </div>

              <p className="text-gray-300 mb-6">{latestSnapshot.summary}</p>

              {/* Trait Badges */}
              <div className="flex flex-wrap gap-3">
                <div className="bg-purple-900/50 px-4 py-2 rounded-full border border-purple-500/30">
                  <span className="text-gray-400">Tone:</span>{' '}
                  <span className="text-white font-semibold capitalize">
                    {latestSnapshot.traits?.tone}
                  </span>
                </div>
                <div className="bg-purple-900/50 px-4 py-2 rounded-full border border-purple-500/30">
                  <span className="text-gray-400">Style:</span>{' '}
                  <span className="text-white font-semibold capitalize">
                    {latestSnapshot.traits?.argumentativeStyle}
                  </span>
                </div>
              </div>
            </div>

            {/* Trait Radar Chart */}
            <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
              <h3 className="text-xl font-bold text-white mb-4">Personality Traits</h3>
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#4b5563" />
                  <PolarAngleAxis dataKey="trait" stroke="#9ca3af" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#9ca3af" />
                  <Radar
                    name="Current Traits"
                    dataKey="value"
                    stroke="#a855f7"
                    fill="#a855f7"
                    fillOpacity={0.6}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #a855f7',
                      borderRadius: '8px'
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Key Changes */}
            {latestSnapshot.keyChanges?.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                <h3 className="text-xl font-bold text-white mb-4">Recent Changes</h3>
                <div className="space-y-3">
                  {latestSnapshot.keyChanges.map((change, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        change.impact === 'high'
                          ? 'bg-orange-900/20 border-orange-500/30'
                          : change.impact === 'medium'
                          ? 'bg-yellow-900/20 border-yellow-500/30'
                          : 'bg-blue-900/20 border-blue-500/30'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-white capitalize">
                            {change.type.replace(/([A-Z])/g, ' $1').trim()}
                          </div>
                          <div className="text-gray-400 text-sm mt-1">{change.description}</div>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            change.impact === 'high'
                              ? 'bg-orange-500 text-white'
                              : change.impact === 'medium'
                              ? 'bg-yellow-500 text-black'
                              : 'bg-blue-500 text-white'
                          }`}
                        >
                          {change.impact}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Topics */}
            {latestSnapshot.topics?.primary?.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                <h3 className="text-xl font-bold text-white mb-4">Topics You Discuss</h3>
                <div className="flex flex-wrap gap-2">
                  {latestSnapshot.topics.primary.map((topic, idx) => (
                    <span
                      key={idx}
                      className="bg-purple-600/30 text-purple-300 px-4 py-2 rounded-full border border-purple-500/50"
                    >
                      {topic}
                    </span>
                  ))}
                </div>

                {latestSnapshot.topics.emerging?.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm text-gray-400 mb-2">🌱 Emerging Topics</div>
                    <div className="flex flex-wrap gap-2">
                      {latestSnapshot.topics.emerging.map((topic, idx) => (
                        <span
                          key={idx}
                          className="bg-green-600/30 text-green-300 px-3 py-1 rounded-full text-sm border border-green-500/50"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Timeline Tab - Show message if not enough data */}
        {selectedTab === 'timeline' && (
          <div className="space-y-6">
            {timeline.length < 2 ? (
              <div className="bg-slate-800 rounded-xl p-12 border border-purple-500/30 text-center">
                <div className="text-6xl mb-4">📈</div>
                <h3 className="text-2xl font-bold text-white mb-3">Not Enough Data Yet</h3>
                <p className="text-gray-400 mb-6">
                  Create at least 2 snapshots to see your evolution timeline
                </p>
                <p className="text-sm text-gray-500">
                  Current snapshots: {timeline.length}
                </p>
              </div>
            ) : (
              <>
                {/* Drift Timeline Chart */}
                {driftTimelineData.length > 0 && (
                  <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                    <h3 className="text-xl font-bold text-white mb-4">Drift Over Time</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={driftTimelineData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" />
                        <XAxis dataKey="date" stroke="#9ca3af" />
                        <YAxis stroke="#9ca3af" domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1e293b',
                            border: '1px solid #a855f7',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="drift"
                          stroke="#a855f7"
                          strokeWidth={2}
                          dot={{ fill: '#a855f7', r: 4 }}
                          name="Drift Score"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Significant Drift Events */}
                {significantDrifts.length > 0 && (
                  <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                    <h3 className="text-xl font-bold text-white mb-4">Significant Changes</h3>
                    <div className="space-y-4">
                      {significantDrifts.map((drift, idx) => (
                        <div
                          key={drift.id}
                          className="bg-slate-700/50 p-4 rounded-lg border border-gray-600"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-sm text-gray-400">
                              {new Date(drift.timestamp).toLocaleDateString()}
                            </div>
                            <div className="text-orange-400 font-bold">
                              Drift: {drift.driftScore}
                            </div>
                          </div>
                          <p className="text-gray-300">{drift.summary}</p>
                          {drift.significantChanges?.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {drift.significantChanges.map((change, cidx) => (
                                <div key={cidx} className="text-sm text-gray-400 pl-4 border-l-2 border-purple-500/50">
                                  • {change.description}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Evolution Tab */}
        {selectedTab === 'evolution' && evolutionStats && evolutionStats.totalSnapshots >= 2 && (
          <div className="space-y-6">
            
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                <div className="text-gray-400 text-sm mb-1">Total Snapshots</div>
                <div className="text-3xl font-bold text-white">
                  {evolutionStats.totalSnapshots}
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                <div className="text-gray-400 text-sm mb-1">Duration</div>
                <div className="text-3xl font-bold text-white">
                  {evolutionStats.durationDays} days
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                <div className="text-gray-400 text-sm mb-1">First Snapshot</div>
                <div className="text-lg font-bold text-white">
                  {new Date(evolutionStats.firstSnapshot).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Trait Evolution */}
            {evolutionStats.traitEvolution && (
              <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                <h3 className="text-xl font-bold text-white mb-4">Trait Evolution</h3>
                <div className="space-y-4">
                  {Object.entries(evolutionStats.traitEvolution).map(([trait, data]) => (
                    <div key={trait} className="bg-slate-700/50 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <div className="font-semibold text-white capitalize">
                          {trait.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className={`font-bold ${
                          data.change > 0 ? 'text-green-400' : data.change < 0 ? 'text-red-400' : 'text-gray-400'
                        }`}>
                          {data.change > 0 ? '+' : ''}{data.change}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 text-sm">
                        <div className="text-gray-400">
                          Start: <span className="text-white font-semibold">{data.start}</span>
                        </div>
                        <div className="text-gray-400">→</div>
                        <div className="text-gray-400">
                          Current: <span className="text-white font-semibold">{data.current}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedTab === 'evolution' && (!evolutionStats || evolutionStats.totalSnapshots < 2) && (
          <div className="bg-slate-800 rounded-xl p-12 border border-purple-500/30 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-2xl font-bold text-white mb-3">Evolution Coming Soon</h3>
            <p className="text-gray-400 mb-6">
              Create at least 2 snapshots to see your trait evolution stats
            </p>
            <p className="text-sm text-gray-500">
              Current snapshots: {evolutionStats?.totalSnapshots || snapshots.length || 0}
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default PersonaDriftDashboard;