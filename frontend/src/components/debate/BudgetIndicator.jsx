import React, { useEffect, useState } from 'react';
import aiUsageService from '../../services/aiUsageService';

const BudgetIndicator = ({ showDetails = false }) => {
  const [budgetStatus, setBudgetStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBudget();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadBudget, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadBudget = async () => {
    try {
      const response = await aiUsageService.checkBudget();
      setBudgetStatus(response.data);
    } catch (error) {
      console.error('Failed to load budget:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
        <div className="h-8 bg-gray-700 rounded w-1/2"></div>
      </div>
    );
  }

  if (!budgetStatus) {
    return null;
  }

  const { budget, tier } = budgetStatus;
  const percentUsed = budget.percentUsed || 0;
  const remaining = budget.remaining || 0;
  const exceeded = budget.exceeded || false;

  // Color logic
  const getStatusColor = () => {
    if (exceeded) return 'text-red-400';
    if (percentUsed >= 80) return 'text-orange-400';
    if (percentUsed >= 50) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getProgressColor = () => {
    if (exceeded) return 'bg-red-500';
    if (percentUsed >= 80) return 'bg-orange-500';
    if (percentUsed >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusMessage = () => {
    if (exceeded) return '⚠️ Budget Exceeded';
    if (percentUsed >= 80) return '⚠️ Budget Warning';
    if (percentUsed >= 50) return '⚡ Budget Moderate';
    return '✅ Budget OK';
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-gray-400 text-sm">Daily AI Budget</div>
          <div className={`text-xl font-bold ${getStatusColor()}`}>
            ${remaining.toFixed(2)} left
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 uppercase tracking-wider">
            {tier} tier
          </div>
          <div className="text-xs text-gray-400 mt-1">
            ${budget.budget.toFixed(2)}/day
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${getProgressColor()}`}
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          ></div>
        </div>
        <div className="flex justify-between items-center mt-1 text-xs">
          <span className={getStatusColor()}>
            {getStatusMessage()}
          </span>
          <span className="text-gray-400">
            {percentUsed.toFixed(1)}% used
          </span>
        </div>
      </div>

      {/* Details */}
      {showDetails && (
        <div className="space-y-2 pt-3 border-t border-gray-700">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Spent Today:</span>
            <span className="text-white font-semibold">
              ${budget.spent.toFixed(4)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Remaining:</span>
            <span className={`font-semibold ${getStatusColor()}`}>
              ${remaining.toFixed(4)}
            </span>
          </div>
        </div>
      )}

      {/* Warning Message */}
      {exceeded && (
        <div className="mt-3 bg-red-900/20 border border-red-500/30 rounded p-2 text-xs text-red-400">
          ⚠️ Daily budget exceeded. Using cheapest model until tomorrow.
        </div>
      )}

      {percentUsed >= 80 && !exceeded && (
        <div className="mt-3 bg-orange-900/20 border border-orange-500/30 rounded p-2 text-xs text-orange-400">
          ⚡ Approaching budget limit. Consider upgrading your tier.
        </div>
      )}
    </div>
  );
};

export default BudgetIndicator;