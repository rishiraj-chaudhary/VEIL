import axios from 'axios';

const api = axios.create({
  baseURL: `${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  let token = localStorage.getItem('token') || localStorage.getItem('veil_token');
  if (token) {
    token = token.replace('veil_token', '');
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
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