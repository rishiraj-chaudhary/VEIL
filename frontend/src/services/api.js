import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - handles token automatically
api.interceptors.request.use((config) => {
  // ✅ FIX: Handle both token formats
  let token = localStorage.getItem('token');
  
  // If token doesn't exist, try veil_token
  if (!token) {
    token = localStorage.getItem('veil_token');
  }
  
  // Remove 'veil_token' prefix if present
  if (token) {
    token = token.replace('veil_token', '');
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      console.error('Network error:', error.message);
      return Promise.reject(new Error('Network error - please check your connection'));
    }
    
    if (error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('veil_token');
      localStorage.removeItem('veil_user');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

export default api;