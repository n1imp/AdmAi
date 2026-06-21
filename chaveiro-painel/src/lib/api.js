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

// Limpa a sessão de forma centralizada: remove o token e avisa o AuthProvider
// (via evento) para que o estado React não fique "autenticado" após o 401.
export function limparSessao() {
  localStorage.removeItem('chaveiro_token');
  // O AuthProvider escuta este evento para zerar o estado do usuário.
  window.dispatchEvent(new Event('chaveiro:logout'));
}

// Redireciona para login em caso de 401; força a troca de senha em caso de PIN inicial.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { status, data } = error.response ?? {};
    if (status === 401) {
      limparSessao();
      window.location.href = '/login';
    } else if (status === 403 && data?.codigo === 'senha_provisoria') {
      // Sessão é válida — só falta definir a senha definitiva. NÃO limpa o token.
      if (!window.location.pathname.startsWith('/trocar-senha')) {
        window.location.href = '/trocar-senha';
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
