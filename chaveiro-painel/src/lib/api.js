import axios from 'axios';
import { featureAtiva } from './featureFlags.js';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Cliente Axios com token de autenticação injetado automaticamente
const api = axios.create({
  // Web: '/api' (mesma origem, proxy do nginx). App Capacitor: VITE_API_URL absoluto
  baseURL: BASE_URL,
  timeout: 30000,
  /* [REVISOR 01a038fc achado 2 · STG-APP-STAGING-REV1] O cookie httpOnly de refresh nasce
     no Set-Cookie do LOGIN/2FA — sem withCredentials o browser DESCARTA esse Set-Cookie
     quando a API está em outra origem (staging: pages.dev → railway.app) e o refresh morre
     ao expirar o bearer. Em produção (same-site) e no dev (proxy same-origin) é inócuo; o
     backend só emite Allow-Credentials com ALLOWED_ORIGIN explícita, nunca com '*'. */
  withCredentials: true,
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
  // Server state NUNCA sobrevive à troca de identidade (DDR-4): nada de dados de uma
  // conta/empresa aparecendo na próxima. Import dinâmico evita ciclo api↔queryClient.
  import('./queryClient.js')
    .then(({ limparCacheServidor }) => limparCacheServidor())
    .catch(() => {});
  // O AuthProvider escuta este evento para zerar o estado do usuário.
  window.dispatchEvent(new Event('admai:logout'));
}

// Deduplicação: se múltiplos requests expirarem ao mesmo tempo, só uma chamada de refresh é feita.
let _refreshPromise = null;

async function tentarRefresh() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = axios
    .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
    .then((r) => {
      localStorage.setItem('admai_token', r.data.token);
      return r.data.token;
    })
    .finally(() => {
      _refreshPromise = null;
    });
  return _refreshPromise;
}

// Interceptor: em caso de 401 tenta renovar o token via refresh cookie (HttpOnly)
// antes de deslogar o usuário. Força troca de senha e verificação de e-mail em 403.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { status, data } = error.response ?? {};
    const originalConfig = error.config;

    /* 401 vindo do PRÓPRIO /auth/* é credencial errada, não sessão vencida — tentar refresh
       aqui redirecionava a página no meio do submit e a mensagem de erro nunca renderizava
       (defeito achado pela jornada F5 de senha errada). */
    const ehRotaDeAuth = String(originalConfig?.url ?? '').startsWith('/auth/');
    if (status === 401 && !originalConfig._retry && !ehRotaDeAuth) {
      originalConfig._retry = true;
      try {
        const novoToken = await tentarRefresh();
        originalConfig.headers.Authorization = `Bearer ${novoToken}`;
        return api(originalConfig);
      } catch {
        limparSessao();
        window.location.href = '/login';
      }
    } else if (status === 402) {
      /* Assinatura morta: TODA página de produto ficava em branco (jornada F5 mediu a tela).
         O destino certo existe desde SL-10: /assinatura mostra o motivo e a ação. /billing é
         allowlisted no backend e a própria página de assinatura consome /billing — sem loop.
         [D2 Refoundation] Com SUBSCRIPTIONS_BILLING desligada (MVP sem paywall), a rota
         /assinatura não existe: o 402 — que o backend em free mode não emite — cai na
         rejeição comum e o chamador trata como erro, em vez de navegar para lugar nenhum. */
      if (
        featureAtiva('SUBSCRIPTIONS_BILLING') &&
        !window.location.pathname.startsWith('/assinatura')
      ) {
        window.location.href = '/assinatura';
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
