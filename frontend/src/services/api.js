import axios from 'axios';

const BASE_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api`;

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // The refresh token lives in an httpOnly cookie, which is only sent if
  // credentials are included on cross-origin requests.
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('veil_token') || localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, (error) => Promise.reject(error));

const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('veil_token');
  localStorage.removeItem('veil_user');
};

/**
 * A single in-flight refresh shared by every request that got a 401.
 *
 * Without this, a page that fires several requests at once would attempt as many
 * refreshes — and since each rotation invalidates the previous token, the
 * later ones would look like token reuse and revoke the whole session.
 */
let refreshPromise = null;

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const token = res.data?.data?.accessToken || res.data?.data?.token;
        if (!token) throw new Error('No access token returned');

        localStorage.setItem('veil_token', token);
        if (res.data?.data?.user) {
          localStorage.setItem('veil_user', JSON.stringify(res.data.data.user));
        }
        return token;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!error.response) {
      return Promise.reject(new Error('Network error - please check your connection'));
    }

    const original = error.config;
    const isAuthCall = original?.url?.includes('/auth/refresh') || original?.url?.includes('/auth/login');

    // Retry once with a fresh access token. `_retried` stops an expired refresh
    // token from producing an infinite loop.
    if (error.response.status === 401 && !original?._retried && !isAuthCall) {
      original._retried = true;

      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        clearSession();
        if (window.location.pathname !== '/login') window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    if (error.response.status === 401 && !isAuthCall) {
      clearSession();
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }

    return Promise.reject(error);
  },
);

export default api;
