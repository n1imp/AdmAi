import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api.js';

const AuthContext = createContext(null);

export function decodeJWT(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

// Verifica se o token salvo expirou (payload.exp em segundos).
export function tokenExpirado() {
  const token = localStorage.getItem('chaveiro_token');
  if (!token) return false; // sem token não há "expiração" a tratar aqui
  const payload = decodeJWT(token);
  return !payload || (payload.exp && payload.exp * 1000 < Date.now());
}

// Monta o objeto de usuário a partir do payload do JWT. `papel` e `senhaProvisoria`
// guiam o RBAC do painel e a tela de troca de senha forçada (PIN inicial).
function usuarioDoPayload(payload) {
  return {
    id: payload.id,
    nome: payload.nome,
    admin: payload.admin,
    papel: payload.papel ?? (payload.admin ? 'dono' : 'funcionario'),
    senhaProvisoria: Boolean(payload.senhaProvisoria),
    empresaId: payload.empresaId,
  };
}

function carregarUserInicial() {
  const token = localStorage.getItem('chaveiro_token');
  if (!token) return null;
  const payload = decodeJWT(token);
  if (!payload) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    localStorage.removeItem('chaveiro_token');
    return null;
  }
  return usuarioDoPayload(payload);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(carregarUserInicial);
  // Permissões EFETIVAS do usuário (preset do papel ⊕ overrides), buscadas do backend.
  // null = ainda não carregadas. Usadas só para UX (a checagem real é no servidor).
  const [permissoes, setPermissoes] = useState(null);

  function login(token) {
    localStorage.setItem('chaveiro_token', token);
    const payload = decodeJWT(token);
    if (payload) setUser(usuarioDoPayload(payload));
  }

  function logout() {
    localStorage.removeItem('chaveiro_token');
    setUser(null);
    setPermissoes(null);
  }

  // Sincroniza o estado React quando a sessão é limpa fora do contexto
  // (ex.: interceptor de 401 em api.js dispara 'chaveiro:logout').
  // Também derruba a sessão na montagem se o token já estiver expirado.
  useEffect(() => {
    if (tokenExpirado()) {
      logout();
    }
    const aoSair = () => { setUser(null); setPermissoes(null); };
    window.addEventListener('chaveiro:logout', aoSair);
    return () => window.removeEventListener('chaveiro:logout', aoSair);
  }, []);

  // Carrega as permissões efetivas quando há sessão (e não está em senha provisória,
  // caso em que o backend bloquearia a rota). Refaz ao trocar de usuário.
  useEffect(() => {
    if (!user || user.senhaProvisoria) { setPermissoes(null); return; }
    let vivo = true;
    api.get('/me/permissoes')
      .then(({ data }) => { if (vivo) setPermissoes(data.permissoes ?? {}); })
      .catch(() => { if (vivo) setPermissoes({}); });
    return () => { vivo = false; };
  }, [user?.id, user?.senhaProvisoria]);

  // pode(modulo, acao): o dono pode tudo; demais consultam as permissões efetivas.
  function pode(modulo, acao) {
    if (!user) return false;
    if (user.papel === 'dono' || user.admin) return true;
    return Boolean(permissoes?.[modulo]?.[acao]);
  }

  // podeProprio(capacidade): capacidades do painel simplificado (bater ponto etc.).
  function podeProprio(capacidade) {
    if (!user) return false;
    if (user.papel === 'dono' || user.admin) return true;
    return Boolean(permissoes?.proprio?.[capacidade]);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: user?.admin ?? false,
        papel: user?.papel ?? null,
        ehFuncionario: user?.papel === 'funcionario',
        senhaProvisoria: user?.senhaProvisoria ?? false,
        permissoes,
        pode,
        podeProprio,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
