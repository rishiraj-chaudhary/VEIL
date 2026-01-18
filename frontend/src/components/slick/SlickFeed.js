import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useCommunityStore from '../../store/communityStore.js';
import useSlickStore from '../../store/slickStore.js';
import CreateSlickForm from './CreateSlickForm.js';
import SlickCard from './SlickCard.js';

const SlickFeed = () => {
    const { user } = useAuthStore();
  const {
    receivedSlicks,
    sentSlicks,
    currency,
    insights,
    fetchReceivedSlicks,
    fetchSentSlicks,
    fetchCurrency,
    fetchInsights,
    loading,
  } = useSlickStore();

  const { communities, fetchCommunities } = useCommunityStore();

  const [activeTab, setActiveTab] = useState('received');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);

  /* ---------------- Initial Data Load ---------------- */
  useEffect(() => {
    fetchReceivedSlicks();
    fetchSentSlicks();
    fetchCurrency();
    fetchInsights();
    fetchCommunities();
  }, [
    fetchReceivedSlicks,
    fetchSentSlicks,
    fetchCurrency,
    fetchInsights,
    fetchCommunities,
  ]);

  /* ---------------- Reactive Target List ---------------- */
  const potentialTargets = useMemo(() => {
    const map = new Map();
  
    communities.forEach((community) => {
      community.members?.forEach((member) => {
        if (
          member?._id &&
          member?.username &&
          member._id !== user?._id   // ✅ EXCLUDE SELF
        ) {
          map.set(member._id, {
            id: member._id,
            username: member.username,
          });
        }
      });
    });
  
    return Array.from(map.values());
  }, [communities, user]);

  const handleCreateSlick = (targetUser) => {
    setSelectedTarget(targetUser);
    setShowCreateForm(true);
  };

  const tabs = [
    { id: 'received', label: 'Received', count: receivedSlicks.length },
    { id: 'sent', label: 'Sent', count: sentSlicks.length },
    { id: 'insights', label: 'Insights', count: null },
  ];

  return (
    <div className="min-h-screen bg-veil-dark">
      {/* ---------------- Header ---------------- */}
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

            {/* Currency */}
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
                if (potentialTargets.length >= 1) {
                  handleCreateSlick(potentialTargets[0]);
                } else {
                    alert('Join communities with other members to send feedback!');
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

      {/* ---------------- Content ---------------- */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex space-x-1 mb-6">
          {tabs.map((tab) => (
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

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-veil-purple"></div>
            <p className="text-gray-400 mt-2">Loading...</p>
          </div>
        ) : (
          <>
            {/* ---------------- Received ---------------- */}
            {activeTab === 'received' && (
              <div className="space-y-4">
                {receivedSlicks.length === 0 ? (
                  <EmptyState
                    emoji="🎭"
                    title="No feedback yet"
                    desc="Join communities and engage to receive anonymous feedback"
                    action="/communities"
                  />
                ) : (
                  receivedSlicks.map((slick) => (
                    <SlickCard key={slick._id} slick={slick} isReceived />
                  ))
                )}
              </div>
            )}

            {/* ---------------- Sent ---------------- */}
            {activeTab === 'sent' && (
              <div className="space-y-4">
                {sentSlicks.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">✨</div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      No feedback sent
                    </h3>
                    <p className="text-gray-400 mb-6">
                      Start giving constructive anonymous feedback
                    </p>
                    <button
                      onClick={() => {
                        if (potentialTargets.length > 0) {
                          handleCreateSlick(potentialTargets[0]);
                        } else {
                          alert('Join communities first!');
                        }
                      }}
                      className="bg-veil-purple hover:bg-veil-indigo text-white px-6 py-3 rounded-lg transition-colors"
                    >
                      Send Your First Slick
                    </button>
                  </div>
                ) : (
                  sentSlicks.map((slick) => (
                    <SlickCard key={slick._id} slick={slick} isReceived={false} />
                  ))
                )}
              </div>
            )}

            {/* ---------------- Insights ---------------- */}
            {activeTab === 'insights' && (
              <div className="space-y-6">
                {insights ? (
                  <>
                    <InsightBlock title="🧠 AI Personality Insights">
                      {insights.personalityInsights?.map((i, idx) => (
                        <p key={idx}>• {i}</p>
                      ))}
                    </InsightBlock>

                    <InsightBlock title="💬 Communication Style">
                      <p>{insights.communicationStyle}</p>
                    </InsightBlock>

                    <div className="grid md:grid-cols-2 gap-6">
                      <InsightBlock title="💪 Strengths" color="text-green-400">
                        {insights.strengths?.map((s, i) => (
                          <p key={i}>• {s}</p>
                        ))}
                      </InsightBlock>

                      <InsightBlock title="🎯 Growth Areas" color="text-blue-400">
                        {insights.growthAreas?.map((g, i) => (
                          <p key={i}>• {g}</p>
                        ))}
                      </InsightBlock>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    emoji="📊"
                    title="No insights yet"
                    desc="Receive more feedback to unlock insights"
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ---------------- Floating Target Picker ---------------- */}
      {potentialTargets.length > 1 && (
        <div className="fixed bottom-6 right-6">
          <div className="relative group">
            <button className="bg-veil-purple hover:bg-veil-indigo text-white p-4 rounded-full shadow-lg">
              ✨
            </button>
            <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 border border-slate-700 rounded-lg p-2 min-w-48">
              <p className="text-xs text-gray-400 mb-2">Send feedback to:</p>
              {potentialTargets.slice(0, 5).map((target) => (
                <button
                  key={target.id}
                  onClick={() => handleCreateSlick(target)}
                  className="w-full text-left px-2 py-1 text-sm text-white hover:bg-slate-700 rounded"
                >
                  {target.username}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Create Slick Modal ---------------- */}
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

/* ---------------- Helper Components ---------------- */
const EmptyState = ({ emoji, title, desc, action }) => (
  <div className="text-center py-12">
    <div className="text-6xl mb-4">{emoji}</div>
    <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
    <p className="text-gray-400 mb-6">{desc}</p>
    {action && (
      <Link
        to={action}
        className="bg-veil-purple hover:bg-veil-indigo text-white px-6 py-3 rounded-lg"
      >
        Explore Communities
      </Link>
    )}
  </div>
);

const InsightBlock = ({ title, children, color = 'text-white' }) => (
  <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
    <h3 className={`text-lg font-semibold mb-4 ${color}`}>{title}</h3>
    <div className="space-y-2 text-gray-300">{children}</div>
  </div>
);

export default SlickFeed;