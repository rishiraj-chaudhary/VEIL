import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import DebateCard from '../components/debate/DebateCard';
import useDebateStore from '../store/debateStore';

const Debates = () => {
  const { debates, fetchDebates, loading } = useDebateStore();

  useEffect(() => {
    fetchDebates();
  }, [fetchDebates]);

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Debates</h1>
            <p className="text-gray-400">Structured discourse & reasoning</p>
          </div>
          
          <Link 
            to="/debates/create"
            className="px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg transition-colors font-semibold"
          >
            + Start Debate
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-veil-purple"></div>
          </div>
        ) : debates.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
            <p className="text-gray-400 text-lg mb-4">No debates yet</p>
            <Link 
              to="/debates/create"
              className="inline-block px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg"
            >
              Start the First Debate
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {debates.map(debate => (
              <DebateCard key={debate._id} debate={debate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Debates;