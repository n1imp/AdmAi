import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';
import PanelScope from './components/ui/PanelScope.jsx';
import { featureAtiva } from './lib/featureFlags.js';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { RequireAuth, RequirePermissao } from './components/Guards.jsx';
import BottomNav from './components/BottomNav.jsx';
import Sidebar from './components/Sidebar.jsx';
import { useOffline } from './hooks/useOffline.js';
import Login from './pages/Login.jsx';
import TrocarSenha from './pages/TrocarSenha.jsx';
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const MetricHub = lazy(() => import('./pages/MetricHub.jsx'));
const MetricHubReceita = lazy(() => import('./pages/MetricHubReceita.jsx'));
import GestorHome from './pages/GestorHome.jsx';
import Servicos from './pages/Servicos.jsx';
import NovoServico from './pages/NovoServico.jsx';
import Reparticao from './pages/Reparticao.jsx';
import Tecnicos from './pages/Tecnicos.jsx';
import NovoTecnico from './pages/NovoTecnico.jsx';
const PerfilTecnico = lazy(() => import('./pages/PerfilTecnico.jsx'));
import Avaliacoes from './pages/Avaliacoes.jsx';
import MeuPonto from './pages/MeuPonto.jsx';
const MeuPainel = lazy(() => import('./pages/MeuPainel.jsx'));
import MeusServicos from './pages/MeusServicos.jsx';
import Documentos from './pages/Documentos.jsx';
import NovoServicoFuncionario from './pages/NovoServicoFuncionario.jsx';
import Aprovacoes from './pages/Aprovacoes.jsx';
import Mais from './pages/Mais.jsx';
import Configuracao from './pages/Configuracao.jsx';
import Assinatura from './pages/Assinatura.jsx';
import Perfil from './pages/Perfil.jsx';
import Seguranca from './pages/Seguranca.jsx';
import Notificacoes from './pages/Notificacoes.jsx';
import ConfiguracaoBot from './pages/ConfiguracaoBot.jsx';
import Estoque from './pages/Estoque.jsx';
import Catalogo from './pages/Catalogo.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Auditoria from './pages/Auditoria.jsx';
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

function AppContent() {
  return (
    /* Aurora em TUDO (decisao do usuario, 2026-08-23): a fronteira PUBLIC_SURFACES morreu —
       Landing e paginas legais entram no mesmo escopo .panel-ui do produto. [SL-09] */
    <PanelScope>
      <ToastProvider>
        <CookieBanner />
        {/* [F6-PERF] As páginas de gráficos são lazy: recharts (152KB gzip) saía junto com a
            Landing pública. Um único Suspense cobre as rotas — fallback breve no padrão do
            painel. */}
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[40vh]" aria-label="Carregando">
              <span className="w-6 h-6 rounded-full border-2 border-accent-400/30 border-t-accent-300 animate-spin" />
            </div>
          }
        >
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
            {/* Rota por Hub implementado, não `/metricas/:metricId`: das 8 métricas, 6 ainda não
              têm Hub, e uma rota curinga renderizaria página quebrada para elas. */}
            {/* Rota só existe se a capacidade entrar no release. Esconder o menu e manter
              a rota viva deixaria a feature a um deep-link de distância — que é o estado
              inválido que a flag existe para impedir. [SCOPE-F3] */}
            {featureAtiva('METRIC_HUBS') && (
              <Route
                path="/metricas/faturamento-liquido"
                element={
                  <RequireAuth>
                    <RequirePermissao modulo="financeiro" acao="ver">
                      <Layout>
                        <MetricHubReceita />
                      </Layout>
                    </RequirePermissao>
                  </RequireAuth>
                }
              />
            )}
            {/* Rota só existe se a capacidade entrar no release. Esconder o menu e manter
              a rota viva deixaria a feature a um deep-link de distância — que é o estado
              inválido que a flag existe para impedir. [SCOPE-F3] */}
            {featureAtiva('METRIC_HUBS') && (
              <Route
                path="/metricas/servicos-concluidos"
                element={
                  <RequireAuth>
                    <RequirePermissao modulo="servicos" acao="ver">
                      <Layout>
                        <MetricHub />
                      </Layout>
                    </RequirePermissao>
                  </RequireAuth>
                }
              />
            )}
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
            {/* Rota só existe se a capacidade entrar no release. Esconder o menu e manter
              a rota viva deixaria a feature a um deep-link de distância — que é o estado
              inválido que a flag existe para impedir. [SCOPE-F3] */}
            {featureAtiva('GOOGLE_REVIEWS') && (
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
            )}
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

            {/* Materiais (ex-Catálogo) e Estoque agora são abas próprias.
                RequirePermissao é UX (o backend já nega estoque:ver): sem ele, o deep-link
                de um papel sem permissão renderizava erro de carregamento e estado vazio
                ao mesmo tempo. [AUD-GAP-ESTOQUE-FUNC-GUARD] */}
            <Route
              path="/materiais"
              element={
                <RequireAuth>
                  <RequirePermissao modulo="estoque">
                    <Layout>
                      <Catalogo />
                    </Layout>
                  </RequirePermissao>
                </RequireAuth>
              }
            />
            <Route
              path="/estoque"
              element={
                <RequireAuth>
                  <RequirePermissao modulo="estoque">
                    <Layout>
                      <Estoque />
                    </Layout>
                  </RequirePermissao>
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
            {/* [D2 Refoundation] Assinaturas fora do MVP: rota atrás da flag — deep-link
                desligado junto com o card e o redirect 402 (fronteira única). */}
            {featureAtiva('SUBSCRIPTIONS_BILLING') && (
              <Route
                path="/assinatura"
                element={
                  <RequireAuth>
                    <Layout>
                      <Assinatura />
                    </Layout>
                  </RequireAuth>
                }
              />
            )}
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
            {/* Rota só existe se a capacidade entrar no release. Esconder o menu e manter
              a rota viva deixaria a feature a um deep-link de distância — que é o estado
              inválido que a flag existe para impedir. [SCOPE-F3] */}
            {featureAtiva('NOTIFICACOES') && (
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
            )}
            {/* [Refoundation §26 + fitness de coerência] WhatsApp é POST_MVP: a rota segue o
                mesmo padrão de NOTIFICACOES — com a flag off, nem deep-link alcança a
                superfície (o card em /configuracao já era gated; a rota viva era o "estado
                inválido que a flag existe para impedir"). */}
            {featureAtiva('WHATSAPP') && (
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
            )}
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
            {/* Auditoria consultável (USER GATE D3): a própria página faz o autogate por
                isAdmin (espelhando o adminOnly do backend, que é autoritativo). */}
            <Route
              path="/configuracao/auditoria"
              element={
                <RequireAuth>
                  <Layout>
                    <Auditoria />
                  </Layout>
                </RequireAuth>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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
        <main
          /* `main` tem rolagem PROPRIA (`overflow-y-auto`), e padding no `body` nao alcanca
             container de rolagem aninhado. Sem isto o rodape do painel em 1920 ficava
             permanentemente sob o banner: rolar ate o fim parava dentro da faixa dele.
             O `pb-20` continua reservando a navegacao inferior; a altura do consentimento entra
             somada, e medida. [GAP-UX-CONSENT-01] */
          style={{ paddingBottom: 'calc(var(--admai-consent-h, 0px))' }}
          className="flex-1 overflow-y-auto pb-20 lg:pb-8 flex flex-col"
        >
          {/* key={pathname}: remonta o conteúdo por navegação p/ a transição de rota tocar
              (fade-only, .panel-route). RodapeLegal fica fora p/ não reanimar. */}
          <div key={pathname} className="panel-route lg:max-w-6xl lg:mx-auto lg:px-2">
            {children}
          </div>
          {/* mt-auto: em página curta o rodapé ENCOSTA na base do main; em página longa segue o
              conteúdo — o critério literal de GAP-UX-RODAPE-01, sem virar barra fixa. */}
          <RodapeLegal className="mt-auto" />
        </main>
      </div>

      {/* BottomNav só no mobile (< lg) */}
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
