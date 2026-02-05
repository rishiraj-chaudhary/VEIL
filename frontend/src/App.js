import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './components/auth/login';
import Register from './components/auth/Register';
import ProtectedRoute from './components/common/ProtectedRoute';
import SlickFeed from './components/slick/SlickFeed.js';
import CoachDashboard from './pages/CoachDashboard';
import Communities from './pages/Communities';
import CreatePost from './pages/CreatePost';
import Feed from './pages/Feed';
import Home from './pages/Home';
import KnowledgeGraphDashboard from './pages/KnowledgeGraphDashboard';
import PostDetail from './pages/PostDetail';

// 🎯 NEW: Import Debate Pages
import CreateDebate from './pages/CreateDebate';
import DebateRoom from './pages/DebateRoom';
import Debates from './pages/Debates';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/knowledge-graph" element={<KnowledgeGraphDashboard />} />
        <Route path="/coach" element={<CoachDashboard />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/feed"
          element={
            <ProtectedRoute>
              <Feed />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/communities"
          element={
            <ProtectedRoute>
              <Communities />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/create-post"
          element={
            <ProtectedRoute>
              <CreatePost />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/post/:id"
          element={
            <ProtectedRoute>
              <PostDetail />
            </ProtectedRoute>
          }
        />
        
        <Route 
          path="/slicks" 
          element={
            <ProtectedRoute>
              <SlickFeed />
            </ProtectedRoute>
          } 
        />

        {/* 🎯 NEW: DEBATE ROUTES */}
        <Route 
          path="/debates" 
          element={
            <ProtectedRoute>
              <Debates />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/debates/create" 
          element={
            <ProtectedRoute>
              <CreateDebate />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/debates/:id" 
          element={
            <ProtectedRoute>
              <DebateRoom />
            </ProtectedRoute>
          } 
        />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;