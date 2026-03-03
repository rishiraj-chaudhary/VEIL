import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LiveAssistantPanel from '../components/debate/LiveAssistantPanel';
import ScoreBreakdownModal from '../components/debate/ScoreBreakdownModal';
import VerdictExplainer from '../components/debate/VerdictExplainer';
import { useLiveAssistant } from '../hooks/useLiveAssistant';
import debateService from '../services/debateService';
import { disconnectDebateSocket, initDebateSocket, joinDebateRoom, onDebateCompleted, onTurnSubmitted } from '../services/debateSocket';

// Score Bar Component
const ScoreBar = ({ label, score, maxScore, color }) => {
  const percentage = (score / maxScore) * 100;
  const colorClasses = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500'
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-semibold">{score}/{maxScore}</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colorClasses[color]} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const DebateRoom = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [debate, setDebate] = useState(null);
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedRound, setSelectedRound] = useState(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [detailedScore, setDetailedScore] = useState(null);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [expandedTurns, setExpandedTurns] = useState(new Set());

  const currentUser = JSON.parse(localStorage.getItem('veil_user') || '{}');
  const userParticipant = debate?.participants?.find(
    p => p.user?._id === currentUser?.id || p.user === currentUser?.id
  );
  const isParticipant = !!userParticipant;
  const userSide = userParticipant?.side;

  const { insights, analyzing, analyzeDraft } = useLiveAssistant(id, userSide);

  useEffect(() => {
    if (id) {
      loadDebate();
      loadTurns();
      
      // Initialize sockets first
      const socket = initDebateSocket();
      
      // Wait for socket connection before setting up listeners
      if (socket) {
        // Join room immediately
        joinDebateRoom(id);
        
        // Set up listeners
        const unsubTurn = onTurnSubmitted((data) => {
          console.log('🔔 New turn submitted:', data);
          loadTurns();
        });
  
        const unsubCompleted = onDebateCompleted((data) => {
          console.log('🎉 Debate completed:', data);
          loadDebate();
          loadTurns();
          fetchDetailedScore();
        });
  
        // Cleanup function
        return () => {
          if (typeof unsubTurn === 'function') {
            unsubTurn();
          }
          if (typeof unsubCompleted === 'function') {
            unsubCompleted();
          }
          disconnectDebateSocket();
        };
      }
    }
    
    // If no socket, just clean up
    return () => {
      disconnectDebateSocket();
    };
  }, [id]);

  // Auto-fetch score when debate completes
  useEffect(() => {
    if (debate?.status === 'completed' && !detailedScore) {
      fetchDetailedScore();
    }
  }, [debate?.status]);

  const loadDebate = async () => {
    try {
      setLoading(true);
      const response = await debateService.getDebate(id);
      
      console.log('📊 Debate Response:', response);
      
      if (response.success && response.data && response.data.debate) {
        setDebate(response.data.debate);
      } else if (response.success && response.debate) {
        setDebate(response.debate);
      } else {
        throw new Error('Invalid debate data');
      }
      
    } catch (error) {
      console.error('Failed to load debate:', error);
      setError(error.message || 'Failed to load debate');
    } finally {
      setLoading(false);
    }
  };

  const loadTurns = async () => {
    try {
      const response = await debateService.getDebateTurns(id);
      
      console.log('📊 Turns Response:', response);
      
      // Handle different response formats
      if (response.success && response.data) {
        setTurns(Array.isArray(response.data) ? response.data : []);
      } else if (Array.isArray(response)) {
        setTurns(response);
      } else {
        setTurns([]);
      }
      
    } catch (error) {
      console.error('Failed to load turns:', error);
      setTurns([]);
    }
  };

  const fetchDetailedScore = async () => {
    try {
      const response = await debateService.getDebateScore(id);
      if (response.success && response.data) {
        setDetailedScore(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch detailed score:', error);
    }
  };

  const handleSubmitTurn = async (e) => {
    e.preventDefault();
    
    if (!content.trim()) {
      alert('Please enter your argument');
      return;
    }
  
    try {
      setSubmitting(true);
      
      const response = await debateService.submitTurn(id, content.trim());
      
      console.log('✅ Turn submitted:', response);
      
      // Reload debate and turns
      await loadTurns();
      await loadDebate();
      
      // Clear input
      setContent('');
      
    } catch (error) {
      console.error('Failed to submit turn:', error);
      
      // Show the actual error message from backend
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'Failed to submit turn';
      
      alert('Failed to submit turn: ' + errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleContentChange = (e) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    if (newContent.trim().length > 20 && isParticipant) {
      analyzeDraft(newContent);
    }
  };

  const toggleTurnExpanded = (turnId) => {
    setExpandedTurns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(turnId)) {
        newSet.delete(turnId);
      } else {
        newSet.add(turnId);
      }
      return newSet;
    });
  };

  const handleJoinSide = async (side) => {
    try {
      await debateService.joinDebate(id, side);
      await loadDebate();
    } catch (error) {
      alert('Failed to join: ' + error.message);
    }
  };

  const handleMarkReady = async () => {
    try {
      await debateService.markReady(id);
      await loadDebate();
    } catch (error) {
      alert('Failed to mark ready: ' + error.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-900 text-yellow-300';
      case 'active': return 'bg-green-900 text-green-300';
      case 'completed': return 'bg-blue-900 text-blue-300';
      case 'cancelled': return 'bg-red-900 text-red-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  // LOADING STATE
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading debate...</div>
      </div>
    );
  }

  // ERROR STATE
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">❌ {error}</div>
          <button
            onClick={() => navigate('/debates')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Back to Debates
          </button>
        </div>
      </div>
    );
  }

  // NULL CHECK
  if (!debate) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Debate not found</div>
          <button
            onClick={() => navigate('/debates')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Back to Debates
          </button>
        </div>
      </div>
    );
  }

  const participants = debate.participants || [];
  const isMyTurn = debate.currentTurn && (
    debate.currentTurn._id === currentUser?.id || 
    debate.currentTurn === currentUser?.id
  );

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/debates')}
            className="text-blue-400 hover:text-blue-300 mb-4"
          >
            ← Back to Debates
          </button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {debate.topic || 'Untitled Debate'}
              </h1>
              <p className="text-gray-400">
                {debate.description || 'No description'}
              </p>
            </div>
            <span className={`px-3 py-1 rounded text-sm font-semibold ${getStatusColor(debate.status)}`}>
              {debate.status?.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Participants */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-3">Participants</h2>
          <div className="grid grid-cols-2 gap-4">
            {participants.length > 0 ? (
              participants.map((participant, idx) => (
                <div 
                  key={idx} 
                  className={`bg-gray-800 rounded-lg p-4 border ${
                    participant.side === 'for' ? 'border-green-700' : 'border-red-700'
                  }`}
                >
                  <div className="text-white font-semibold">
                    {participant.user?.username || 'Unknown User'}
                  </div>
                  <div className={`text-sm ${participant.side === 'for' ? 'text-green-400' : 'text-red-400'}`}>
                    {participant.side === 'for' ? '✓ FOR' : '✗ AGAINST'}
                  </div>
                  {participant.isReady && debate.status === 'pending' && (
                    <div className="text-xs text-gray-400 mt-1">Ready ✓</div>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-2 text-gray-400 text-center py-4">
                No participants yet
              </div>
            )}
          </div>
        </div>

        {/* Debate Info */}
        {debate.status === 'active' && (
          <div className="mb-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-gray-400">Current Round: </span>
                <span className="text-white font-semibold">{debate.currentRound || 1}</span>
              </div>
              <div>
                <span className="text-gray-400">Total Turns: </span>
                <span className="text-white font-semibold">{turns.length}</span>
              </div>
            </div>
          </div>
        )}

        {/* Turns Section */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-3">
            Arguments ({turns.length})
          </h2>
          <div className="space-y-4">
            {turns.length > 0 ? (
              turns.map((turn, idx) => (
                <div 
                  key={turn._id || idx} 
                  className={`bg-gray-800 rounded-lg p-4 border ${
                    turn.side === 'for' ? 'border-green-700/30' : 'border-red-700/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-white font-semibold">
                        {turn.author?.username || 'Anonymous'}
                      </span>
                      <span className={`ml-2 text-sm ${turn.side === 'for' ? 'text-green-400' : 'text-red-400'}`}>
                        ({turn.side === 'for' ? 'FOR' : 'AGAINST'})
                      </span>
                    </div>
                    <span className="text-gray-500 text-sm">Round {turn.round}</span>
                  </div>
                  <p className="text-gray-300 mb-2 whitespace-pre-wrap">{turn.content}</p>
                  
                  {/* AI Analysis */}
                  {turn.aiAnalysis && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>
                          Quality: <span className="text-white font-semibold">
                            {turn.aiAnalysis.overallQuality}/100
                          </span>
                        </span>
                        {turn.aiAnalysis.toneScore && (
                          <span>Tone: {turn.aiAnalysis.toneScore}/100</span>
                        )}
                        {turn.aiAnalysis.clarityScore && (
                          <span>Clarity: {turn.aiAnalysis.clarityScore}/100</span>
                        )}
                      </div>
                      
                      {/* Show verdict explainer if available */}
                      {turn.aiAnalysis.decisionTrace && (
                        <div className="mt-2">
                          <button
                            onClick={() => toggleTurnExpanded(turn._id)}
                            className="text-blue-400 hover:text-blue-300 text-sm"
                          >
                            {expandedTurns.has(turn._id) ? '▼ Hide Analysis' : '▶ Show Analysis'}
                          </button>
                          {expandedTurns.has(turn._id) && (
                            <VerdictExplainer 
                              verdict={{ decisionTrace: turn.aiAnalysis.decisionTrace }}
                              overallQuality={turn.aiAnalysis.overallQuality}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-gray-400 text-center py-8 bg-gray-800 rounded-lg border border-gray-700">
                {debate.status === 'pending' 
                  ? 'No arguments yet. Debate will begin once both participants are ready.'
                  : 'No arguments in this debate.'}
              </div>
            )}
          </div>
        </div>

        {/* Submit Turn (Active Debate) */}
        {isParticipant && debate.status === 'active' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-xl font-bold text-white mb-4">
                  {isMyTurn ? '✍️ Your Turn' : '⏳ Waiting for Opponent'}
                </h2>
                
                {isMyTurn ? (
                  <form onSubmit={handleSubmitTurn}>
                    <textarea
                      value={content}
                      onChange={handleContentChange}
                      placeholder="Write your argument..."
                      className="w-full bg-gray-700 text-white rounded-lg p-4 mb-4 min-h-[150px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={submitting}
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm">
                        {content.trim().split(/\s+/).filter(w => w).length} words
                      </span>
                      <button
                        type="submit"
                        disabled={submitting || !content.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                      >
                        {submitting ? 'Submitting...' : 'Submit Turn'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="text-gray-400 text-center py-4">
                    It's your opponent's turn to argue.
                  </div>
                )}
              </div>
            </div>
            
            {/* Live Assistant */}
            {isMyTurn && (
              <div className="lg:col-span-1">
                <LiveAssistantPanel 
                  insights={insights}
                  analyzing={analyzing}
                />
              </div>
            )}
          </div>
        )}

        {/* Join Debate (Pending) */}
        {!isParticipant && debate.status === 'pending' && participants.length < 2 && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Join this debate</h2>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => handleJoinSide('for')}
                disabled={participants.some(p => p.side === 'for')}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-semibold"
              >
                Join FOR
              </button>
              <button
                onClick={() => handleJoinSide('against')}
                disabled={participants.some(p => p.side === 'against')}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-semibold"
              >
                Join AGAINST
              </button>
            </div>
          </div>
        )}

        {/* Mark Ready (Pending & Participant) */}
        {isParticipant && debate.status === 'pending' && !userParticipant?.isReady && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Ready to start?</h2>
            <button
              onClick={handleMarkReady}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold"
            >
              I'm Ready
            </button>
          </div>
        )}

        {/* Completed Debate - Show Results */}
        {debate.status === 'completed' && (
          <div className="space-y-6 mb-6">
            {/* Winner Banner */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-bold text-white mb-4">Debate Concluded</h2>
              
              {(debate.winner || debate.finalScores || detailedScore) ? (
                <div className="text-center">
                  {/* Winner Icon */}
                  <div className="text-6xl mb-4">
                    {(debate.winner || detailedScore?.winner) === 'for' ? '✓' : 
                     (debate.winner || detailedScore?.winner) === 'against' ? '✗' : '🤝'}
                  </div>
                  
                  {/* Winner Text */}
                  <div className="text-2xl font-bold text-purple-400 mb-4">
                    {(debate.winner || detailedScore?.winner) === 'draw' 
                      ? 'Draw' 
                      : `${(debate.winner || detailedScore?.winner) === 'for' ? 'FOR' : 'AGAINST'} Wins`}
                  </div>
                  
                  {/* Final Scores */}
                  {(debate.finalScores || detailedScore?.scores) && (
                    <div className="flex justify-center gap-8 mb-6">
                      <div>
                        <div className="text-gray-400 text-sm mb-1">FOR</div>
                        <div className="text-4xl font-bold text-green-400">
                          {debate.finalScores?.for || detailedScore?.scores?.for?.total || 0}
                        </div>
                      </div>
                      <div className="text-3xl text-gray-500 self-center">-</div>
                      <div>
                        <div className="text-gray-400 text-sm mb-1">AGAINST</div>
                        <div className="text-4xl font-bold text-red-400">
                          {debate.finalScores?.against || detailedScore?.scores?.against?.total || 0}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-4xl mb-4">⏳</div>
                  <div className="text-xl text-purple-400">Calculating results...</div>
                  <button
                    onClick={fetchDetailedScore}
                    className="mt-4 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Refresh Results
                  </button>
                </div>
              )}
            </div>

            {/* Detailed Score Breakdown */}
            {detailedScore && detailedScore.scores && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold text-white mb-4">📊 Score Breakdown</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* FOR Side Scores */}
                  <div className="bg-gray-900 rounded-lg p-4 border border-green-700/30">
                    <h4 className="text-green-400 font-semibold mb-3 text-center">
                      FOR Side
                    </h4>
                    <div className="space-y-3">
                      <ScoreBar
                        label="Argument Quality"
                        score={detailedScore.scores.for.argumentQuality}
                        maxScore={100}
                        color="green"
                      />
                      <ScoreBar
                        label="Rebuttal Effectiveness"
                        score={detailedScore.scores.for.rebuttalEffectiveness}
                        maxScore={100}
                        color="green"
                      />
                      <ScoreBar
                        label="Conduct & Clarity"
                        score={detailedScore.scores.for.conductClarity}
                        maxScore={100}
                        color="green"
                      />
                      <ScoreBar
                        label="Audience Support"
                        score={detailedScore.scores.for.audienceSupport}
                        maxScore={100}
                        color="green"
                      />
                      <div className="pt-3 border-t border-gray-700">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 font-semibold">Total Score</span>
                          <span className="text-2xl font-bold text-green-400">
                            {detailedScore.scores.for.total || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AGAINST Side Scores */}
                  <div className="bg-gray-900 rounded-lg p-4 border border-red-700/30">
                    <h4 className="text-red-400 font-semibold mb-3 text-center">
                      AGAINST Side
                    </h4>
                    <div className="space-y-3">
                      <ScoreBar
                        label="Argument Quality"
                        score={detailedScore.scores.against.argumentQuality}
                        maxScore={100}
                        color="red"
                      />
                      <ScoreBar
                        label="Rebuttal Effectiveness"
                        score={detailedScore.scores.against.rebuttalEffectiveness}
                        maxScore={100}
                        color="red"
                      />
                      <ScoreBar
                        label="Conduct & Clarity"
                        score={detailedScore.scores.against.conductClarity}
                        maxScore={100}
                        color="red"
                      />
                      <ScoreBar
                        label="Audience Support"
                        score={detailedScore.scores.against.audienceSupport}
                        maxScore={100}
                        color="red"
                      />
                      <div className="pt-3 border-t border-gray-700">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 font-semibold">Total Score</span>
                          <span className="text-2xl font-bold text-red-400">
                            {detailedScore.scores.against.total || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* View Full Analysis Button */}
                <div className="text-center">
                  <button
                    onClick={() => setScoreModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold"
                  >
                    📈 View Complete Analysis
                  </button>
                </div>
              </div>
            )}

            {/* Round-by-Round Breakdown */}
            {detailedScore && detailedScore.roundScores && detailedScore.roundScores.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold text-white mb-4">🎯 Round-by-Round Performance</h3>
                <div className="space-y-4">
                  {detailedScore.roundScores.map((round, idx) => (
                    <div key={idx} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-white font-semibold">Round {round.round}</span>
                        <span className="text-gray-400 text-sm">
                          {round.for > round.against ? '✓ FOR wins' : 
                           round.against > round.for ? '✗ AGAINST wins' : '🤝 Tied'}
                        </span>
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1 bg-green-900/20 rounded p-2">
                          <div className="text-green-400 text-sm">FOR</div>
                          <div className="text-green-300 font-bold text-lg">{round.for || 0}</div>
                        </div>
                        <div className="flex-1 bg-red-900/20 rounded p-2">
                          <div className="text-red-400 text-sm">AGAINST</div>
                          <div className="text-red-300 font-bold text-lg">{round.against || 0}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Participant Performance Summary */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4">👥 Participant Summaries</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {participants.map((participant, idx) => {
                  const participantTurns = turns.filter(t => 
                    (t.author?._id === participant.user?._id || t.author === participant.user?._id || t.author === participant.user) &&
                    t.side === participant.side
                  );
                  const avgQuality = participantTurns.length > 0
                    ? participantTurns.reduce((sum, t) => sum + (t.aiAnalysis?.overallQuality || 0), 0) / participantTurns.length
                    : 0;

                  return (
                    <div 
                      key={idx}
                      className={`bg-gray-900 rounded-lg p-4 border ${
                        participant.side === 'for' ? 'border-green-700/30' : 'border-red-700/30'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="text-white font-semibold">
                            {participant.user?.username || 'Unknown'}
                          </div>
                          <div className={`text-sm ${
                            participant.side === 'for' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {participant.side === 'for' ? 'FOR' : 'AGAINST'}
                          </div>
                        </div>
                        {participant.side === (debate.winner || detailedScore?.winner) && (
                          <span className="text-2xl">👑</span>
                        )}
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Arguments Made:</span>
                          <span className="text-white font-semibold">{participantTurns.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Avg Quality:</span>
                          <span className="text-white font-semibold">{avgQuality.toFixed(0)}/100</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Total Words:</span>
                          <span className="text-white font-semibold">
                            {participantTurns.reduce((sum, t) => sum + (t.wordCount || 0), 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Score Modal */}
        {scoreModalOpen && detailedScore && (
          <ScoreBreakdownModal
            score={detailedScore}
            onClose={() => setScoreModalOpen(false)}
          />
        )}

      </div>
    </div>
  );
};

export default DebateRoom;