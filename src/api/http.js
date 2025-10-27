import axios from 'axios';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:5000',
});

function getApiKey() {
  return localStorage.getItem('beta_api_key') || '';
}

http.interceptors.request.use(cfg => {
  const key = getApiKey();
  if (key) cfg.headers['X-API-Key'] = key;
  return cfg;
});

http.interceptors.response.use(
  r => r,
  err => {
    if (err?.response?.status === 401) {
      // 키가 없거나 틀렸음 → 키 게이트로 돌려보내기
      window.dispatchEvent(new Event('beta-key-invalid'));
    }
    return Promise.reject(err);
  }
);

export default http;
