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
    
    if (!navigator.onLine && !config.headers['X-Queued-Request']) {
      console.log('[API] Offline mode - request will be queued');
    }
    
    return attachLocationContext(config);
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        error.message = 'Request timed out. Please check your connection.';
      } else if (!navigator.onLine) {
        error.message = 'You are offline. Request will be synced when back online.';
      } else {
        error.message = 'Network error. Please check your connection.';
      }
    }
    
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;

export const apiGet = (url, params = {}) => api.get(url, { params });
export const apiPost = (url, data = {}) => api.post(url, data);
export const apiPut = (url, data = {}) => api.put(url, data);
export const apiPatch = (url, data = {}) => api.patch(url, data);
export const apiDelete = (url) => api.delete(url);
