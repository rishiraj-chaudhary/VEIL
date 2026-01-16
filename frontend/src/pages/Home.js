import { Link } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import useAuthStore from '../store/authStore';

const Home = () => {
  const { user } = useAuthStore();

  return (
    <div className="min-h-screen bg-veil-dark">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Welcome to VEIL
          </h2>
          <p className="text-xl text-gray-400 mb-8">
            Unveiling Truth Through Discourse
          </p>
          
          {/* Quick Links */}
          <div className="flex justify-center gap-4 mb-12">
            <Link 
              to="/feed"
              className="px-6 py-3 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg transition-colors font-semibold"
            >
              View Feed
            </Link>
            <Link 
              to="/communities"
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-semibold"
            >
              Browse Communities
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
              <div className="text-4xl mb-3">🔮</div>
              <h3 className="text-xl font-semibold text-white mb-2">ORACLE</h3>
              <p className="text-gray-400">AI Assistant Ready</p>
            </div>
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
              <div className="text-4xl mb-3">🌑</div>
              <h3 className="text-xl font-semibold text-white mb-2">SHADOW</h3>
              <p className="text-gray-400">Devil's Advocate Standby</p>
            </div>
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
              <div className="text-4xl mb-3">✨</div>
              <h3 className="text-xl font-semibold text-white mb-2">REVEAL</h3>
              <p className="text-gray-400">Truth Unveiled</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;