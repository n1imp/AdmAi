import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { iniciarMonitoramento } from './lib/monitoring.js';
import { sincronizarCrisp } from './lib/crispBootstrap.js';
import './index.css';
import './styles/panel.css';
import './styles/panel-primitives.css';
import './styles/panel-overlay.css';
import './styles/panel-rollout.css';

// Observabilidade (Sentry) — no-op se VITE_SENTRY_DSN não estiver definido.
iniciarMonitoramento();

// Widget de suporte Crisp — ATRÁS do consentimento (Política de Cookies §2/§4). No boot,
// só entra se o usuário já consentiu; a escolha no CookieBanner sincroniza sem recarga.
sincronizarCrisp();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

// PWA: registra o service worker apenas em produção (em dev evitamos cache).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
