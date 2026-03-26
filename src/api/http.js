import axios from 'axios';
import {
  apiBase,
  applySessionTokenFromHeaders,
  buildAuthHeaders,
  emitAuthInvalid,
} from './authState';

const http = axios.create({
  baseURL: apiBase() || '',
});

http.interceptors.request.use((config) => {
  config.headers = buildAuthHeaders(config.headers || {});
  return config;
});

http.interceptors.response.use(
  (response) => {
    applySessionTokenFromHeaders(response.headers);
    return response;
  },
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 409) {
      emitAuthInvalid({
        status,
        message: error?.response?.data?.error || error?.response?.data?.message || '',
      });
    }
    return Promise.reject(error);
  }
);

export default http;
