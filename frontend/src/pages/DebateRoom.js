import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import AnalysisPanel from '../components/debate/AnalysisPanel';
import ClaimStats from '../components/debate/ClaimStats';
import LiveAssistantPanel from '../components/debate/LiveAssistantPanel.js';
import { useLiveAssistant } from '../hooks/useLiveAssistant';
import {
  getDebateSocket,
  joinDebateRoom,
  leaveDebateRoom,
  onDebateCancelled,
  onDebateCompleted,
  onDebateStarted,
  onDebateState,
  onParticipantJoined,
  onParticipantReady,
  onRoundAdvanced,
  onTurnSubmitted,
  onViewerCount,
  onVoteCast,
  removeAllListeners
} from '../services/debateSocket';
import useAuthStore from '../store/authStore';
import useDebateStore from '../store/debateStore';

const DebateRoom = () => {
  const { id: debateId } = useParams();
  const navigate = useNavigate();
  
  const { user } = useAuthStore();
  
  const {
    currentDebate,
    turns,
    viewerCount,
    fetchDebate,
    fetchTurns,
    joinDebate,
    markReady,
    submitTurn,
    canSubmitTurn,
    voteOnRound,
    setViewerCount,
    updateDebateState,
    addTurn,
    loading
  } = useDebateStore();

  const [turnContent, setTurnContent] = useState('');
  const [canSubmit, setCanSubmit] = useState({ canSubmit: false, reason: '' });
  const [selectedVote, setSelectedVote] = useState({ side: null, confidence: 3 });
  const [showScore, setShowScore] = useState(false);

  // Get participant info
  const myParticipant = currentDebate?.participants?.find(
    p => p.user._id === user?.id
  );

  // Initialize live assistant
  const { insights, isAnalyzing, analyzeDraft, clearInsights } = 
    useLiveAssistant(debateId, myParticipant?.side);

  useEffect(() => {
    fetchDebate(debateId);
    fetchTurns(debateId);
    joinDebateRoom(debateId);

    onViewerCount(({ viewerCount: count }) => {
      setViewerCount(count);
    });

    onDebateState((state) => {
      updateDebateState(state);
    });

    onDebateStarted((data) => {
      console.log('🎉 Debate started!', data);
      updateDebateState({ status: 'active', currentRound: data.currentRound });
    });

    onTurnSubmitted(({ turn }) => {
      addTurn(turn);
      setTurnContent('');
    });

    // ✅ FIXED: Listen for analysis complete
    const analysisCompleteHandler = ({ turnId }) => {
      console.log('📊 Analysis complete for turn:', turnId);
      setTimeout(() => {
        fetchTurns(debateId);
      }, 500);
    };
    
    const socket = getDebateSocket();
    socket.on('analysis-complete', analysisCompleteHandler);

    onRoundAdvanced(({ currentRound }) => {
      updateDebateState({ currentRound });
    });

    onDebateCompleted(({ winner, finalScores }) => {
      updateDebateState({ status: 'completed', winner, finalScores });
      setShowScore(true);
    });

    onParticipantJoined(({ participant }) => {
      console.log('👤 Participant joined:', participant);
      fetchDebate(debateId);
    });

    onParticipantReady(({ username }) => {
      console.log('✅ Participant ready:', username);
      fetchDebate(debateId);
    });

    onVoteCast(() => {});

    onDebateCancelled(() => {
      alert('Debate has been cancelled');
      navigate('/debates');
    });
    
    return () => {
      leaveDebateRoom(debateId);
      socket.off('analysis-complete', analysisCompleteHandler);
      removeAllListeners();
    };
  }, [debateId, fetchDebate, fetchTurns, setViewerCount, updateDebateState, addTurn, navigate]);

  const handleContentChange = (e) => {
    const content = e.target.value;
    setTurnContent(content);
    
    if (user && content.length >= 20) {
      analyzeDraft(content, user.id);
    }
  };

  // Debug logging
  useEffect(() => {
    console.log('📊 Turns data:', turns);
    turns.forEach((turn, i) => {
      console.log(`Turn ${i+1}:`, {
        content: turn.content.substring(0, 30),
        hasAnalysis: !!turn.aiAnalysis,
        analysis: turn.aiAnalysis
      });
    });
  }, [turns]);

  useEffect(() => {
    if (currentDebate?.status === 'active') {
      canSubmitTurn(debateId).then(setCanSubmit);
    }
  }, [currentDebate, turns, debateId, canSubmitTurn]);

  const handleJoinSide = async (side) => {
    const result = await joinDebate(debateId, side);
    if (!result.success) {
      alert(result.error);
    }
  };

  const handleMarkReady = async () => {
    const result = await markReady(debateId);
    if (!result.success) {
      alert(result.error);
    }
  };

  const handleSubmitTurn = async (e) => {
    e.preventDefault();
    
    if (!turnContent.trim()) {
      alert('Please enter your argument');
      return;
    }

    const wordCount = turnContent.trim().split(/\s+/).length;
    const currentRoundConfig = currentDebate?.rounds?.find(
      r => r.number === currentDebate.currentRound
    );

    if (currentRoundConfig && wordCount > currentRoundConfig.wordLimit) {
      alert(`Word limit exceeded: ${wordCount}/${currentRoundConfig.wordLimit}`);
      return;
    }

    const result = await submitTurn(debateId, turnContent);
    if (!result.success) {
      alert(result.error);
    }
  };

  const handleVote = async () => {
    if (!selectedVote.side) {
      alert('Please select a side');
      return;
    }

    const result = await voteOnRound(
      debateId,
      currentDebate.currentRound,
      selectedVote.side,
      selectedVote.confidence
    );

    if (result.success) {
      alert('Vote recorded!');
      setSelectedVote({ side: null, confidence: 3 });
    } else {
      alert(result.error);
    }
  };

  const isParticipant = currentDebate?.participants?.some(
    p => p.user._id === user?.id
  );

  const isMyTurn = currentDebate?.currentTurn?._id === user?.id;

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-900/20 text-yellow-400 border-yellow-700',
      active: 'bg-green-900/20 text-green-400 border-green-700',
      completed: 'bg-blue-900/20 text-blue-400 border-blue-700',
    };
    return colors[status] || 'bg-gray-900/20 text-gray-400 border-gray-700';
  };

  const wordCount = turnContent.trim().split(/\s+/).filter(w => w).length;
  const currentRoundConfig = currentDebate?.rounds?.find(
    r => r.number === currentDebate.currentRound
  );

  if (loading || !currentDebate) {
    return (
      <div className="min-h-screen bg-veil-dark">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-veil-purple"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Debate Header */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <span className={`px-3 py-1 rounded border text-sm font-medium ${getStatusColor(currentDebate.status)}`}>
                  {currentDebate.status}
                </span>
                {currentDebate.status === 'active' && (
                  <span className="text-sm text-veil-purple font-medium">
                    Round {currentDebate.currentRound}/{currentDebate.rounds?.length}
                  </span>
                )}
              </div>
              
              <h1 className="text-2xl font-bold text-white mb-2">
                {currentDebate.topic}
              </h1>
              
              {currentDebate.description && (
                <p className="text-gray-400">{currentDebate.description}</p>
              )}
            </div>

            <div className="flex items-center space-x-2 text-sm text-gray-400">
              <span>👁️</span>
              <span>{viewerCount} viewing</span>
            </div>
          </div>

          {/* Participants */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-900/10 border border-green-700/50 rounded-lg p-4">
              <div className="text-sm text-green-400 mb-2">✓ FOR</div>
              {currentDebate.participants?.find(p => p.side === 'for') ? (
                <div>
                  <div className="text-white font-semibold">
                    {currentDebate.participants.find(p => p.side === 'for').user.username}
                  </div>
                  {currentDebate.status === 'pending' && (
                    <div className="text-xs text-gray-400 mt-1">
                      {currentDebate.participants.find(p => p.side === 'for').isReady ? '✓ Ready' : 'Not ready'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">Open slot</div>
              )}
            </div>

            <div className="bg-red-900/10 border border-red-700/50 rounded-lg p-4">
              <div className="text-sm text-red-400 mb-2">✗ AGAINST</div>
              {currentDebate.participants?.find(p => p.side === 'against') ? (
                <div>
                  <div className="text-white font-semibold">
                    {currentDebate.participants.find(p => p.side === 'against').user.username}
                  </div>
                  {currentDebate.status === 'pending' && (
                    <div className="text-xs text-gray-400 mt-1">
                      {currentDebate.participants.find(p => p.side === 'against').isReady ? '✓ Ready' : 'Not ready'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">Open slot</div>
              )}
            </div>
          </div>

          {/* Current Turn Indicator */}
          {currentDebate.status === 'active' && currentDebate.currentTurn && (
            <div className="mt-4 p-3 bg-veil-purple/10 border border-veil-purple/30 rounded-lg">
              <div className="text-sm text-veil-purple">
                Current turn: <span className="font-semibold">{currentDebate.currentTurn.username}</span>
                {isMyTurn && <span className="ml-2">← That's you!</span>}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Join Debate */}
            {currentDebate.status === 'pending' && !isParticipant && (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Join Debate</h2>
                <p className="text-gray-400 mb-4">Choose your side to join this debate:</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleJoinSide('for')}
                    disabled={currentDebate.participants?.some(p => p.side === 'for')}
                    className="p-4 bg-green-900/20 hover:bg-green-900/30 border border-green-700 rounded-lg text-green-400 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Join FOR
                  </button>
                  
                  <button
                    onClick={() => handleJoinSide('against')}
                    disabled={currentDebate.participants?.some(p => p.side === 'against')}
                    className="p-4 bg-red-900/20 hover:bg-red-900/30 border border-red-700 rounded-lg text-red-400 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Join AGAINST
                  </button>
                </div>
              </div>
            )}

            {/* Waiting Room */}
            {currentDebate.status === 'pending' && isParticipant && (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Waiting for Debate to Start</h2>
                
                {!myParticipant?.isReady ? (
                  <button
                    onClick={handleMarkReady}
                    className="w-full py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg font-semibold transition-colors"
                  >
                    Mark as Ready
                  </button>
                ) : (
                  <div className="text-center py-4">
                    <div className="text-green-400 text-lg mb-2">✓ You are ready</div>
                    <div className="text-gray-400 text-sm">Waiting for opponent...</div>
                  </div>
                )}
              </div>
            )}

            {/* Arguments List */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Arguments</h2>
              
              {turns.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No arguments yet. Debate will begin once both participants are ready.
                </div>
              ) : (
                <div className="space-y-4">
                  {turns.map((turn) => (
                    <div
                      key={turn._id}
                      className={`p-4 rounded-lg border ${
                        turn.side === 'for'
                          ? 'bg-green-900/10 border-green-700/50'
                          : 'bg-red-900/10 border-red-700/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className={turn.side === 'for' ? 'text-green-400' : 'text-red-400'}>
                            {turn.side === 'for' ? '✓' : '✗'}
                          </span>
                          <span className="font-semibold text-white">
                            {turn.author?.username}
                          </span>
                          <span className="text-xs text-gray-500">
                            Round {turn.round} • Turn {turn.turnNumber}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {turn.wordCount} words
                        </span>
                      </div>
                      
                      <p className="text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {turn.content}
                      </p>
                      {turn.aiAnalysis?.claims && turn.aiAnalysis.claims.length > 0 && (
                      <div className="mb-3 space-y-2">
                        <div className="text-xs font-semibold text-purple-400 mb-2">
                          📊 Claims in Knowledge Graph:
                        </div>
                        {turn.aiAnalysis.claims.map((claim, idx) => (
                          <ClaimStats key={idx} claimText={claim} compact={true} />
                        ))}
                      </div>
                    )}

                      {/* AI Analysis */}
                      {turn.aiAnalysis && (
                        <div className="mt-3 pt-3 border-t border-slate-700">
                          <AnalysisPanel aiAnalysis={turn.aiAnalysis} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Turn Form */}
            {currentDebate.status === 'active' && canSubmit.canSubmit && (
              <div className="bg-slate-800 rounded-lg border border-veil-purple p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Your Turn</h2>
                
                <form onSubmit={handleSubmitTurn} className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm text-gray-300">Your Argument</label>
                      <span className={`text-xs ${
                        currentRoundConfig && wordCount > currentRoundConfig.wordLimit
                          ? 'text-red-400'
                          : 'text-gray-500'
                      }`}>
                        {wordCount}/{currentRoundConfig?.wordLimit || 0} words
                      </span>
                    </div>
                    
                    <textarea
                      value={turnContent}
                      onChange={handleContentChange}
                      className="w-full bg-slate-900 text-white rounded-lg p-3 min-h-[200px] border border-slate-700 focus:border-veil-purple focus:outline-none"
                      placeholder="Present your argument..."
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!turnContent.trim() || (currentRoundConfig && wordCount > currentRoundConfig.wordLimit)}
                    className="w-full py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Submit Turn
                  </button>
                </form>
              </div>
            )}

            {/* Debate Results */}
            {currentDebate.status === 'completed' && (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Debate Concluded</h2>
                
                <div className="text-center py-6">
                  <div className="text-3xl mb-2">
                    {!currentDebate.winner ? '⏳' : currentDebate.winner === 'draw' ? '🤝' : '🏆'}
                  </div>
                  <div className="text-2xl font-bold text-veil-purple mb-2">
                    {!currentDebate.winner 
                      ? 'Calculating results...' 
                      : currentDebate.winner === 'draw' 
                        ? 'Draw' 
                        : `${currentDebate.winner.toUpperCase()} wins!`
                    }
                  </div>
                  {currentDebate.finalScores && (
                    <div className="text-gray-400">
                      Final Score: {currentDebate.finalScores.for} - {currentDebate.finalScores.against}
                    </div>
                  )}
                </div>

                {currentDebate.winner && (
                  <button
                    onClick={() => setShowScore(!showScore)}
                    className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    {showScore ? 'Hide' : 'View'} Detailed Score
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Voting */}
            {currentDebate.status === 'active' && !isParticipant && (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Vote - Round {currentDebate.currentRound}
                </h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <button
                      onClick={() => setSelectedVote({ ...selectedVote, side: 'for' })}
                      className={`w-full p-3 rounded-lg border transition-colors ${
                        selectedVote.side === 'for'
                          ? 'bg-green-900/20 border-green-700 text-green-400'
                          : 'bg-slate-700 border-slate-600 text-gray-300 hover:bg-slate-600'
                      }`}
                    >
                      ✓ Vote FOR
                    </button>

                    <button
                      onClick={() => setSelectedVote({ ...selectedVote, side: 'against' })}
                      className={`w-full p-3 rounded-lg border transition-colors ${
                        selectedVote.side === 'against'
                          ? 'bg-red-900/20 border-red-700 text-red-400'
                          : 'bg-slate-700 border-slate-600 text-gray-300 hover:bg-slate-600'
                      }`}
                    >
                      ✗ Vote AGAINST
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Confidence: {selectedVote.confidence}/5
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={selectedVote.confidence}
                      onChange={(e) => setSelectedVote({ ...selectedVote, confidence: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <button
                    onClick={handleVote}
                    disabled={!selectedVote.side}
                    className="w-full py-2 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Submit Vote
                  </button>
                </div>
              </div>
            )}

            {/* Rounds Info */}
            {currentDebate.rounds && (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Rounds</h3>
                
                <div className="space-y-2">
                  {currentDebate.rounds.map((round) => (
                    <div
                      key={round.number}
                      className={`p-3 rounded-lg border ${
                        currentDebate.currentRound === round.number
                          ? 'bg-veil-purple/20 border-veil-purple'
                          : 'bg-slate-700/50 border-slate-600'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            Round {round.number}: {round.type}
                          </div>
                          <div className="text-xs text-gray-400">
                            {round.wordLimit} words • {round.timeLimit} min
                          </div>
                        </div>
                        {currentDebate.currentRound === round.number && (
                          <span className="text-veil-purple text-xl">●</span>
                        )}
                      </div> 
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <LiveAssistantPanel
        insights={insights}
        isAnalyzing={isAnalyzing}
        onDismiss={clearInsights}
      />
    </div>
  );
};

export default DebateRoom;