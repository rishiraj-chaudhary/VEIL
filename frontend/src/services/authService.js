import api from './api';

const authService = {
  // Register new user
  register: async (username, email, password) => {
    const response = await api.post('/auth/register', {
      username,
      email,
      password,
    });
    
    if (response.data.success) {
      // Store token and user
      localStorage.setItem('veil_token', response.data.data.token);
      localStorage.setItem('veil_user', JSON.stringify(response.data.data.user));
    }
    
    return response.data;
  },

  // Login user
  login: async (email, password) => {
    const response = await api.post('/auth/login', {
      email,
      password,
    });
    
    if (response.data.success) {
      // Store token and user
      localStorage.setItem('veil_token', response.data.data.token);
      localStorage.setItem('veil_user', JSON.stringify(response.data.data.user));
    }
    
    return response.data;
  },

  // Logout user
  logout: () => {
    localStorage.removeItem('veil_token');
    localStorage.removeItem('veil_user');
  },

  // Get current user from localStorage
  getCurrentUser: () => {
    const userStr = localStorage.getItem('veil_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  // Check if user is logged in
  isAuthenticated: () => {
    return !!localStorage.getItem('veil_token');
  },
};

export default authService;