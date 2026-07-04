import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';
import { AuthProvider, useAuth, tokenExpirado } from './contexts/AuthContext.jsx';
import BottomNav from './components/BottomNav.jsx';
import Sidebar from './components/Sidebar.jsx';
import { useOffline } from './hooks/useOffline.js';
import Login from './pages/Login.jsx';
import TrocarSenha from './pages/TrocarSenha.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Servicos from './pages/Servicos.jsx';
import NovoServico from './pages/NovoServico.jsx';
import Reparticao from './pages/Reparticao.jsx';
import Tecnicos from './pages/Tecnicos.jsx';
import NovoTecnico from './pages/NovoTecnico.jsx';
import PerfilTecnico from './pages/PerfilTecnico.jsx';
import Avaliacoes from './pages/Avaliacoes.jsx';
import MeuPonto from './pages/MeuPonto.jsx';
import MeuPainel from './pages/MeuPainel.jsx';
import MeusServicos from './pages/MeusServicos.jsx';
import NovoServicoFuncionario from './pages/NovoServicoFuncionario.jsx';
import Aprovacoes from './pages/Aprovacoes.jsx';
import Mais from './pages/Mais.jsx';
import Configuracao from './pages/Configuracao.jsx';
import Perfil from './pages/Perfil.jsx';
import Seguranca from './pages/Seguranca.jsx';
import Notificacoes from './pages/Notificacoes.jsx';
import ConfiguracaoBot from './pages/ConfiguracaoBot.jsx';
import Estoque from './pages/Estoque.jsx';
import Catalogo from './pages/Catalogo.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Ajuda from './pages/Ajuda.jsx';
import Privacidade from './pages/Privacidade.jsx';
import Termos from './pages/Termos.jsx';
import Landing from './pages/Landing.jsx';
import RodapeLegal from './components/RodapeLegal.jsx';
import VerificarEmail from './pages/VerificarEmail.jsx';
import RecuperarSenha from './pages/RecuperarSenha.jsx';
import Cookies from './pages/Cookies.jsx';
import CookieBanner from './components/CookieBanner.jsx';
import ConviteAceitar from './pages/ConviteAceitar.jsx';
import MagicLink from './pages/MagicLink.jsx';

function RequireAuth({ children }) {
  const { user, logout, senhaProvisoria } = useAuth();
  // Se o token já expirou, derruba a sessão (efeito) e manda pro login.
  const expirado = tokenExpirado();
  useEffect(() => {
    if (expirado && user) logout();
  }, [expirado, user, logout]);
  if (!user || expirado) return <Navigate to="/login" replace />;
  // Usuário com PIN provisório fica preso na troca de senha até definir uma definitiva.
  if (senhaProvisoria && window.location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />;
  }
  return children;
}

// Protege uma rota por permissão de módulo (RBAC). O dono passa direto; demais esperam
// as permissões carregarem (evita redirect prematuro durante o fetch de /me/permissoes).
function RequirePermissao({ modulo, acao = 'ver', children }) {
  const { user, pode, permissoes } = useAuth();
  if (user?.papel !== 'dono' && permissoes === null) return null; // carregando
  if (!pode(modulo, acao)) return <Navigate to="/configuracao" replace />;
  return children;
}

// Raiz: visitante não autenticado vê a landing pública; logado vê o dashboard.
// O funcionário não acessa o Dashboard da empresa — cai no painel próprio.
function Home() {
  const { user } = useAuth();
  if (!user) return <Landing />;
  const ehFuncionario = user.papel === 'funcionario';
  return (
    <RequireAuth>
      <Layout>{ehFuncionario ? <MeuPainel /> : <Dashboard />}</Layout>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <CookieBanner />
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Troca de senha forçada (PIN provisório) — tela focada, sem Layout */}
          <Route path="/trocar-senha" element={<RequireAuth><TrocarSenha /></RequireAuth>} />
          {/* Documentos legais — públicos (acessíveis sem login) */}
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/termos" element={<Termos />} />
          <Route path="/cookies" element={<Cookies />} />
          {/* Fluxos de auth por e-mail — sem autenticação prévia */}
          <Route path="/verificar-email" element={<VerificarEmail />} />
          <Route path="/recuperar-senha" element={<RecuperarSenha />} />
          <Route path="/redefinir-senha" element={<RecuperarSenha />} />
          <Route path="/convite/:token" element={<ConviteAceitar />} />
          <Route path="/magic-link" element={<MagicLink />} />

          <Route path="/" element={<Home />} />
          <Route path="/servicos" element={<RequireAuth><Layout><Servicos /></Layout></RequireAuth>} />
          <Route path="/servicos/novo" element={<RequireAuth><Layout><NovoServico /></Layout></RequireAuth>} />
          <Route path="/reparticao" element={<RequireAuth><Layout><Reparticao /></Layout></RequireAuth>} />
          <Route path="/tecnicos" element={<RequireAuth><Layout><Tecnicos /></Layout></RequireAuth>} />
          <Route path="/tecnicos/novo" element={<RequireAuth><Layout><NovoTecnico /></Layout></RequireAuth>} />
          <Route path="/tecnicos/:id" element={<RequireAuth><Layout><PerfilTecnico /></Layout></RequireAuth>} />
          <Route path="/avaliacoes" element={<RequireAuth><Layout><Avaliacoes /></Layout></RequireAuth>} />
          <Route path="/meu-ponto" element={<RequireAuth><Layout><MeuPonto /></Layout></RequireAuth>} />

          {/* Painel simplificado do funcionário: serviços próprios e aprovações */}
          <Route path="/meus-servicos" element={<RequireAuth><Layout><MeusServicos /></Layout></RequireAuth>} />
          <Route path="/meus-servicos/novo" element={<RequireAuth><Layout><NovoServicoFuncionario /></Layout></RequireAuth>} />
          <Route path="/aprovacoes" element={<RequireAuth><Layout><Aprovacoes /></Layout></RequireAuth>} />

          {/* Materiais (ex-Catálogo) e Estoque agora são abas próprias */}
          <Route path="/materiais" element={<RequireAuth><Layout><Catalogo /></Layout></RequireAuth>} />
          <Route path="/estoque" element={<RequireAuth><Layout><Estoque /></Layout></RequireAuth>} />

          <Route path="/mais" element={<RequireAuth><Layout><Mais /></Layout></RequireAuth>} />
          <Route path="/ajuda" element={<RequireAuth><Layout><Ajuda /></Layout></RequireAuth>} />
          <Route path="/configuracao" element={<RequireAuth><Layout><Configuracao /></Layout></RequireAuth>} />
          <Route path="/configuracao/perfil" element={<RequireAuth><Layout><Perfil /></Layout></RequireAuth>} />
          <Route path="/configuracao/seguranca" element={<RequireAuth><Layout><Seguranca /></Layout></RequireAuth>} />
          <Route path="/configuracao/notificacoes" element={<RequireAuth><Layout><Notificacoes /></Layout></RequireAuth>} />
          <Route path="/configuracao/whatsapp" element={<RequireAuth><Layout><ConfiguracaoBot /></Layout></RequireAuth>} />
          {/* Rotas antigas redirecionadas para as novas abas */}
          <Route path="/configuracao/estoque" element={<Navigate to="/estoque" replace />} />
          <Route path="/configuracao/catalogo" element={<Navigate to="/materiais" replace />} />
          <Route
            path="/configuracao/usuarios"
            element={
              <RequireAuth>
                <RequirePermissao modulo="usuarios">
                  <Layout><Usuarios /></Layout>
                </RequirePermissao>
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

function Layout({ children }) {
  const offline = useOffline();
  return (
    <div className="min-h-dvh bg-dark-900 lg:flex">
      {/* Sidebar fixa no desktop (≥ lg) */}
      <Sidebar />

      {/* Coluna de conteúdo */}
      <div className="flex-1 flex flex-col min-w-0 min-h-dvh">
        {offline && (
          <div role="alert" className="bg-warning text-dark-950 text-sm font-medium text-center py-2 px-4">
            Sem conexão — alguns dados podem estar desatualizados
          </div>
        )}
        {/* No desktop, conteúdo centralizado com largura máxima; no mobile, largura total */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-8">
          <div className="lg:max-w-6xl lg:mx-auto lg:px-2">{children}</div>
          <RodapeLegal />
        </main>
      </div>

      {/* BottomNav só no mobile (< lg) */}
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
