import { useEffect, useState } from 'react';
import useSlickStore from '../../store/slickStore.js';

const CurrencyBadge = () => {
  const { currency, fetchCurrency } = useSlickStore();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchCurrency();
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors"
      >
        <span className="text-yellow-400">💰</span>
        <span className="text-white font-medium">{currency.balance || 0}</span>
        <span className="text-xs text-gray-400">VeilCoins</span>
      </button>

      {showDetails && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg p-4 z-50">
          <h3 className="text-white font-medium mb-3">VeilCoins Balance</h3>
          
          <div className="space-y-2 mb-4">
            <div className="flex justify-between">
              <span className="text-gray-400">Current Balance:</span>
              <span className="text-white">{currency.balance}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total Earned:</span>
              <span className="text-green-400">{currency.earnings?.totalEarned || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Daily Streak:</span>
              <span className="text-veil-purple">{currency.earnings?.dailyStreak || 0} days</span>
            </div>
          </div>

          {currency.recentTransactions?.length > 0 && (
            <div>
              <h4 className="text-gray-300 text-sm mb-2">Recent Activity</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {currency.recentTransactions.slice(0, 3).map((tx, index) => (
                  <div key={index} className="text-xs flex justify-between">
                    <span className="text-gray-400">{tx.reason}</span>
                    <span className={tx.type === 'earned' ? 'text-green-400' : 'text-red-400'}>
                      {tx.type === 'earned' ? '+' : '-'}{tx.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CurrencyBadge;