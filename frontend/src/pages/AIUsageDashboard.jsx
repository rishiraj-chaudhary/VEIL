import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip
} from 'chart.js';
import React, { useCallback, useEffect, useState } from 'react';
import { Doughnut, Line } from 'react-chartjs-2';
import BudgetIndicator from '../components/debate/BudgetIndicator';
import aiUsageService from '../services/aiUsageService';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const AIUsageDashboard = () => {
  const [stats, setStats] = useState(null);
  const [dailyUsage, setDailyUsage] = useState([]);
  const [operationBreakdown, setOperationBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30); // days

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, dailyRes, opsRes] = await Promise.all([
        aiUsageService.getMyStats(),
        aiUsageService.getDailyUsage(timeRange),
        aiUsageService.getOperationBreakdown()
      ]);
        console.log('📊 Stats Response:', statsRes); // ✅ ADD THIS
        console.log('📅 Daily Response:', dailyRes); // ✅ ADD THIS
        console.log('🎯 Operations Response:', opsRes); // ✅ ADD THIS


      setStats(statsRes.data);
      setDailyUsage(dailyRes.data);
      setOperationBreakdown(opsRes.data);
    } catch (error) {
      console.error('Failed to load AI usage data:', error);
    } finally {
      setLoading(false);
    }
  }, [timeRange]); 
  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading AI usage data...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">No usage data available</div>
      </div>
    );
  }

  const { budget, usage } = stats;

  // Prepare daily chart data
  const dailyChartData = {
    labels: dailyUsage.map(d => new Date(d._id).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: 'Daily Cost ($)',
        data: dailyUsage.map(d => d.cost),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Daily Calls',
        data: dailyUsage.map(d => d.calls),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y1'
      }
    ]
  };

  const dailyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#9CA3AF' }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: '#F3F4F6',
        bodyColor: '#D1D5DB'
      }
    },
    scales: {
      x: {
        ticks: { color: '#9CA3AF' },
        grid: { color: 'rgba(75, 85, 99, 0.2)' }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        ticks: {
          color: '#9CA3AF',
          callback: (value) => `$${value.toFixed(2)}`
        },
        grid: { color: 'rgba(75, 85, 99, 0.2)' }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        ticks: { color: '#9CA3AF' },
        grid: { drawOnChartArea: false }
      }
    }
  };

  // Prepare operation breakdown chart
  const operationChartData = {
    labels: operationBreakdown.map(op => 
      op._id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    ),
    datasets: [
      {
        data: operationBreakdown.map(op => op.cost),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(139, 92, 246, 0.8)',
          'rgba(236, 72, 153, 0.8)'
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(245, 158, 11)',
          'rgb(239, 68, 68)',
          'rgb(139, 92, 246)',
          'rgb(236, 72, 153)'
        ],
        borderWidth: 2
      }
    ]
  };

  const operationChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: { color: '#9CA3AF', padding: 15 }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: '#F3F4F6',
        bodyColor: '#D1D5DB',
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: $${value.toFixed(4)} (${percentage}%)`;
          }
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            💰 AI Usage Dashboard
          </h1>
          <p className="text-gray-400">
            Track your AI costs and optimize your budget
          </p>
        </div>

        {/* Budget Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Budget Indicator */}
          <div className="md:col-span-1">
            <BudgetIndicator showDetails={true} />
          </div>

          {/* Summary Stats */}
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            
            {/* Total Calls */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Total AI Calls</div>
              <div className="text-3xl font-bold text-white">
                {usage.summary.totalCalls || 0}
              </div>
              <div className="text-xs text-green-400 mt-1">
                {usage.summary.cachedCalls || 0} cached (free)
              </div>
            </div>

            {/* Total Cost */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Total Cost</div>
              <div className="text-3xl font-bold text-white">
                ${(usage.summary.totalCost || 0).toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {(usage.summary.totalTokens || 0).toLocaleString()} tokens
              </div>
            </div>

            {/* Avg Response Time */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Avg Response Time</div>
              <div className="text-3xl font-bold text-white">
                {((usage.summary.avgResponseTime || 0) / 1000).toFixed(2)}s
              </div>
              <div className="text-xs text-gray-400 mt-1">
                per request
              </div>
            </div>

            {/* Cache Hit Rate */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Cache Hit Rate</div>
              <div className="text-3xl font-bold text-white">
                {usage.summary.totalCalls > 0 
                  ? ((usage.summary.cachedCalls / usage.summary.totalCalls) * 100).toFixed(1)
                  : 0}%
              </div>
              <div className="text-xs text-green-400 mt-1">
                Cost savings
              </div>
            </div>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="flex gap-2 mb-4">
          {[7, 14, 30, 60].map(days => (
            <button
              key={days}
              onClick={() => setTimeRange(days)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                timeRange === days
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {days} Days
            </button>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          
          {/* Daily Usage Chart */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">
              📊 Daily Usage Trend
            </h2>
            <div style={{ height: '300px' }}>
              <Line data={dailyChartData} options={dailyChartOptions} />
            </div>
          </div>

          {/* Operation Breakdown Chart */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">
              🎯 Cost by Operation
            </h2>
            <div style={{ height: '300px' }}>
              <Doughnut data={operationChartData} options={operationChartOptions} />
            </div>
          </div>
        </div>

        {/* Operation Details Table */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">
            📋 Operation Details
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="pb-3 text-gray-400 font-semibold">Operation</th>
                  <th className="pb-3 text-gray-400 font-semibold text-right">Calls</th>
                  <th className="pb-3 text-gray-400 font-semibold text-right">Tokens</th>
                  <th className="pb-3 text-gray-400 font-semibold text-right">Cost</th>
                  <th className="pb-3 text-gray-400 font-semibold text-right">Avg Time</th>
                </tr>
              </thead>
              <tbody>
                {operationBreakdown.map((op, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50">
                    <td className="py-3 text-white">
                      {op._id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </td>
                    <td className="py-3 text-gray-300 text-right">{op.calls}</td>
                    <td className="py-3 text-gray-300 text-right">
                      {op.tokens.toLocaleString()}
                    </td>
                    <td className="py-3 text-blue-400 text-right font-semibold">
                      ${op.cost.toFixed(4)}
                    </td>
                    <td className="py-3 text-gray-300 text-right">
                      {(op.avgResponseTime / 1000).toFixed(2)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-8 bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
          <h3 className="text-lg font-bold text-blue-400 mb-3">
            💡 Tips to Reduce AI Costs
          </h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>✓ Use caching when possible - it's free!</li>
            <li>✓ Upgrade to Pro for higher daily budget ($2/day vs $0.25/day)</li>
            <li>✓ The system automatically uses cheaper models when approaching budget limits</li>
            <li>✓ Debate analysis uses smart model selection based on your tier</li>
          </ul>
        </div>

      </div>
    </div>
  );
};

export default AIUsageDashboard;