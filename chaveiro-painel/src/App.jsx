import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';
import PanelScope from './components/ui/PanelScope.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { RequireAuth, RequirePermissao } from './components/Guards.jsx';
import BottomNav from './components/BottomNav.jsx';
import Sidebar from './components/Sidebar.jsx';
import { useOffline } from './hooks/useOffline.js';
import Login from './pages/Login.jsx';
import TrocarSenha from './pages/TrocarSenha.jsx';
import Dashboard from './pages/Dashboard.jsx';
import GestorHome from './pages/GestorHome.jsx';
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
import Documentos from './pages/Documentos.jsx';
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

// Raiz por papel (PR2 + PR4): visitante vê a landing; funcionário cai no painel
// próprio; gestor recebe a home operacional; dono/admin recebem o dashboard da empresa.
function Home() {
  const { user } = useAuth();
  if (!user) return <Landing />;
  const home =
    user.papel === 'funcionario' ? (
      <MeuPainel />
    ) : user.papel === 'gestor' ? (
      <GestorHome />
    ) : (
      <Dashboard />
    );
  return (
    <RequireAuth>
      <Layout>{home}</Layout>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const PUBLIC_SURFACES = new Set(['/privacidade', '/termos', '/cookies']);

function AppContent() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const isPublicSurface = PUBLIC_SURFACES.has(normalizedPath) || (normalizedPath === '/' && !user);

  return (
    <PanelScope active={!isPublicSurface}>
      <ToastProvider>
        <CookieBanner />
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Troca de senha forçada (PIN provisório) — tela focada, sem Layout */}
          <Route
            path="/trocar-senha"
            element={
              <RequireAuth>
                <TrocarSenha />
              </RequireAuth>
            }
          />
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
          <Route
            path="/servicos"
            element={
              <RequireAuth>
                <Layout>
                  <Servicos />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/servicos/novo"
            element={
              <RequireAuth>
                <Layout>
                  <NovoServico />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/reparticao"
            element={
              <RequireAuth>
                <Layout>
                  <Reparticao />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/tecnicos"
            element={
              <RequireAuth>
                <Layout>
                  <Tecnicos />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/tecnicos/novo"
            element={
              <RequireAuth>
                <Layout>
                  <NovoTecnico />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/tecnicos/:id"
            element={
              <RequireAuth>
                <Layout>
                  <PerfilTecnico />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/avaliacoes"
            element={
              <RequireAuth>
                <Layout>
                  <Avaliacoes />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/meu-ponto"
            element={
              <RequireAuth>
                <Layout>
                  <MeuPonto />
                </Layout>
              </RequireAuth>
            }
          />

          {/* Painel simplificado do funcionário: serviços próprios e aprovações */}
          <Route
            path="/meus-servicos"
            element={
              <RequireAuth>
                <Layout>
                  <MeusServicos />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/meus-servicos/novo"
            element={
              <RequireAuth>
                <Layout>
                  <NovoServicoFuncionario />
                </Layout>
              </RequireAuth>
            }
          />
          {/* F9/M4: documentos do próprio funcionário (a tela feature-detecta a flag) */}
          <Route
            path="/meus-documentos"
            element={
              <RequireAuth>
                <Layout>
                  <Documentos />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/aprovacoes"
            element={
              <RequireAuth>
                <Layout>
                  <Aprovacoes />
                </Layout>
              </RequireAuth>
            }
          />

          {/* Materiais (ex-Catálogo) e Estoque agora são abas próprias */}
          <Route
            path="/materiais"
            element={
              <RequireAuth>
                <Layout>
                  <Catalogo />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/estoque"
            element={
              <RequireAuth>
                <Layout>
                  <Estoque />
                </Layout>
              </RequireAuth>
            }
          />

          <Route
            path="/mais"
            element={
              <RequireAuth>
                <Layout>
                  <Mais />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/ajuda"
            element={
              <RequireAuth>
                <Layout>
                  <Ajuda />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/configuracao"
            element={
              <RequireAuth>
                <Layout>
                  <Configuracao />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/configuracao/perfil"
            element={
              <RequireAuth>
                <Layout>
                  <Perfil />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/configuracao/seguranca"
            element={
              <RequireAuth>
                <Layout>
                  <Seguranca />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/configuracao/notificacoes"
            element={
              <RequireAuth>
                <Layout>
                  <Notificacoes />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/configuracao/whatsapp"
            element={
              <RequireAuth>
                <Layout>
                  <ConfiguracaoBot />
                </Layout>
              </RequireAuth>
            }
          />
          {/* Rotas antigas redirecionadas para as novas abas */}
          <Route path="/configuracao/estoque" element={<Navigate to="/estoque" replace />} />
          <Route path="/configuracao/catalogo" element={<Navigate to="/materiais" replace />} />
          <Route
            path="/configuracao/usuarios"
            element={
              <RequireAuth>
                <RequirePermissao modulo="usuarios">
                  <Layout>
                    <Usuarios />
                  </Layout>
                </RequirePermissao>
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </PanelScope>
  );
}

function Layout({ children }) {
  const offline = useOffline();
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh bg-dark-900 lg:flex">
      {/* Sidebar fixa no desktop (≥ lg) */}
      <Sidebar />

      {/* Coluna de conteúdo */}
      <div className="flex-1 flex flex-col min-w-0 min-h-dvh safe-area-top">
        {offline && (
          <div
            role="alert"
            className="bg-warning text-dark-950 text-sm font-medium text-center py-2 px-4"
          >
            Sem conexão — alguns dados podem estar desatualizados
          </div>
        )}
        {/* No desktop, conteúdo centralizado com largura máxima; no mobile, largura total */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-8">
          {/* key={pathname}: remonta o conteúdo por navegação p/ a transição de rota tocar
              (fade-only, .panel-route). RodapeLegal fica fora p/ não reanimar. */}
          <div key={pathname} className="panel-route lg:max-w-6xl lg:mx-auto lg:px-2">
            {children}
          </div>
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
