import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'https://eain.duckdns.org') + '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Required to send HttpOnly cookies
});

let csrfToken: string | null = null;

api.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase();
  if (csrfToken && method && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    config.headers.set('X-XSRF-TOKEN', csrfToken);
  }
  return config;
});

// Intercept 401/403 responses — attempt token refresh and retry
api.interceptors.response.use(
  (response) => {
    if (response.config.url?.includes('/csrf') && response.data?.token) {
      csrfToken = response.data.token;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh for auth errors, not for login/register/refresh requests
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/login') ||
                           originalRequest?.url?.includes('/auth/register') ||
                           originalRequest?.url?.includes('/auth/refresh');
    const isCsrfError = error.response?.status === 403 &&
                        error.response?.data?.error === 'CSRF token validation failed';

    if (
      (error.response?.status === 401 || error.response?.status === 403) &&
      !originalRequest._retry &&
      !isAuthEndpoint &&
      !isCsrfError
    ) {
      originalRequest._retry = true;

      try {
        // Just call the refresh endpoint — cookie sent automatically
        await api.post('/auth/refresh', {});

        // Retry the original request
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed — force logout (clean up local state, not token)
        localStorage.removeItem('user');
        window.location.reload();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
