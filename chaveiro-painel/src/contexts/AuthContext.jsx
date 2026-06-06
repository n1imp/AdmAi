import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

function decodeJWT(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
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

  return (
    <AuthContext.Provider value={{ user, isAdmin: user?.admin ?? false, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
