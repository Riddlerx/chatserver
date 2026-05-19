import axios from 'axios';

const api = axios.create({
  baseURL: 'https://eain.duckdns.org/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('chatToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
