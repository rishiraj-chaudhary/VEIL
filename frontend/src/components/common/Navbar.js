import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

const Navbar = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left - Logo */}
          <div className="flex items-center space-x-6">
            <Link to="/" className="flex items-center">
              <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-veil-purple to-veil-accent">
                VEIL
              </h1>
            </Link>
            <Link 
  to="/feed" 
  className="text-gray-300 hover:text-white transition-colors"
>
  Feed
</Link>
            
            <Link 
              to="/communities" 
              className="text-gray-300 hover:text-white transition-colors"
            >
              Communities
            </Link>
            
            <Link 
              to="/create-post" 
              className="text-gray-300 hover:text-white transition-colors"
            >
              Create Post
            </Link>
          </div>

          {/* Right - User menu */}
          <div className="flex items-center space-x-4">
            <span className="text-gray-400">
              {user?.username}
            </span>
            <span className="text-veil-purple font-semibold">
              {user?.karma || 0} karma
            </span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;