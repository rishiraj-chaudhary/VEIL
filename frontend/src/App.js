import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './components/auth/login';
import Register from './components/auth/Register';
import ProtectedRoute from './components/common/ProtectedRoute';
import SlickFeed from './components/slick/SlickFeed.js';
import Communities from './pages/Communities';
import CreatePost from './pages/CreatePost';
import Feed from './pages/Feed';
import Home from './pages/Home';
import PostDetail from './pages/PostDetail';
function App() {
  return (
    <BrowserRouter>
      <Routes>
      <Route
  path="/post/:id"
  element={
    <ProtectedRoute>
      <PostDetail />
    </ProtectedRoute>
  }
/>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route path="/slicks" element={
  <ProtectedRoute>
    <SlickFeed />
  </ProtectedRoute>
} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;