import axios from 'axios';

// Cliente Axios com token de autenticação injetado automaticamente
const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// Injeta o Bearer Token em toda requisição
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('chaveiro_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redireciona para login em caso de 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('chaveiro_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// ── HELPERS DE FORMATAÇÃO ────────────────────────────────────────────────────

export function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor ?? 0);
}

export function formatarData(dataStr) {
  if (!dataStr) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(dataStr));
}

export function formatarDataCurta(dataStr) {
  if (!dataStr) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(dataStr));
}
