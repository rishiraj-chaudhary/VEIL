import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './components/auth/login';
import Register from './components/auth/Register';
import ErrorBoundary from './components/common/ErrorBoundary';
import ProtectedRoute from './components/common/ProtectedRoute';
import DailyDrill from './pages/DailyDrill';
import Welcome from './pages/Welcome';
import PublicDebate from './pages/PublicDebate';
import SlickFeed from './components/slick/SlickFeed.js';
import AIUsageDashboard from './pages/AIUsageDashboard';
import CoachDashboard from './pages/CoachDashboard';
import Communities from './pages/Communities';
import CommunityPage from './pages/CommunityPage';
import CreateDebate from './pages/CreateDebate';
import CreatePost from './pages/CreatePost';
import DebateRoom from './pages/DebateRoom';
import Debates from './pages/Debates';
import Feed from './pages/Feed';
import Home from './pages/Home';
import HuddleRoom from './pages/HuddleRoom';
import HuddlesPage from './pages/HuddlesPage';
import KnowledgeGraphDashboard from './pages/KnowledgeGraphDashboard';
import Leaderboard from './pages/Leaderboard';
import PersonaDriftDashboard from './pages/PersonaDriftDashboard';
import ReputationPage from './pages/ReputationPage';
import PostDetail from './pages/PostDetail';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        {/* Public replay — deliberately outside ProtectedRoute so a finished
            debate can be read by someone who has no account. */}
        <Route path="/d/:id"           element={<PublicDebate />} />
        <Route path="/knowledge-graph" element={<KnowledgeGraphDashboard />} />
        <Route path="/coach"           element={<CoachDashboard />} />
        <Route path="/leaderboard"     element={<Leaderboard />} />
        <Route path="/ai-usage"        element={<AIUsageDashboard />} />
        <Route path="/persona"         element={<ProtectedRoute><PersonaDriftDashboard /></ProtectedRoute>} />
        <Route path="/welcome"         element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
        <Route path="/drill"           element={<ProtectedRoute><DailyDrill /></ProtectedRoute>} />
        <Route path="/reputation"      element={<ProtectedRoute><ReputationPage /></ProtectedRoute>} />
        <Route path="/reputation/:userId" element={<ProtectedRoute><ReputationPage /></ProtectedRoute>} />
        <Route path="/"                element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/feed"            element={<ProtectedRoute><Feed /></ProtectedRoute>} />
        <Route path="/communities"     element={<ProtectedRoute><Communities /></ProtectedRoute>} />
        <Route path="/c/:name"         element={<ProtectedRoute><CommunityPage /></ProtectedRoute>} />
        <Route path="/create-post"     element={<ProtectedRoute><CreatePost /></ProtectedRoute>} />
        <Route path="/post/:id"        element={<ProtectedRoute><PostDetail /></ProtectedRoute>} />
        <Route path="/slicks"          element={<ProtectedRoute><SlickFeed /></ProtectedRoute>} />
        <Route path="/debates"         element={<ProtectedRoute><Debates /></ProtectedRoute>} />
        <Route path="/debates/create"  element={<ProtectedRoute><CreateDebate /></ProtectedRoute>} />
        <Route path="/debates/:id"     element={<ProtectedRoute><DebateRoom /></ProtectedRoute>} />
        <Route path="/huddles"         element={<ProtectedRoute><HuddlesPage /></ProtectedRoute>} />
        <Route path="/huddle/:id"      element={<ProtectedRoute><HuddleRoom /></ProtectedRoute>} />
        <Route path="*"                element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;