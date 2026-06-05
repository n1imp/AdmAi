import { useState, useEffect, useCallback } from 'react';
import { UserCheck, UserX, X, ShieldCheck } from 'lucide-react';
import api from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

function ModalUsuario({ onClose, onSalvo }) {
  const toast = useToast();
  const [nome, setNome] = useState('');
  const [username, setUsername] = useState('');
  const [senha, setSenha] = useState('');
  const [admin, setAdmin] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim() || !username.trim() || !senha) return;
    setSalvando(true);
    try {
      await api.post('/usuarios', { nome: nome.trim(), username: username.trim(), senha, admin });
      toast('Usuário criado', 'success');
      onSalvo();
      onClose();
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao criar usuário', 'error');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-dark-800 border border-dark-600 rounded-lg p-6 shadow-panel animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold text-white uppercase tracking-wide">Novo usuário</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div>
            <label className="kpi-label block mb-2">Nome *</label>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" autoFocus />
          </div>
          <div>
            <label className="kpi-label block mb-2">Usuário *</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              placeholder="usuario_sem_espacos"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="kpi-label block mb-2">Senha * (mín. 6 caracteres)</label>
            <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••" autoComplete="new-password" />
          </div>

          <button
            type="button"
            onClick={() => setAdmin(!admin)}
            className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
              admin ? 'bg-accent-400/10 border-accent-400/30' : 'bg-dark-700 border-dark-600'
            }`}
          >
            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
              admin ? 'bg-accent-400 border-accent-400' : 'bg-dark-600 border-dark-500'
            }`}>
              {admin && <span className="text-dark-950 text-xs font-bold">✓</span>}
            </div>
            <div className="text-left flex-1">
              <p className={`text-sm font-medium ${admin ? 'text-accent-300' : 'text-muted'}`}>Administrador</p>
              <p className="text-muted text-xs">Pode gerenciar usuários e todas as configurações</p>
            </div>
          </button>

          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={salvando || !nome.trim() || !username.trim() || senha.length < 6} className="btn-primary flex-1">
              {salvando ? 'Criando…' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Usuarios() {
  const toast = useToast();
  const { user: meuUser } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const { data } = await api.get('/usuarios');
      setUsuarios(data);
    } catch {
      setErro('Não foi possível carregar os usuários.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  async function toggleAtivo(u) {
    try {
      await api.patch(`/usuarios/${u.id}`, { ativo: !u.ativo });
      setUsuarios((prev) => prev.map((x) => x.id === u.id ? { ...x, ativo: !u.ativo } : x));
      toast(`Usuário ${!u.ativo ? 'ativado' : 'desativado'}`, 'success');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao atualizar', 'error');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Usuários" />

      <div className="px-4 pt-2 pb-4">
        <p className="text-muted text-xs">
          {usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''} cadastrado{usuarios.length !== 1 ? 's' : ''}
        </p>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      <div className="flex-1 overflow-y-auto px-4 pb-24 grid gap-3 lg:grid-cols-2 content-start">
        {carregando ? (
          <div className="lg:col-span-2"><SkeletonLista qtd={3} /></div>
        ) : usuarios.length === 0 ? (
          <div className="lg:col-span-2"><EstadoVazio mensagem="Nenhum usuário cadastrado" sub="Toque em + para criar o primeiro usuário" /></div>
        ) : (
          usuarios.map((u) => (
            <div key={u.id} className="card flex items-center gap-3">
              <div className={`w-10 h-10 rounded-md flex items-center justify-center font-display font-bold text-base shrink-0 ${
                u.ativo ? 'bg-accent-400 text-dark-950' : 'bg-dark-700 text-muted border border-dark-600'
              }`}>
                {u.nome.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-white truncate">{u.nome}</p>
                  {u.admin && (
                    <span className="badge bg-indigo-400/10 text-indigo-300 border-indigo-400/20 flex items-center gap-1">
                      <ShieldCheck size={10} />
                      Admin
                    </span>
                  )}
                  {u.id === parseInt(localStorage.getItem('chaveiro_uid') ?? '0') && (
                    <span className="badge bg-dark-700 text-muted border border-dark-600 text-[10px]">você</span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">@{u.username}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`badge ${u.ativo ? 'bg-success/10 text-success border border-success/20' : 'bg-dark-700 text-muted border border-dark-600'}`}>
                  {u.ativo ? 'Ativo' : 'Inativo'}
                </span>
                <button
                  onClick={() => toggleAtivo(u)}
                  disabled={u.username === meuUser?.username}
                  className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    u.ativo
                      ? 'bg-danger/10 text-danger hover:bg-danger/20'
                      : 'bg-success/10 text-success hover:bg-success/20'
                  }`}
                  title={u.ativo ? 'Desativar' : 'Ativar'}
                >
                  {u.ativo ? <UserX size={16} /> : <UserCheck size={16} />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setMostrarModal(true)}
        aria-label="Novo usuário"
        className="fixed bottom-24 lg:bottom-8 right-4 lg:right-8 w-14 h-14 rounded-lg bg-accent-400 flex items-center justify-center shadow-[0_0_24px_-4px_rgba(34,211,238,0.6)] text-dark-950 hover:bg-accent-300 transition-colors z-30 text-2xl font-light"
      >
        +
      </button>

      {mostrarModal && (
        <ModalUsuario onClose={() => setMostrarModal(false)} onSalvo={buscar} />
      )}
    </div>
  );
}
