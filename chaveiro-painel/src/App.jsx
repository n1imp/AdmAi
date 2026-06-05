import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import BottomNav from './components/BottomNav.jsx';
import Sidebar from './components/Sidebar.jsx';
import { useOffline } from './hooks/useOffline.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Servicos from './pages/Servicos.jsx';
import NovoServico from './pages/NovoServico.jsx';
import Reparticao from './pages/Reparticao.jsx';
import Tecnicos from './pages/Tecnicos.jsx';
import PerfilTecnico from './pages/PerfilTecnico.jsx';
import Avaliacoes from './pages/Avaliacoes.jsx';
import Mais from './pages/Mais.jsx';
import Configuracao from './pages/Configuracao.jsx';
import Perfil from './pages/Perfil.jsx';
import Seguranca from './pages/Seguranca.jsx';
import Notificacoes from './pages/Notificacoes.jsx';
import ConfiguracaoBot from './pages/ConfiguracaoBot.jsx';
import Estoque from './pages/Estoque.jsx';
import Catalogo from './pages/Catalogo.jsx';
import Usuarios from './pages/Usuarios.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/configuracao" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<RequireAuth><Layout><Dashboard /></Layout></RequireAuth>} />
          <Route path="/servicos" element={<RequireAuth><Layout><Servicos /></Layout></RequireAuth>} />
          <Route path="/servicos/novo" element={<RequireAuth><Layout><NovoServico /></Layout></RequireAuth>} />
          <Route path="/reparticao" element={<RequireAuth><Layout><Reparticao /></Layout></RequireAuth>} />
          <Route path="/tecnicos" element={<RequireAuth><Layout><Tecnicos /></Layout></RequireAuth>} />
          <Route path="/tecnicos/:id" element={<RequireAuth><Layout><PerfilTecnico /></Layout></RequireAuth>} />
          <Route path="/avaliacoes" element={<RequireAuth><Layout><Avaliacoes /></Layout></RequireAuth>} />

          {/* Materiais (ex-Catálogo) e Estoque agora são abas próprias */}
          <Route path="/materiais" element={<RequireAuth><Layout><Catalogo /></Layout></RequireAuth>} />
          <Route path="/estoque" element={<RequireAuth><Layout><Estoque /></Layout></RequireAuth>} />

          <Route path="/mais" element={<RequireAuth><Layout><Mais /></Layout></RequireAuth>} />
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
                <RequireAdmin>
                  <Layout><Usuarios /></Layout>
                </RequireAdmin>
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
        </main>
      </div>

      {/* BottomNav só no mobile (< lg) */}
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
