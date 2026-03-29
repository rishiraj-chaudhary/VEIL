import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useAuthStore from '../store/authStore';
import usePersonaStore from '../store/personaStore';

const fetchPerception = async (userId) => {
  try {
    const token = localStorage.getItem('veil_token');
    const res = await fetch(`/api/slicks/perception/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
};

const GapBar = ({ label, selfVal, perceivedVal }) => {
  const isHigher = perceivedVal > selfVal;
  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-500 text-xs">You: <span className="text-purple-300">{selfVal}</span>{' · '}Others: <span className={isHigher ? 'text-orange-300' : 'text-green-300'}>{perceivedVal}</span></span>
      </div>
      <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
        <div className="absolute h-full bg-purple-500/60 rounded-full" style={{ width: `${selfVal}%` }} />
        <div className="absolute h-full border-2 border-orange-400 rounded-full" style={{ width: `${perceivedVal}%` }} />
      </div>
      <div className="flex justify-between text-xs mt-1 text-gray-600"><span>0</span><span>100</span></div>
    </div>
  );
};

const InsightCard = ({ insight, index }) => (
  <div className="bg-slate-700/50 border border-purple-500/20 rounded-lg p-4 text-sm text-gray-300 leading-relaxed" style={{ animationDelay: `${index * 100}ms` }}>{insight}</div>
);

const TrendBadge = ({ trend }) => {
  const config = {
    improving: { color: 'text-green-400 bg-green-900/30 border-green-500/30', icon: '↑', label: 'Improving' },
    stable:    { color: 'text-blue-400 bg-blue-900/30 border-blue-500/30',   icon: '→', label: 'Stable' },
    declining: { color: 'text-red-400 bg-red-900/30 border-red-500/30',     icon: '↓', label: 'Declining' },
    shifting:  { color: 'text-orange-400 bg-orange-900/30 border-orange-500/30', icon: '⟳', label: 'Shifting' },
  }[trend] || { color: 'text-gray-400 bg-slate-700 border-gray-600', icon: '?', label: trend };
  return <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${config.color}`}>{config.icon} {config.label}</span>;
};

const PersonaDriftDashboard = () => {
  const { user } = useAuthStore();
  const { latestSnapshot, timeline, significantDrifts, evolutionStats, snapshots, loading, error, fetchLatestSnapshot, fetchTimeline, fetchSignificantDrifts, fetchEvolutionStats, fetchSnapshots, createSnapshot } = usePersonaStore();
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [selectedTab, setSelectedTab]           = useState('overview');
  const [showExplanation, setShowExplanation]   = useState(false);
  const [perception, setPerception]             = useState(null);
  const [perceptionLoading, setPerceptionLoading] = useState(false);

  useEffect(() => { fetchLatestSnapshot(); fetchTimeline(); fetchSignificantDrifts(); fetchEvolutionStats(); fetchSnapshots(); }, []); // eslint-disable-line
  useEffect(() => {
    if (user?._id || user?.id) {
      const userId = user._id || user.id;
      setPerceptionLoading(true);
      fetchPerception(userId).then(d => setPerception(d)).finally(() => setPerceptionLoading(false));
    }
  }, [user]);

  const handleCreateSnapshot = async () => {
    setCreatingSnapshot(true);
    try { await createSnapshot(30); await Promise.all([fetchLatestSnapshot(), fetchTimeline(), fetchSnapshots()]); alert('✅ Snapshot created!'); }
    catch { alert('❌ Failed to create snapshot.'); }
    finally { setCreatingSnapshot(false); }
  };

  const canCreateSnapshot = () => { if (!latestSnapshot) return true; return (Date.now() - new Date(latestSnapshot.timestamp)) / 3600000 >= 24; };
  const getNextSnapshotTime = () => { if (!latestSnapshot) return null; const n = new Date(latestSnapshot.timestamp); n.setHours(n.getHours() + 24); return n; };

  const radarData = latestSnapshot?.traits ? [
    { trait: 'Empathy',        self: latestSnapshot.traits.empathy,              perceived: perception?.perceptionTraits?.empathy },
    { trait: 'Formality',      self: latestSnapshot.traits.formality,            perceived: perception?.perceptionTraits?.formality },
    { trait: 'Humor',          self: latestSnapshot.traits.humor,                perceived: perception?.perceptionTraits?.humor },
    { trait: 'Complexity',     self: latestSnapshot.traits.vocabularyComplexity, perceived: perception?.perceptionTraits?.vocabularyComplexity },
    { trait: 'Aggressiveness', self: latestSnapshot.traits.aggressiveness,       perceived: perception?.perceptionTraits?.aggressiveness },
  ] : [];

  const driftTimelineData = timeline.map(item => ({ date: new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), drift: item.driftScore, tone: item.tone }));

  const significantGaps = perception?.perceptionTraits && latestSnapshot?.traits
    ? [
        { label: 'Aggressiveness', selfVal: latestSnapshot.traits.aggressiveness,       perceivedVal: perception.perceptionTraits.aggressiveness },
        { label: 'Empathy',        selfVal: latestSnapshot.traits.empathy,              perceivedVal: perception.perceptionTraits.empathy },
        { label: 'Formality',      selfVal: latestSnapshot.traits.formality,            perceivedVal: perception.perceptionTraits.formality },
        { label: 'Humor',          selfVal: latestSnapshot.traits.humor,                perceivedVal: perception.perceptionTraits.humor },
        { label: 'Complexity',     selfVal: latestSnapshot.traits.vocabularyComplexity, perceivedVal: perception.perceptionTraits.vocabularyComplexity },
      ].filter(g => Math.abs(g.selfVal - g.perceivedVal) >= 15)
    : [];

  if (loading && !latestSnapshot) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-center"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4" /><div className="text-white text-xl">Loading your persona data...</div></div>
    </div>
  );

  if (!latestSnapshot && !loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl p-8 max-w-2xl border border-purple-500/30 text-center">
        <div className="text-6xl mb-4">📸</div>
        <h2 className="text-3xl font-bold text-white mb-4">Welcome to Persona Evolution</h2>
        <p className="text-gray-300 mb-6 text-lg leading-relaxed">Track how your communication style evolves over time.</p>
        <button onClick={handleCreateSnapshot} disabled={creatingSnapshot} className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-lg font-bold text-lg disabled:opacity-50 transition-all">
          {creatingSnapshot ? 'Creating...' : '📸 Create Your First Snapshot'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">📸 Persona Evolution</h1>
            <p className="text-gray-400">Track how your communication style evolves over time</p>
            <div className="mt-2 text-sm text-gray-500">{snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} captured</div>
          </div>
          <div className="text-right">
            {canCreateSnapshot() ? (
              <button onClick={handleCreateSnapshot} disabled={creatingSnapshot} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
                {creatingSnapshot ? <><span className="animate-spin">⟳</span> Creating...</> : '+ New Snapshot'}
              </button>
            ) : (
              <div className="bg-slate-700/50 px-4 py-2 rounded-lg border border-gray-600">
                <div className="text-gray-400 text-sm">Next snapshot available:</div>
                <div className="text-white font-semibold">{getNextSnapshotTime()?.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
              </div>
            )}
            <button onClick={() => setShowExplanation(!showExplanation)} className="mt-2 text-gray-400 hover:text-white text-sm underline block">What is this?</button>
          </div>
        </div>

        {showExplanation && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-start mb-4"><h3 className="text-xl font-bold text-white">How Persona Evolution Works</h3><button onClick={() => setShowExplanation(false)} className="text-gray-400 hover:text-white">✕</button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-300">
              <div><p className="mb-2"><strong className="text-white">📸 Snapshots:</strong> We analyze your last 30 days of debates, posts, and comments to capture your personality traits.</p><p className="mb-2"><strong className="text-white">📊 Drift Score:</strong> Shows how much you've changed since your last snapshot.</p></div>
              <div><p className="mb-2"><strong className="text-white">👥 Perception:</strong> How others see you based on anonymous Slicks.</p><p className="mb-2"><strong className="text-white">💡 Self-Gap:</strong> The difference between who you think you are and how others perceive you.</p></div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 flex justify-between items-center">
            <span>{error}</span><button onClick={() => usePersonaStore.getState().clearError()} className="text-red-400 hover:text-red-300">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-gray-700">
          {[
            { id: 'overview',   label: 'Overview' },
            { id: 'perception', label: '👥 How Others See You', badge: perception?.perceptionTraits ? null : 'New' },
            { id: 'timeline',   label: 'Timeline',  disabled: timeline.length < 2 },
            { id: 'evolution',  label: 'Evolution', disabled: !evolutionStats || evolutionStats.totalSnapshots < 2 },
          ].map(tab => (
            <button key={tab.id} onClick={() => !tab.disabled && setSelectedTab(tab.id)} disabled={tab.disabled}
              className={`px-4 py-2 font-semibold transition-colors flex items-center gap-2 ${selectedTab === tab.id ? 'text-purple-400 border-b-2 border-purple-400' : tab.disabled ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}>
              {tab.label}
              {tab.badge && <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">{tab.badge}</span>}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {selectedTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Latest Snapshot</h2>
                  <p className="text-gray-400">{new Date(latestSnapshot.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400 mb-1">Drift Score</div>
                  <div className={`text-3xl font-bold ${(latestSnapshot.driftAnalysis?.overallDriftScore || 0) > 50 ? 'text-orange-400' : (latestSnapshot.driftAnalysis?.overallDriftScore || 0) > 0 ? 'text-yellow-400' : 'text-green-400'}`}>{latestSnapshot.driftAnalysis?.overallDriftScore || 0}</div>
                  <div className="text-xs text-gray-500 mt-1">{!latestSnapshot.driftAnalysis?.overallDriftScore ? 'First snapshot' : latestSnapshot.driftAnalysis?.overallDriftScore > 50 ? 'Major change' : 'Minor change'}</div>
                </div>
              </div>
              <p className="text-gray-300 mb-6">{latestSnapshot.summary}</p>
              <div className="flex flex-wrap gap-3">
                <div className="bg-purple-900/50 px-4 py-2 rounded-full border border-purple-500/30"><span className="text-gray-400">Tone:</span> <span className="text-white font-semibold capitalize">{latestSnapshot.traits?.tone}</span></div>
                <div className="bg-purple-900/50 px-4 py-2 rounded-full border border-purple-500/30"><span className="text-gray-400">Style:</span> <span className="text-white font-semibold capitalize">{latestSnapshot.traits?.argumentativeStyle}</span></div>
                {perception?.trend && <div className="bg-purple-900/50 px-4 py-2 rounded-full border border-purple-500/30 flex items-center gap-2"><span className="text-gray-400">Perception:</span><TrendBadge trend={perception.trend} /></div>}
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Personality Traits</h3>
                {perception?.perceptionTraits && (
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> You</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> Others see you as</span>
                  </div>
                )}
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#4b5563" /><PolarAngleAxis dataKey="trait" stroke="#9ca3af" /><PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#9ca3af" />
                  <Radar name="You" dataKey="self" stroke="#a855f7" fill="#a855f7" fillOpacity={0.5} />
                  {perception?.perceptionTraits && <Radar name="Others' Perception" dataKey="perceived" stroke="#fb923c" fill="#fb923c" fillOpacity={0.2} />}
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #a855f7', borderRadius: '8px' }} /><Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {significantGaps.length > 0 && (
              <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <div><h3 className="text-lg font-bold text-white">⚡ Perception Gap Detected</h3><p className="text-gray-400 text-sm mt-1">Significant difference between self and how others see you</p></div>
                  <button onClick={() => setSelectedTab('perception')} className="text-orange-400 hover:text-orange-300 text-sm underline">See full analysis →</button>
                </div>
                <div className="space-y-3">{significantGaps.slice(0, 2).map(gap => <GapBar key={gap.label} {...gap} />)}</div>
              </div>
            )}

            {/* ── FIXED: null guards on change.trait/type and change.impact ── */}
            {latestSnapshot.keyChanges?.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                <h3 className="text-xl font-bold text-white mb-4">Recent Changes</h3>
                <div className="space-y-3">
                  {latestSnapshot.keyChanges.map((change, idx) => {
                    const impact    = change.impact || 'low';
                    const traitName = (change.trait || change.type || '').replace(/([A-Z])/g, ' $1').trim();
                    return (
                      <div key={idx} className={`p-4 rounded-lg border ${impact === 'high' ? 'bg-orange-900/20 border-orange-500/30' : impact === 'medium' ? 'bg-yellow-900/20 border-yellow-500/30' : 'bg-blue-900/20 border-blue-500/30'}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-white capitalize">{traitName}</div>
                            <div className="text-gray-400 text-sm mt-1">{change.description}</div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${impact === 'high' ? 'bg-orange-500 text-white' : impact === 'medium' ? 'bg-yellow-500 text-black' : 'bg-blue-500 text-white'}`}>{impact}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {latestSnapshot.topics?.primary?.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                <h3 className="text-xl font-bold text-white mb-4">Topics You Discuss</h3>
                <div className="flex flex-wrap gap-2">
                  {latestSnapshot.topics.primary.map((topic, idx) => <span key={idx} className="bg-purple-600/30 text-purple-300 px-4 py-2 rounded-full border border-purple-500/50">{topic}</span>)}
                </div>
                {latestSnapshot.topics.emerging?.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm text-gray-400 mb-2">🌱 Emerging Topics</div>
                    <div className="flex flex-wrap gap-2">{latestSnapshot.topics.emerging.map((topic, idx) => <span key={idx} className="bg-green-600/30 text-green-300 px-3 py-1 rounded-full text-sm border border-green-500/50">{topic}</span>)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PERCEPTION */}
        {selectedTab === 'perception' && (
          <div className="space-y-6">
            {perceptionLoading && <div className="text-center py-12 text-gray-400"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto mb-4" />Loading perception data...</div>}
            {!perceptionLoading && !perception?.perceptionTraits && (
              <div className="bg-slate-800 rounded-xl p-12 border border-purple-500/30 text-center">
                <div className="text-6xl mb-4">👥</div>
                <h3 className="text-2xl font-bold text-white mb-3">No Perception Data Yet</h3>
                <p className="text-gray-400 max-w-md mx-auto">Perception is built from anonymous Slicks others send you.</p>
              </div>
            )}
            {!perceptionLoading && perception?.perceptionTraits && (
              <>
                <div className="bg-slate-800 rounded-xl p-6 border border-orange-500/30">
                  <div className="flex justify-between items-start mb-4">
                    <div><h2 className="text-2xl font-bold text-white mb-1">How Others See You</h2><p className="text-gray-400 text-sm">Based on {perception.slickCount} anonymous Slick{perception.slickCount !== 1 ? 's' : ''} received{perception.updatedAt && ` · Updated ${new Date(perception.updatedAt).toLocaleDateString()}`}</p></div>
                    <TrendBadge trend={perception.trend} />
                  </div>
                  <p className="text-gray-300 mb-5 leading-relaxed">{perception.summary}</p>
                  <div className="flex flex-wrap gap-3">
                    <div className="bg-orange-900/30 px-4 py-2 rounded-full border border-orange-500/30"><span className="text-gray-400">Perceived Tone:</span> <span className="text-orange-300 font-semibold capitalize">{perception.perceptionTraits.tone}</span></div>
                    <div className="bg-orange-900/30 px-4 py-2 rounded-full border border-orange-500/30"><span className="text-gray-400">Perceived Style:</span> <span className="text-orange-300 font-semibold capitalize">{perception.perceptionTraits.argumentativeStyle}</span></div>
                  </div>
                </div>
                {latestSnapshot?.traits && (
                  <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                    <div className="mb-6"><h3 className="text-xl font-bold text-white mb-1">Self vs Perception Gap</h3><p className="text-gray-400 text-sm"><span className="text-purple-400">Purple</span> = how you score yourself · <span className="text-orange-400">Orange</span> = how others perceive you</p></div>
                    <div className="space-y-1">
                      {[
                        { label: 'Aggressiveness', selfVal: latestSnapshot.traits.aggressiveness,       perceivedVal: perception.perceptionTraits.aggressiveness },
                        { label: 'Empathy',        selfVal: latestSnapshot.traits.empathy,              perceivedVal: perception.perceptionTraits.empathy },
                        { label: 'Formality',      selfVal: latestSnapshot.traits.formality,            perceivedVal: perception.perceptionTraits.formality },
                        { label: 'Humor',          selfVal: latestSnapshot.traits.humor,                perceivedVal: perception.perceptionTraits.humor },
                        { label: 'Complexity',     selfVal: latestSnapshot.traits.vocabularyComplexity, perceivedVal: perception.perceptionTraits.vocabularyComplexity },
                      ].map(gap => <GapBar key={gap.label} {...gap} />)}
                    </div>
                    {latestSnapshot.traits.tone !== perception.perceptionTraits.tone && (
                      <div className="mt-6 bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
                        <div className="text-yellow-400 font-semibold mb-1">Tone Mismatch</div>
                        <p className="text-gray-300 text-sm">You write in a <strong className="text-purple-300">{latestSnapshot.traits.tone}</strong> tone, but others perceive you as <strong className="text-orange-300">{perception.perceptionTraits.tone}</strong>.</p>
                      </div>
                    )}
                  </div>
                )}
                {perception.coachingInsights?.length > 0 && (
                  <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                    <h3 className="text-xl font-bold text-white mb-4">💡 Coaching Insights</h3>
                    <div className="space-y-3">{perception.coachingInsights.map((insight, idx) => <InsightCard key={idx} insight={insight} index={idx} />)}</div>
                  </div>
                )}
                {perception.toneBreakdown && (
                  <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                    <h3 className="text-xl font-bold text-white mb-4">Slick Breakdown</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(perception.toneBreakdown).map(([tone, count]) => (
                        <div key={tone} className="bg-slate-700/50 rounded-lg p-4 text-center"><div className="text-2xl font-bold text-white mb-1">{count}</div><div className="text-gray-400 text-sm capitalize">{tone}</div></div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TIMELINE */}
        {selectedTab === 'timeline' && (
          <div className="space-y-6">
            {timeline.length < 2 ? (
              <div className="bg-slate-800 rounded-xl p-12 border border-purple-500/30 text-center">
                <div className="text-6xl mb-4">📈</div><h3 className="text-2xl font-bold text-white mb-3">Not Enough Data Yet</h3>
                <p className="text-gray-400 mb-4">Create at least 2 snapshots to see your evolution timeline</p><p className="text-sm text-gray-500">Current snapshots: {timeline.length}</p>
              </div>
            ) : (
              <>
                <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                  <h3 className="text-xl font-bold text-white mb-4">Drift Over Time</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={driftTimelineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" /><XAxis dataKey="date" stroke="#9ca3af" /><YAxis stroke="#9ca3af" domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #a855f7', borderRadius: '8px' }} /><Legend />
                      <Line type="monotone" dataKey="drift" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 4 }} name="Drift Score" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {significantDrifts.length > 0 && (
                  <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                    <h3 className="text-xl font-bold text-white mb-4">Significant Changes</h3>
                    <div className="space-y-4">
                      {significantDrifts.map((drift) => (
                        <div key={drift.id} className="bg-slate-700/50 p-4 rounded-lg border border-gray-600">
                          <div className="flex justify-between items-start mb-2"><div className="text-sm text-gray-400">{new Date(drift.timestamp).toLocaleDateString()}</div><div className="text-orange-400 font-bold">Drift: {drift.driftScore}</div></div>
                          <p className="text-gray-300">{drift.summary}</p>
                          {drift.significantChanges?.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {drift.significantChanges.map((change, cidx) => <div key={cidx} className="text-sm text-gray-400 pl-4 border-l-2 border-purple-500/50">• {change?.description || ''}</div>)}
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

        {/* EVOLUTION */}
        {selectedTab === 'evolution' && (
          <div className="space-y-6">
            {(!evolutionStats || evolutionStats.totalSnapshots < 2) ? (
              <div className="bg-slate-800 rounded-xl p-12 border border-purple-500/30 text-center">
                <div className="text-6xl mb-4">📊</div><h3 className="text-2xl font-bold text-white mb-3">Evolution Coming Soon</h3>
                <p className="text-gray-400 mb-4">Create at least 2 snapshots to see your trait evolution stats</p><p className="text-sm text-gray-500">Current snapshots: {evolutionStats?.totalSnapshots || snapshots.length || 0}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[{ label: 'Total Snapshots', value: evolutionStats.totalSnapshots }, { label: 'Duration', value: `${evolutionStats.durationDays} days` }, { label: 'First Snapshot', value: new Date(evolutionStats.firstSnapshot).toLocaleDateString() }].map(stat => (
                    <div key={stat.label} className="bg-slate-800 rounded-xl p-6 border border-purple-500/30"><div className="text-gray-400 text-sm mb-1">{stat.label}</div><div className="text-3xl font-bold text-white">{stat.value}</div></div>
                  ))}
                </div>
                {evolutionStats.traitEvolution && (
                  <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/30">
                    <h3 className="text-xl font-bold text-white mb-4">Trait Evolution</h3>
                    <div className="space-y-4">
                      {Object.entries(evolutionStats.traitEvolution).map(([trait, data]) => (
                        <div key={trait} className="bg-slate-700/50 p-4 rounded-lg">
                          <div className="flex justify-between items-center mb-2">
                            <div className="font-semibold text-white capitalize">{trait.replace(/([A-Z])/g, ' $1').trim()}</div>
                            <div className={`font-bold ${data.change > 0 ? 'text-green-400' : data.change < 0 ? 'text-red-400' : 'text-gray-400'}`}>{data.change > 0 ? '+' : ''}{data.change}</div>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-400">
                            <span>Start: <span className="text-white font-semibold">{data.start}</span></span><span>→</span><span>Current: <span className="text-white font-semibold">{data.current}</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default PersonaDriftDashboard;