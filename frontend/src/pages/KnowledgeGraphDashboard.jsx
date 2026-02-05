import axios from 'axios';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';

/**
 * POPULAR CLAIMS DASHBOARD
 * 
 * Shows trending arguments from the knowledge graph:
 * - Most used claims
 * - Most successful claims
 * - Claims by topic
 * - Overall graph statistics
 */

const KnowledgeGraphDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('popular'); // popular, successful, topics
  const [selectedTopic, setSelectedTopic] = useState(null);
  
  const [popularClaims, setPopularClaims] = useState([]);
  const [successfulClaims, setSuccessfulClaims] = useState([]);
  const [graphStats, setGraphStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [popularRes, successfulRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/api/knowledge-graph/claims/popular?limit=20`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/api/knowledge-graph/claims/successful?limit=20`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/api/knowledge-graph/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setPopularClaims(popularRes.data.data.claims);
      setSuccessfulClaims(successfulRes.data.data.claims);
      setGraphStats(statsRes.data.data);
    } catch (error) {
      console.error('Failed to fetch knowledge graph data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const response = await axios.get(
        `${API_URL}/api/knowledge-graph/claims/search?query=${encodeURIComponent(searchQuery)}&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSearchResults(response.data.data.results);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const filterByTopic = async (topic) => {
    setSelectedTopic(topic);
    try {
      const response = await axios.get(
        `${API_URL}/api/knowledge-graph/claims/topic/${topic}?sort=popular&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPopularClaims(response.data.data.claims);
    } catch (error) {
      console.error('Filter error:', error);
    }
  };

  const renderClaim = (claim) => {
    const successRate = claim.stats?.successRate 
      ? Math.round(claim.stats.successRate * 100) 
      : 0;

    return (
      <div
        key={claim._id}
        className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-purple-600 transition-colors cursor-pointer"
      >
        {/* Topic Badge */}
        <div className="flex items-center justify-between mb-2">
          <span className="px-2 py-1 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-300">
            {claim.topic}
          </span>
          <div className="flex items-center space-x-3 text-xs text-gray-400">
            <span>🔄 {claim.stats?.totalUses || 0} uses</span>
            {successRate > 0 && (
              <span className={successRate >= 60 ? 'text-green-400' : 'text-yellow-400'}>
                ✓ {successRate}% win rate
              </span>
            )}
          </div>
        </div>

        {/* Claim Text */}
        <p className="text-gray-200 leading-relaxed mb-3">
          "{claim.originalText}"
        </p>

        {/* Stats */}
        <div className="flex items-center space-x-4 text-xs">
          {claim.stats?.timesRefuted > 0 && (
            <span className="text-orange-400">
              ⚔️ Refuted {claim.stats.timesRefuted}x
            </span>
          )}
          {claim.stats?.avgQualityScore > 0 && (
            <span className="text-blue-400">
              ⭐ {Math.round(claim.stats.avgQualityScore)}/100 quality
            </span>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            📊 Argument Knowledge Graph
          </h1>
          <p className="text-gray-400">
            Explore patterns and trends in debate arguments
          </p>
        </div>

        {/* Overall Stats */}
        {graphStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="text-3xl font-bold text-purple-400 mb-1">
                {graphStats.totalClaims}
              </div>
              <div className="text-sm text-gray-400">Total Claims Tracked</div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="text-3xl font-bold text-blue-400 mb-1">
                {graphStats.totalRelationships}
              </div>
              <div className="text-sm text-gray-400">Relationships Mapped</div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="text-3xl font-bold text-green-400 mb-1">
                {graphStats.topicDistribution?.length || 0}
              </div>
              <div className="text-sm text-gray-400">Topics Covered</div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="text-3xl font-bold text-orange-400 mb-1">
                {Math.round(graphStats.totalClaims / Math.max(graphStats.topicDistribution?.length || 1, 1))}
              </div>
              <div className="text-sm text-gray-400">Avg Claims per Topic</div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="mb-6">
          <div className="flex space-x-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for claims..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-purple-600 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              Search
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-sm text-gray-400 mb-2">
                Found {searchResults.length} matching claims
              </div>
              {searchResults.map(renderClaim)}
            </div>
          )}
        </div>

        {/* Topic Filters */}
        {graphStats?.topicDistribution && (
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={() => {
                setSelectedTopic(null);
                fetchData();
              }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                !selectedTopic
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              All Topics
            </button>
            {graphStats.topicDistribution.map((topic) => (
              <button
                key={topic.topic}
                onClick={() => filterByTopic(topic.topic)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedTopic === topic.topic
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
                }`}
              >
                {topic.topic} ({topic.count})
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('popular')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'popular'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            🔥 Most Popular
          </button>
          <button
            onClick={() => setActiveTab('successful')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'successful'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            🏆 Most Successful
          </button>
        </div>

        {/* Claims List */}
        <div className="space-y-4">
          {activeTab === 'popular' && popularClaims.map(renderClaim)}
          {activeTab === 'successful' && successfulClaims.map(renderClaim)}

          {((activeTab === 'popular' && popularClaims.length === 0) ||
            (activeTab === 'successful' && successfulClaims.length === 0)) && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-4">📊</div>
              <div className="text-lg">No claims tracked yet</div>
              <div className="text-sm mt-2">
                Claims will appear here as debates progress
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeGraphDashboard;