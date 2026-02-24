import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const REQUEST_TIMEOUT = 15000;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: REQUEST_TIMEOUT,
});

function resolveAdaptiveTimeout(config) {
  if (config.timeout) return config.timeout;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = connection?.effectiveType || 'unknown';
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 30000;
  if (effectiveType === '3g') return 20000;
  return REQUEST_TIMEOUT;
}

function toUserMessage(error) {
  const requestId = error?.response?.data?.requestId;
  const code = error?.response?.data?.code;
  const serverMessage = error?.response?.data?.error;

  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      return 'Request timed out. The connection is slow. Please retry.';
    }
    if (!navigator.onLine) {
      return 'You are offline. Your action can be queued and synced when online.';
    }
    return 'Network error. Please check connectivity and try again.';
  }

  if (error.response.status === 404) {
    return 'The requested resource was not found.';
  }

  if (error.response.status === 429) {
    return 'Too many requests. Please wait and retry.';
  }

  if (error.response.status >= 500) {
    return `Server error. Please retry in a moment${requestId ? ` (Ref: ${requestId})` : ''}.`;
  }

  if (serverMessage) {
    return `${serverMessage}${code ? ` (${code})` : ''}${requestId ? ` [${requestId}]` : ''}`;
  }

  return error.message || 'Something went wrong.';
}

const attachLocationContext = (config) => {
  const selectedLocationId = localStorage.getItem('selectedLocationId');
  if (!selectedLocationId) return config;

  config.headers['X-Location-Id'] = selectedLocationId;

  if ((config.method || 'get').toLowerCase() === 'get') {
    config.params = { ...(config.params || {}), location_id: selectedLocationId };
  }

  return config;
};

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    config.timeout = resolveAdaptiveTimeout(config);

    return attachLocationContext(config);
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    error.userMessage = toUserMessage(error);

    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const isAuthEndpoint = error.config?.url?.includes('/auth/') || error.config?.url?.includes('/login');
      
      if (!currentPath.includes('/login') && !isAuthEndpoint) {
        const token = localStorage.getItem('token');
        if (token) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login?reason=session_expired';
        }
      }
    }

    return Promise.reject(error);
  }
);

export function getErrorMessage(error, fallback = 'Something went wrong.') {
  return error?.userMessage || error?.response?.data?.error || error?.message || fallback;
}

export default api;

export const apiGet = (url, params = {}) => api.get(url, { params });
export const apiPost = (url, data = {}) => api.post(url, data);
export const apiPut = (url, data = {}) => api.put(url, data);
export const apiPatch = (url, data = {}) => api.patch(url, data);
export const apiDelete = (url) => api.delete(url);
