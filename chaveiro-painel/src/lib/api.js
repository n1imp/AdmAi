import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Cliente Axios com token de autenticação injetado automaticamente
const api = axios.create({
  // Web: '/api' (mesma origem, proxy do nginx). App Capacitor: VITE_API_URL absoluto
  baseURL: BASE_URL,
  timeout: 30000,
});

// Injeta o Bearer Token em toda requisição
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admai_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Limpa a sessão de forma centralizada: remove o token e avisa o AuthProvider
// (via evento) para que o estado React não fique "autenticado" após o 401.
export function limparSessao() {
  localStorage.removeItem('admai_token');
  // O AuthProvider escuta este evento para zerar o estado do usuário.
  window.dispatchEvent(new Event('admai:logout'));
}

// Deduplicação: se múltiplos requests expirarem ao mesmo tempo, só uma chamada de refresh é feita.
let _refreshPromise = null;

async function tentarRefresh() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = axios
    .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
    .then((r) => { localStorage.setItem('admai_token', r.data.token); return r.data.token; })
    .finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

// Interceptor: em caso de 401 tenta renovar o token via refresh cookie (HttpOnly)
// antes de deslogar o usuário. Força troca de senha e verificação de e-mail em 403.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { status, data } = error.response ?? {};
    const originalConfig = error.config;

    if (status === 401 && !originalConfig._retry) {
      originalConfig._retry = true;
      try {
        const novoToken = await tentarRefresh();
        originalConfig.headers.Authorization = `Bearer ${novoToken}`;
        return api(originalConfig);
      } catch {
        limparSessao();
        window.location.href = '/login';
      }
    } else if (status === 403 && data?.codigo === 'senha_provisoria') {
      if (!window.location.pathname.startsWith('/trocar-senha')) {
        window.location.href = '/trocar-senha';
      }
    } else if (status === 403 && data?.codigo === 'email_nao_verificado') {
      if (!window.location.pathname.startsWith('/verificar-email')) {
        window.location.href = '/verificar-email';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ── AUTENTICAÇÃO ─────────────────────────────────────────────────────────────

/**
 * Auto-cadastro público (cria empresa + dono). `payload` inclui telefone, que é
 * obrigatório (identidade no robô de número único, verificada por OTP via WhatsApp).
 * @returns {Promise<object>} dados da sessão ({ token, telefoneVerificado, ... }).
 */
export async function register(payload) {
  const { data } = await api.post('/auth/register', payload);
  return data;
}

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
