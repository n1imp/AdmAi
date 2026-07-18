import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../lib/api.js';

/**
 * Login social (Google / Microsoft / Apple) — fileira de 3 logos só-ícone.
 *
 * Os SDKs são carregados sob demanda via <script> (sem dependências npm). O fluxo
 * é ID-token: o SDK devolve um ID token (JWT) que enviamos a POST /auth/oauth/:provedor;
 * o backend verifica e devolve a MESMA sessão do login normal (token ou desafio 2FA).
 *
 * Comportamento por provedor:
 *  - Google: funcional quando VITE_GOOGLE_CLIENT_ID está definido (botão oficial GIS,
 *    renderizado como ícone). Blindado: se o GIS não inicializar, cai num ícone de
 *    fallback em vez de spinner eterno.
 *  - Microsoft / Apple: o logo SEMPRE aparece. Sem o respectivo VITE_*_CLIENT_ID, o
 *    clique mostra um aviso "em breve" (via onInfo); com o ID configurado, dispara o
 *    fluxo real (MSAL / AppleID).
 *
 * Props:
 *  - onResultado(data): resposta da API ({ token, ... } ou { twoFactorRequerido, desafio }).
 *  - onErro(msg): mensagem de erro (vermelha).
 *  - onInfo(msg): mensagem informativa (ex.: "em breve"); cai em onErro se ausente.
 *  - desabilitado: desativa os botões enquanto outro fluxo carrega.
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const MS_CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
const MS_TENANT = import.meta.env.VITE_MICROSOFT_TENANT || 'common';
const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID;
const APPLE_REDIRECT = import.meta.env.VITE_APPLE_REDIRECT_URI;

const URL_GSI = 'https://accounts.google.com/gsi/client';
const URL_MSAL = 'https://alcdn.msauth.net/browser/3.10.0/js/msal-browser.min.js';
const URL_APPLE =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

// Mantido por compatibilidade: agora sempre mostramos os 3 logos.
export const algumProvedorSocial = true;

// Carrega um <script> externo uma única vez; resolve quando pronto.
const cacheScripts = new Map();
function carregarScript(src) {
  if (cacheScripts.has(src)) return cacheScripts.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
  cacheScripts.set(src, p);
  return p;
}

// Nonce anti-replay (defesa em profundidade) — enviado ao provedor e ao backend.
function gerarNonce() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function BotoesSociais({ onResultado, onErro, onInfo, desabilitado }) {
  const nonceRef = useRef(gerarNonce());
  const googleBtnRef = useRef(null);
  const msalRef = useRef(null);
  const [ocupado, setOcupado] = useState(null); // 'google' | 'microsoft' | 'apple' | null
  const [googlePronto, setGooglePronto] = useState(false); // GIS renderizou o botão
  const [googleErro, setGoogleErro] = useState(false); // GIS falhou → fallback de ícone

  const avisar = useCallback(
    (msg) => {
      (onInfo ?? onErro)?.(msg);
    },
    [onInfo, onErro]
  );

  // Envia o ID token ao backend e repassa o resultado ao Login.
  const enviar = useCallback(
    async (provedor, idToken, nonce) => {
      if (!idToken) {
        onErro?.('Login social cancelado.');
        return;
      }
      setOcupado(provedor);
      onErro?.('');
      try {
        const { data } = await api.post(`/auth/oauth/${provedor}`, { idToken, nonce });
        onResultado?.(data);
      } catch (err) {
        onErro?.(
          err.response?.data?.erro ?? 'Não foi possível entrar com o provedor. Tente novamente.'
        );
      } finally {
        setOcupado(null);
      }
    },
    [onResultado, onErro]
  );

  // ── Google: botão oficial GIS (id_token), renderizado como ícone ──────────────
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current) return;
    let cancelado = false;
    // Blindagem anti-trava: se o GIS não inicializar em alguns segundos, mostra o
    // fallback de ícone em vez de deixar a célula "carregando" para sempre.
    const timeout = setTimeout(() => {
      if (!cancelado) setGoogleErro(true);
    }, 8000);
    carregarScript(URL_GSI)
      .then(() => {
        if (cancelado || !window.google?.accounts?.id || !googleBtnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: nonceRef.current,
          ux_mode: 'popup',
          auto_select: false,
          use_fedcm_for_prompt: true, // usa o seletor de contas nativo (FedCM) — mais robusto
          callback: (resp) => enviar('google', resp?.credential, nonceRef.current),
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'icon',
          shape: 'square',
          theme: 'filled_black',
          size: 'large',
        });
        clearTimeout(timeout);
        setGoogleErro(false);
        setGooglePronto(true);
      })
      .catch(() => {
        if (!cancelado) setGoogleErro(true);
      });
    return () => {
      cancelado = true;
      clearTimeout(timeout);
    };
  }, [enviar]);

  // ── Microsoft (MSAL popup) ──────────────────────────────────────────────────
  const entrarMicrosoft = useCallback(async () => {
    if (!MS_CLIENT_ID) {
      avisar('Login com Microsoft chega em breve.');
      return;
    }
    setOcupado('microsoft');
    onErro?.('');
    try {
      await carregarScript(URL_MSAL);
      if (!msalRef.current) {
        msalRef.current = new window.msal.PublicClientApplication({
          auth: {
            clientId: MS_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${MS_TENANT}`,
          },
          cache: { cacheLocation: 'sessionStorage' },
        });
        await msalRef.current.initialize();
      }
      const resp = await msalRef.current.loginPopup({
        scopes: ['openid', 'profile', 'email'],
        prompt: 'select_account',
      });
      // MSAL valida o nonce internamente; não reenviamos nonce ao backend aqui.
      await enviar('microsoft', resp?.idToken);
    } catch (err) {
      if (err?.errorCode === 'user_cancelled') {
        setOcupado(null);
        return;
      }
      onErro?.('Não foi possível entrar com a Microsoft. Tente novamente.');
      setOcupado(null);
    }
  }, [avisar, enviar, onErro]);

  // ── Apple (AppleID JS popup) ────────────────────────────────────────────────
  const entrarApple = useCallback(async () => {
    if (!APPLE_CLIENT_ID) {
      avisar('Login com Apple estará disponível na versão publicada.');
      return;
    }
    setOcupado('apple');
    onErro?.('');
    try {
      await carregarScript(URL_APPLE);
      window.AppleID.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: 'name email',
        redirectURI: APPLE_REDIRECT,
        usePopup: true,
        nonce: nonceRef.current,
      });
      const resp = await window.AppleID.auth.signIn();
      await enviar('apple', resp?.authorization?.id_token, nonceRef.current);
    } catch (err) {
      // popup_closed_by_user / user_cancelled_authorize → silencioso
      const code = err?.error;
      if (code === 'popup_closed_by_user' || code === 'user_cancelled_authorize') {
        setOcupado(null);
        return;
      }
      onErro?.('Não foi possível entrar com a Apple. Tente novamente.');
      setOcupado(null);
    }
  }, [avisar, enviar, onErro]);

  const travado = desabilitado || ocupado != null;
  const mostrarWidgetGoogle = Boolean(GOOGLE_CLIENT_ID) && !googleErro;

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="h-px flex-1 bg-dark-600" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted font-display">
          ou continue com
        </span>
        <span className="h-px flex-1 bg-dark-600" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Google — widget oficial GIS (ícone) com fallback */}
        {mostrarWidgetGoogle ? (
          <div
            className={`btn-social overflow-hidden ${travado ? 'opacity-50 pointer-events-none' : ''} ${!googlePronto ? 'animate-pulse' : ''}`}
            title="Entrar com Google"
          >
            <div ref={googleBtnRef} className="flex items-center justify-center [&>div]:!w-auto" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              onErro?.('Não foi possível carregar o login do Google. Recarregue a página.')
            }
            disabled={travado}
            className="btn-social"
            title="Entrar com Google"
            aria-label="Entrar com Google"
          >
            <IconeGoogle />
          </button>
        )}

        {/* Microsoft */}
        <button
          type="button"
          onClick={entrarMicrosoft}
          disabled={travado}
          className={`btn-social ${!MS_CLIENT_ID ? 'opacity-70' : ''}`}
          title={MS_CLIENT_ID ? 'Entrar com Microsoft' : 'Microsoft — em breve'}
          aria-label="Entrar com Microsoft"
        >
          {ocupado === 'microsoft' ? (
            <Loader2 size={20} className="animate-spin text-muted" />
          ) : (
            <IconeMicrosoft />
          )}
        </button>

        {/* Apple */}
        <button
          type="button"
          onClick={entrarApple}
          disabled={travado}
          className={`btn-social ${!APPLE_CLIENT_ID ? 'opacity-70' : ''}`}
          title={APPLE_CLIENT_ID ? 'Entrar com Apple' : 'Apple — em breve'}
          aria-label="Entrar com Apple"
        >
          {ocupado === 'apple' ? (
            <Loader2 size={20} className="animate-spin text-muted" />
          ) : (
            <IconeApple />
          )}
        </button>
      </div>
    </div>
  );
}

function IconeGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function IconeMicrosoft() {
  return (
    <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}

function IconeApple() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.04c-.03-2.74 2.24-4.06 2.34-4.12-1.28-1.87-3.27-2.13-3.98-2.16-1.7-.17-3.31 1-4.17 1-.85 0-2.18-.98-3.59-.95-1.85.03-3.55 1.07-4.5 2.72-1.92 3.33-.49 8.26 1.38 10.96.91 1.32 2 2.8 3.42 2.75 1.37-.06 1.89-.89 3.55-.89 1.65 0 2.12.89 3.57.86 1.47-.03 2.41-1.35 3.31-2.68 1.04-1.53 1.47-3.01 1.49-3.09-.03-.01-2.86-1.1-2.89-4.36zM14.27 4.5c.76-.92 1.27-2.2 1.13-3.47-1.09.04-2.41.73-3.19 1.65-.7.81-1.31 2.11-1.15 3.35 1.21.09 2.45-.62 3.21-1.53z" />
    </svg>
  );
}
