import {
  ArcElement, CategoryScale, Chart as ChartJS, Filler, Legend,
  LinearScale, LineElement, PointElement, Title, Tooltip
} from 'chart.js';
import { useEffect, useRef, useState } from 'react';
import { Doughnut, Line } from 'react-chartjs-2';
import BudgetIndicator from '../components/debate/BudgetIndicator';
import aiUsageService from '../services/aiUsageService';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

const AIUsageDashboard = () => {
  const [stats, setStats]                           = useState(null);
  const [dailyUsage, setDailyUsage]                 = useState([]);
  const [operationBreakdown, setOperationBreakdown] = useState([]);
  const [loading, setLoading]                       = useState(true);
  const [refreshing, setRefreshing]                 = useState(false);
  const [timeRange, setTimeRange]                   = useState(30);
  const [lastRefreshed, setLastRefreshed]           = useState(null);
  const intervalRef                                 = useRef(null);

  useEffect(() => {
    loadData();

    // Auto-refresh every 30 seconds
    intervalRef.current = setInterval(() => loadData(true), 30000);
    return () => clearInterval(intervalRef.current);
  }, [timeRange]); // eslint-disable-line

  const loadData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);
      const startStr = startDate.toISOString();

      const [statsRes, dailyRes, opsRes] = await Promise.all([
        aiUsageService.getMyStats(startStr, null),
        aiUsageService.getDailyUsage(timeRange),
        aiUsageService.getOperationBreakdown(startStr, null),
      ]);

      setStats(statsRes.data);
      setDailyUsage(dailyRes.data || []);
      setOperationBreakdown(opsRes.data || []);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Failed to load AI usage data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-veil-dark flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-veil-purple mx-auto mb-4" />
          <div className="text-white">Loading AI usage data…</div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-veil-dark flex items-center justify-center">
        <div className="text-white">No usage data available</div>
      </div>
    );
  }

  const { budget, usage } = stats;
  const summary          = usage?.summary || {};
  const totalCalls       = summary.totalCalls      || 0;
  const cachedCalls      = summary.cachedCalls     || 0;
  const totalCost        = summary.totalCost       || 0;
  const totalTokens      = summary.totalTokens     || 0;
  const avgResponseTime  = summary.avgResponseTime || 0;
  const cacheHitRate     = totalCalls > 0 ? ((cachedCalls / totalCalls) * 100).toFixed(1) : '0.0';

  const dailyChartData = {
    labels: dailyUsage.map(d =>
      new Date(d._id).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    ),
    datasets: [
      {
        label: 'Daily Cost ($)',
        data: dailyUsage.map(d => d.cost),
        borderColor: 'rgb(139, 92, 246)',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true, tension: 0.4,
      },
      {
        label: 'Daily Calls',
        data: dailyUsage.map(d => d.calls),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true, tension: 0.4, yAxisID: 'y1',
      },
    ],
  };

  const dailyChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9CA3AF' } },
      tooltip: { backgroundColor: 'rgba(17,24,39,0.9)', titleColor: '#F3F4F6', bodyColor: '#D1D5DB' },
    },
    scales: {
      x: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(75,85,99,0.2)' } },
      y: {
        type: 'linear', display: true, position: 'left',
        ticks: { color: '#9CA3AF', callback: v => `$${v.toFixed(4)}` },
        grid: { color: 'rgba(75,85,99,0.2)' },
      },
      y1: {
        type: 'linear', display: true, position: 'right',
        ticks: { color: '#9CA3AF' }, grid: { drawOnChartArea: false },
      },
    },
  };

  const opChartData = {
    labels: operationBreakdown.map(op =>
      op._id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    ),
    datasets: [{
      data: operationBreakdown.map(op => op.cost),
      backgroundColor: [
        'rgba(139,92,246,0.8)', 'rgba(16,185,129,0.8)', 'rgba(245,158,11,0.8)',
        'rgba(239,68,68,0.8)',  'rgba(59,130,246,0.8)', 'rgba(236,72,153,0.8)',
      ],
      borderColor: [
        'rgb(139,92,246)', 'rgb(16,185,129)', 'rgb(245,158,11)',
        'rgb(239,68,68)',  'rgb(59,130,246)', 'rgb(236,72,153)',
      ],
      borderWidth: 2,
    }],
  };

  const opChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: '#9CA3AF', padding: 15 } },
      tooltip: {
        backgroundColor: 'rgba(17,24,39,0.9)', titleColor: '#F3F4F6', bodyColor: '#D1D5DB',
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
            return `${ctx.label}: $${ctx.parsed.toFixed(6)} (${pct}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="min-h-screen bg-veil-dark p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">💰 AI Usage Dashboard</h1>
            <p className="text-gray-400 text-sm">Track your AI costs and optimize your budget</p>
            {lastRefreshed && (
              <p className="text-gray-600 text-xs mt-1">
                Last updated: {lastRefreshed.toLocaleTimeString()}
                {refreshing && <span className="ml-2 text-veil-purple">↻ Refreshing…</span>}
              </p>
            )}
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-gray-300 hover:text-white rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Time range */}
        <div className="flex gap-2 mb-6 items-center">
          {[7, 14, 30, 60].map(days => (
            <button
              key={days}
              onClick={() => setTimeRange(days)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeRange === days
                  ? 'bg-veil-purple text-white'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700 hover:text-white border border-slate-700'
              }`}
            >
              {days} Days
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-500">
            Auto-refreshes every 30s
          </span>
        </div>

        {/* Budget + stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="md:col-span-1">
            <BudgetIndicator showDetails={true} />
          </div>

          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
              <div className="text-gray-400 text-sm mb-1">Total AI Calls</div>
              <div className="text-3xl font-bold text-white">{totalCalls.toLocaleString()}</div>
              <div className="text-xs text-green-400 mt-1">{cachedCalls} cached (free)</div>
            </div>

            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
              <div className="text-gray-400 text-sm mb-1">Total Cost</div>
              <div className="text-3xl font-bold text-white">
                {totalCost < 0.001
                  ? `$${totalCost.toFixed(6)}`
                  : totalCost < 0.01
                  ? `$${totalCost.toFixed(5)}`
                  : `$${totalCost.toFixed(4)}`}
              </div>
              <div className="text-xs text-gray-400 mt-1">{totalTokens.toLocaleString()} tokens</div>
            </div>

            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
              <div className="text-gray-400 text-sm mb-1">Avg Response Time</div>
              <div className="text-3xl font-bold text-white">{(avgResponseTime / 1000).toFixed(2)}s</div>
              <div className="text-xs text-gray-400 mt-1">per request</div>
            </div>

            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
              <div className="text-gray-400 text-sm mb-1">Cache Hit Rate</div>
              <div className="text-3xl font-bold text-white">{cacheHitRate}%</div>
              <div className="text-xs text-green-400 mt-1">
                {cachedCalls > 0 ? `${cachedCalls} free calls` : 'No cached calls yet'}
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-lg font-bold text-white mb-4">📊 Daily Usage Trend</h2>
            {dailyUsage.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
                No usage data for this period
              </div>
            ) : (
              <div style={{ height: 280 }}>
                <Line data={dailyChartData} options={dailyChartOptions} />
              </div>
            )}
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-lg font-bold text-white mb-4">🎯 Cost by Operation</h2>
            {operationBreakdown.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
                No operation data for this period
              </div>
            ) : (
              <div style={{ height: 280 }}>
                <Doughnut data={opChartData} options={opChartOptions} />
              </div>
            )}
          </div>
        </div>

        {/* Operation table */}
        {operationBreakdown.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-8">
            <h2 className="text-lg font-bold text-white mb-4">📋 Operation Details</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="pb-3 text-gray-400 font-semibold">Operation</th>
                    <th className="pb-3 text-gray-400 font-semibold text-right">Calls</th>
                    <th className="pb-3 text-gray-400 font-semibold text-right">Tokens</th>
                    <th className="pb-3 text-gray-400 font-semibold text-right">Cost</th>
                    <th className="pb-3 text-gray-400 font-semibold text-right">Avg Time</th>
                  </tr>
                </thead>
                <tbody>
                  {operationBreakdown.map((op, idx) => (
                    <tr key={idx} className="border-b border-slate-700/50">
                      <td className="py-3 text-white capitalize">
                        {op._id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </td>
                      <td className="py-3 text-gray-300 text-right">{op.calls}</td>
                      <td className="py-3 text-gray-300 text-right">{op.tokens.toLocaleString()}</td>
                      <td className="py-3 text-veil-purple text-right font-semibold">${op.cost.toFixed(6)}</td>
                      <td className="py-3 text-gray-300 text-right">{(op.avgResponseTime / 1000).toFixed(2)}s</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-600">
                  <tr>
                    <td className="pt-3 text-white font-semibold">Total</td>
                    <td className="pt-3 text-white font-semibold text-right">
                      {operationBreakdown.reduce((s, o) => s + o.calls, 0)}
                    </td>
                    <td className="pt-3 text-white font-semibold text-right">
                      {operationBreakdown.reduce((s, o) => s + o.tokens, 0).toLocaleString()}
                    </td>
                    <td className="pt-3 text-veil-purple font-semibold text-right">
                      ${operationBreakdown.reduce((s, o) => s + o.cost, 0).toFixed(6)}
                    </td>
                    <td className="pt-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="bg-veil-purple/10 border border-veil-purple/30 rounded-lg p-6">
          <h3 className="text-base font-bold text-veil-purple mb-3">💡 Tips to Reduce AI Costs</h3>
          <ul className="space-y-1.5 text-gray-300 text-sm">
            <li>✓ Use caching when possible — it's free</li>
            <li>✓ Upgrade to Pro for higher daily budget ($2/day vs $0.25/day)</li>
            <li>✓ The system automatically uses cheaper models when approaching budget limits</li>
            <li>✓ Groq API is extremely cheap — most debate sessions cost under $0.001</li>
          </ul>
        </div>

      </div>
    </div>
  );
};

export default AIUsageDashboard;