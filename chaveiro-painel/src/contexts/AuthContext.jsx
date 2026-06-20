import { createContext, useContext, useState, useEffect } from 'react';

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

function carregarUserInicial() {
  const token = localStorage.getItem('chaveiro_token');
  if (!token) return null;
  const payload = decodeJWT(token);
  if (!payload) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    localStorage.removeItem('chaveiro_token');
    return null;
  }
  return { id: payload.id, nome: payload.nome, admin: payload.admin, empresaId: payload.empresaId };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(carregarUserInicial);

  function login(token) {
    localStorage.setItem('chaveiro_token', token);
    const payload = decodeJWT(token);
    if (payload) setUser({ id: payload.id, nome: payload.nome, admin: payload.admin, empresaId: payload.empresaId });
  }

  function logout() {
    localStorage.removeItem('chaveiro_token');
    setUser(null);
  }

  // Sincroniza o estado React quando a sessão é limpa fora do contexto
  // (ex.: interceptor de 401 em api.js dispara 'chaveiro:logout').
  // Também derruba a sessão na montagem se o token já estiver expirado.
  useEffect(() => {
    if (tokenExpirado()) {
      logout();
    }
    const aoSair = () => setUser(null);
    window.addEventListener('chaveiro:logout', aoSair);
    return () => window.removeEventListener('chaveiro:logout', aoSair);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin: user?.admin ?? false, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
