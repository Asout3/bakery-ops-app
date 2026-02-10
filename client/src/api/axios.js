import axios from 'axios';

// Use environment variable for production or fallback to /api for development proxy
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
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

// Request interceptor to add token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return attachLocationContext(config);
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
