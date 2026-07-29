import { create } from 'zustand';
import api from '../services/api';
import authService from '../services/authService';

const useAuthStore = create((set) => ({
  user: authService.getCurrentUser(),
  isAuthenticated: authService.isAuthenticated(),
  loading: false,
  error: null,

  // Register
  register: async (username, email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await authService.register(username, email, password);
      set({
        user: data.data.user,
        isAuthenticated: true,
        loading: false,
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Registration failed';
      set({ loading: false, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  // Login
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await authService.login(email, password);
      set({
        user: data.data.user,
        isAuthenticated: true,
        loading: false,
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Login failed';
      set({ loading: false, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  // Logout
  logout: async () => {
    await authService.logout();
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  // Refresh user data
  refreshUser: async () => {
    try {
      const response = await api.get('/auth/me');


      if (response.data.success) {
        const updatedUser = response.data.data.user;
        localStorage.setItem('veil_user', JSON.stringify(updatedUser));
        set({ user: updatedUser });
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));

export default useAuthStore;