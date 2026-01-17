import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useCommunityStore from '../../store/communityStore.js';
import useSlickStore from '../../store/slickStore.js';
import CreateSlickForm from './CreateSlickForm.js';
import SlickCard from './SlickCard.js';

const SlickFeed = () => {
  const { 
    receivedSlicks, 
    sentSlicks, 
    currency, 
    insights,
    fetchReceivedSlicks, 
    fetchSentSlicks, 
    fetchCurrency,
    fetchInsights,
    loading 
  } = useSlickStore();
  
  const { communities, fetchCommunities } = useCommunityStore();

  const [activeTab, setActiveTab] = useState('received');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);

  useEffect(() => {
    // Load initial data
    fetchReceivedSlicks();
    fetchSentSlicks();
    fetchCurrency();
    fetchInsights();
    fetchCommunities();
  }, []);

  // Get potential targets (community members)
  const getPotentialTargets = () => {
    const targets = new Set();
    communities.forEach(community => {
      if (community.members) {
        community.members.forEach(member => {
          if (member._id && member.username) {
            targets.add(JSON.stringify({ id: member._id, username: member.username }));
          }
        });
      }
    });
    return Array.from(targets).map(target => JSON.parse(target));
  };

  const handleCreateSlick = (targetUser) => {
    setSelectedTarget(targetUser);
    setShowCreateForm(true);
  };

  const tabs = [
    { id: 'received', label: 'Received', count: receivedSlicks.length },
    { id: 'sent', label: 'Sent', count: sentSlicks.length },
    { id: 'insights', label: 'Insights', count: null }
  ];

  return (
    <div className="min-h-screen bg-veil-dark">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">
                🎭 Slicks - Anonymous Feedback
              </h1>
              <p className="text-gray-400">
                Give and receive honest, anonymous feedback from your community
              </p>
            </div>
            
            {/* Currency Display */}
            <div className="text-right">
              <div className="text-sm text-gray-400">VeilCoins</div>
              <div className="text-xl font-bold text-veil-purple">
                {currency.balance || 0}
              </div>
              {currency.dailyBonus && (
                <div className="text-xs text-green-400">
                  +{currency.dailyBonus.earned} daily bonus!
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-4 flex space-x-3">
            <button
              onClick={() => {
                const targets = getPotentialTargets();
                if (targets.length > 0) {
                  handleCreateSlick(targets[0]);
                } else {
                  alert('Join communities to send feedback to other members!');
                }
              }}
              className="bg-veil-purple hover:bg-veil-indigo text-white px-4 py-2 rounded-lg transition-colors"
            >
              ✨ Send Feedback
            </button>
            
            <Link
              to="/communities"
              className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              🏘️ Join Communities
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-veil-purple text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span className="ml-2 px-2 py-1 bg-slate-600 rounded-full text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-veil-purple"></div>
            <p className="text-gray-400 mt-2">Loading...</p>
          </div>
        ) : (
          <>
            {/* Received Slicks */}
            {activeTab === 'received' && (
              <div>
                {receivedSlicks.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">🎭</div>
                    <h3 className="text-xl font-semibold text-white mb-2">No feedback yet</h3>
                    <p className="text-gray-400 mb-6">
                      Join communities and engage with others to receive anonymous feedback
                    </p>
                    <Link
                      to="/communities"
                      className="bg-veil-purple hover:bg-veil-indigo text-white px-6 py-3 rounded-lg transition-colors"
                    >
                      Explore Communities
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {receivedSlicks.map(slick => (
                      <SlickCard key={slick._id} slick={slick} isReceived={true} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sent Slicks */}
            {activeTab === 'sent' && (
              <div>
                {sentSlicks.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">✨</div>
                    <h3 className="text-xl font-semibold text-white mb-2">No feedback sent</h3>
                    <p className="text-gray-400 mb-6">
                      Start giving constructive anonymous feedback to your community
                    </p>
                    <button
                      onClick={() => {
                        const targets = getPotentialTargets();
                        if (targets.length > 0) {
                          handleCreateSlick(targets[0]);
                        } else {
                          alert('Join communities first to send feedback!');
                        }
                      }}
                      className="bg-veil-purple hover:bg-veil-indigo text-white px-6 py-3 rounded-lg transition-colors"
                    >
                      Send Your First Slick
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sentSlicks.map(slick => (
                      <SlickCard key={slick._id} slick={slick} isReceived={false} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Insights */}
            {activeTab === 'insights' && (
              <div>
                {insights ? (
                  <div className="space-y-6">
                    {/* Personality Insights */}
                    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                      <h3 className="text-lg font-semibold text-white mb-4">
                        🧠 AI Personality Insights
                      </h3>
                      <div className="space-y-2">
                        {insights.personalityInsights?.map((insight, index) => (
                          <p key={index} className="text-gray-300">• {insight}</p>
                        ))}
                      </div>
                    </div>

                    {/* Communication Style */}
                    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                      <h3 className="text-lg font-semibold text-white mb-4">
                        💬 Communication Style
                      </h3>
                      <p className="text-gray-300">{insights.communicationStyle}</p>
                    </div>

                    {/* Strengths & Growth Areas */}
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                        <h3 className="text-lg font-semibold text-green-400 mb-4">
                          💪 Strengths
                        </h3>
                        <div className="space-y-2">
                          {insights.strengths?.map((strength, index) => (
                            <p key={index} className="text-gray-300">• {strength}</p>
                          ))}
                        </div>
                      </div>

                      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                        <h3 className="text-lg font-semibold text-blue-400 mb-4">
                          🎯 Growth Areas
                        </h3>
                        <div className="space-y-2">
                          {insights.growthAreas?.map((area, index) => (
                            <p key={index} className="text-gray-300">• {area}</p>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Recommended Actions */}
                    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                      <h3 className="text-lg font-semibold text-veil-purple mb-4">
                        🚀 Recommended Actions
                      </h3>
                      <div className="space-y-2">
                        {insights.recommendedActions?.map((action, index) => (
                          <p key={index} className="text-gray-300">• {action}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">📊</div>
                    <h3 className="text-xl font-semibold text-white mb-2">No insights yet</h3>
                    <p className="text-gray-400">
                      Receive more feedback to unlock AI-powered personality insights
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Target Selection for Create Form */}
        {getPotentialTargets().length > 1 && (
          <div className="fixed bottom-6 right-6">
            <div className="relative group">
              <button className="bg-veil-purple hover:bg-veil-indigo text-white p-4 rounded-full shadow-lg transition-colors">
                ✨
              </button>
              <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 border border-slate-700 rounded-lg p-2 min-w-48">
                <p className="text-xs text-gray-400 mb-2">Send feedback to:</p>
                {getPotentialTargets().slice(0, 5).map(target => (
                  <button
                    key={target.id}
                    onClick={() => handleCreateSlick(target)}
                    className="w-full text-left px-2 py-1 text-sm text-white hover:bg-slate-700 rounded transition-colors"
                  >
                    {target.username}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Slick Form Modal */}
      {showCreateForm && selectedTarget && (
        <CreateSlickForm
          targetUserId={selectedTarget.id}
          targetUsername={selectedTarget.username}
          onClose={() => {
            setShowCreateForm(false);
            setSelectedTarget(null);
          }}
        />
      )}
    </div>
  );
};

export default SlickFeed;