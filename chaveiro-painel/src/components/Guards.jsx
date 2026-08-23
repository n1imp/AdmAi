import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, tokenExpirado } from '../contexts/AuthContext.jsx';

/**
 * Guards de rota do painel.
 *
 * Regra de segurança: estes guards são apenas UX. A autorização real é imposta no
 * backend (`requireAuth`/`requirePermissao`) — um atacante pode simplesmente chamar a
 * API direto. Extraídos do App.jsx para poderem ser testados sem carregar todas as
 * páginas da aplicação (o comportamento é idêntico ao que estava inline).
 */

export function RequireAuth({ children }) {
  const { user, logout, senhaProvisoria } = useAuth();
  // Se o token já expirou, derruba a sessão (efeito) e manda pro login.
  const expirado = tokenExpirado();
  useEffect(() => {
    if (expirado && user) logout();
  }, [expirado, user, logout]);
  /* Deep-link diferido: quem cai aqui vindo de /aprovacoes deve VOLTAR a /aprovacoes depois
     do login — o destino viaja em state.from (jornada F5). */
  if (!user || expirado)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: window.location.pathname + window.location.search }}
      />
    );
  // Usuário com PIN provisório fica preso na troca de senha até definir uma definitiva.
  if (senhaProvisoria && window.location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />;
  }
  return children;
}

// Protege uma rota por permissão de módulo (RBAC). O dono passa direto; demais esperam
// as permissões carregarem (evita redirect prematuro durante o fetch de /me/permissoes).
export function RequirePermissao({ modulo, acao = 'ver', children }) {
  const { user, pode, permissoes } = useAuth();
  if (user?.papel !== 'dono' && permissoes === null) return null; // carregando
  if (!pode(modulo, acao)) return <Navigate to="/configuracao" replace />;
  return children;
}
