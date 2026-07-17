import { useState, useEffect, useCallback } from 'react';
import { UserCheck, UserX, ShieldCheck, Crown, UserCog, KeyRound, Trash2 } from 'lucide-react';
import api from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import MatrizPermissoes from '../components/MatrizPermissoes.jsx';
import { Overlay } from '../components/ui/index.js';

// ── Metadados de papel (rótulo + cor do badge) ────────────────────────────────
const PAPEIS = {
  dono: {
    rotulo: 'Dono',
    icone: Crown,
    badge: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
  },
  gestor: {
    rotulo: 'Gestor',
    icone: ShieldCheck,
    badge: 'bg-indigo-400/10 text-indigo-300 border-indigo-400/30',
  },
  funcionario: {
    rotulo: 'Funcionário',
    icone: UserCog,
    badge: 'bg-sky-400/10 text-sky-300 border-sky-400/30',
  },
};

const ORDEM_PAPEIS = ['dono', 'gestor', 'funcionario'];

// Constrói a matriz completa de toggles a partir de um preset do catálogo
// (preset = { modulo: { acao: bool }, proprio: { cap: bool } }), normalizando
// contra o catálogo para garantir todas as chaves presentes.
function matrizDoPreset(preset, catalogo) {
  return montarMatriz(
    catalogo,
    (modulo, acao) => Boolean(preset?.[modulo]?.[acao]),
    (cap) => Boolean(preset?.proprio?.[cap])
  );
}

// Constrói a matriz a partir das permissões EFETIVAS de um usuário existente.
function matrizDoEfetivo(efetivas, catalogo) {
  return montarMatriz(
    catalogo,
    (modulo, acao) => Boolean(efetivas?.[modulo]?.[acao]),
    (cap) => Boolean(efetivas?.proprio?.[cap])
  );
}

// Helper genérico: percorre o catálogo e resolve cada toggle via callbacks.
function montarMatriz(catalogo, valorModulo, valorProprio) {
  const matriz = {};
  const acoesPorModulo = catalogo?.acoesPorModulo ?? {};
  for (const modulo of Object.keys(acoesPorModulo)) {
    matriz[modulo] = {};
    for (const acao of acoesPorModulo[modulo]) {
      matriz[modulo][acao] = valorModulo(modulo, acao);
    }
  }
  matriz.proprio = {};
  for (const cap of catalogo?.capacidadesProprio ?? []) {
    matriz.proprio[cap] = valorProprio(cap);
  }
  return matriz;
}

// Dono = acesso total: liga tudo (toggles bloqueados na UI, mas enviamos coerente).
function matrizTotal(catalogo) {
  return montarMatriz(
    catalogo,
    () => true,
    () => true
  );
}

function BadgePapel({ papel }) {
  const meta = PAPEIS[papel] ?? PAPEIS.funcionario;
  const Icone = meta.icone;
  return (
    <span className={`badge ${meta.badge} flex items-center gap-1`}>
      <Icone size={10} />
      {meta.rotulo}
    </span>
  );
}

function ModalUsuario({ modo, usuario, catalogo, euId, onClose, onSalvo }) {
  const toast = useToast();
  const ehEdicao = modo === 'editar';
  const ehMinhaConta = ehEdicao && usuario?.id === euId;

  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [username, setUsername] = useState(usuario?.username ?? '');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState(usuario?.papel ?? 'funcionario');
  const [ativo, setAtivo] = useState(usuario?.ativo ?? true);
  const [matriz, setMatriz] = useState(() => {
    if (ehEdicao) return matrizDoEfetivo(usuario?.permissoesEfetivas, catalogo);
    return matrizDoPreset(catalogo?.presets?.funcionario, catalogo);
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  // Ao trocar de papel, recarrega a matriz a partir do preset do novo papel.
  // (No criar começa do preset; no editar, trocar o papel também reseta do preset
  //  do papel escolhido — comportamento previsível e explícito para o dono.)
  function trocarPapel(novo) {
    setPapel(novo);
    if (novo === 'dono') setMatriz(matrizTotal(catalogo));
    else setMatriz(matrizDoPreset(catalogo?.presets?.[novo], catalogo));
  }

  function toggleModulo(modulo, acao) {
    setMatriz((m) => ({ ...m, [modulo]: { ...m[modulo], [acao]: !m[modulo]?.[acao] } }));
  }

  function toggleProprio(cap) {
    setMatriz((m) => ({ ...m, proprio: { ...m.proprio, [cap]: !m.proprio?.[cap] } }));
  }

  const ehDono = papel === 'dono';
  const ehFuncionario = papel === 'funcionario';
  // Dono manda matriz total e imutável; demais mandam a matriz editada.
  const matrizParaEnviar = ehDono ? matrizTotal(catalogo) : matriz;

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      if (ehEdicao) {
        const body = { nome: nome.trim(), permissoes: matrizParaEnviar };
        // Não envia papel/ativo da própria conta (o backend bloqueia; escondemos no front).
        if (!ehMinhaConta) {
          body.papel = papel;
          body.ativo = ativo;
        }
        if (senha) body.senha = senha;
        await api.patch(`/usuarios/${usuario.id}`, body);
        toast('Conta atualizada', 'success');
      } else {
        if (!username.trim() || senha.length < 6) return;
        await api.post('/usuarios', {
          nome: nome.trim(),
          username: username.trim(),
          senha,
          papel,
          permissoes: matrizParaEnviar,
        });
        toast('Conta criada', 'success');
      }
      onSalvo();
      onClose();
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao salvar conta', 'error');
    } finally {
      setSalvando(false);
    }
  }

  const podeSalvar = ehEdicao
    ? nome.trim().length > 0
    : nome.trim().length > 0 && username.trim().length > 0 && senha.length >= 6;

  return (
    <Overlay open onClose={onClose} title={ehEdicao ? 'Editar conta' : 'Nova conta'} size="md">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div>
          <label className="kpi-label block mb-2">Nome *</label>
          <input
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
            autoFocus
          />
        </div>

        {!ehEdicao && (
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
        )}

        <div>
          <label className="kpi-label block mb-2">
            {ehEdicao ? 'Nova senha (opcional)' : 'Senha * (mín. 6 caracteres)'}
          </label>
          <input
            className="input"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={ehEdicao ? 'Deixe em branco para manter' : '••••••'}
            autoComplete="new-password"
          />
        </div>

        {/* ── Papel ───────────────────────────────────────────────────────── */}
        <div>
          <label className="kpi-label block mb-2">Papel</label>
          {ehMinhaConta ? (
            <div className="flex items-center gap-2 rounded-md border border-dark-600 bg-dark-700/40 px-3 py-2.5">
              <BadgePapel papel={papel} />
              <span className="text-xs text-muted">
                Você não pode alterar o papel da sua própria conta.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {ORDEM_PAPEIS.map((p) => {
                const meta = PAPEIS[p];
                const Icone = meta.icone;
                const sel = papel === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => trocarPapel(p)}
                    className={`flex flex-col items-center gap-1.5 rounded-md border px-2 py-3 transition-colors ${
                      sel
                        ? 'border-accent-400/50 bg-accent-400/10 text-accent-300'
                        : 'border-dark-600 bg-dark-700 text-muted hover:text-white'
                    }`}
                  >
                    <Icone size={18} />
                    <span className="text-xs font-medium">{meta.rotulo}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Status (só edição, exceto a própria conta) ──────────────────── */}
        {ehEdicao && !ehMinhaConta && (
          <button
            type="button"
            onClick={() => setAtivo((v) => !v)}
            className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
              ativo ? 'bg-success/10 border-success/30' : 'bg-dark-700 border-dark-600'
            }`}
          >
            <div
              className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                ativo ? 'bg-success border-success' : 'bg-dark-600 border-dark-500'
              }`}
            >
              {ativo && <span className="text-dark-950 text-xs font-bold">✓</span>}
            </div>
            <div className="text-left flex-1">
              <p className={`text-sm font-medium ${ativo ? 'text-success' : 'text-muted'}`}>
                Conta ativa
              </p>
              <p className="text-muted text-xs">
                {ativo ? 'O usuário consegue acessar o painel' : 'Acesso bloqueado'}
              </p>
            </div>
          </button>
        )}

        {/* ── Matriz de permissões ────────────────────────────────────────── */}
        <div className="border-t border-dark-600 pt-4">
          <MatrizPermissoes
            matriz={ehDono ? matrizTotal(catalogo) : matriz}
            acoesPorModulo={catalogo?.acoesPorModulo}
            capacidadesProprio={catalogo?.capacidadesProprio}
            onToggleModulo={toggleModulo}
            onToggleProprio={toggleProprio}
            bloqueado={ehDono}
            destacarProprio={ehFuncionario}
          />
        </div>

        <div className="flex gap-3 mt-1 sticky bottom-0">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !podeSalvar} className="btn-primary flex-1">
            {salvando ? 'Salvando…' : ehEdicao ? 'Salvar' : 'Criar conta'}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

export default function Usuarios() {
  const toast = useToast();
  const { user: meuUser } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [catalogo, setCatalogo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [modal, setModal] = useState(null); // { modo:'criar'|'editar', usuario? }

  const buscar = useCallback(async () => {
    setErro(null);
    setCarregando(true);
    try {
      const [resUsuarios, resCatalogo] = await Promise.all([
        api.get('/usuarios'),
        catalogo ? Promise.resolve({ data: catalogo }) : api.get('/permissoes/catalogo'),
      ]);
      setUsuarios(resUsuarios.data);
      setCatalogo(resCatalogo.data);
    } catch {
      setErro('Não foi possível carregar as contas.');
    } finally {
      setCarregando(false);
    }
  }, [catalogo]);

  useEffect(() => {
    buscar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleAtivo(u) {
    try {
      const { data } = await api.patch(`/usuarios/${u.id}`, { ativo: !u.ativo });
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, ativo: data.ativo } : x)));
      toast(`Conta ${data.ativo ? 'ativada' : 'desativada'}`, 'success');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao atualizar', 'error');
    }
  }

  async function excluir(u) {
    if (!window.confirm(`Excluir a conta de ${u.nome}? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/usuarios/${u.id}`);
      setUsuarios((prev) => prev.filter((x) => x.id !== u.id));
      toast('Conta excluída', 'success');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao excluir', 'error');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Usuários" />

      <div className="px-4 pt-2 pb-4">
        <p className="text-muted text-xs">
          {usuarios.length} conta{usuarios.length !== 1 ? 's' : ''} cadastrada
          {usuarios.length !== 1 ? 's' : ''}
        </p>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      <div className="flex-1 overflow-y-auto px-4 pb-24 grid gap-3 lg:grid-cols-2 content-start">
        {carregando ? (
          <div className="lg:col-span-2">
            <SkeletonLista qtd={3} />
          </div>
        ) : usuarios.length === 0 ? (
          <div className="lg:col-span-2">
            <EstadoVazio
              mensagem="Nenhuma conta cadastrada"
              sub="Toque em + para criar a primeira conta"
            />
          </div>
        ) : (
          usuarios.map((u) => {
            const ehEu = u.id === meuUser?.id;
            return (
              <div key={u.id} className="card flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-md flex items-center justify-center font-display font-bold text-base shrink-0 ${
                    u.ativo
                      ? 'bg-accent-400 text-dark-950'
                      : 'bg-dark-700 text-muted border border-dark-600'
                  }`}
                >
                  {u.nome.charAt(0).toUpperCase()}
                </div>

                <button
                  onClick={() => setModal({ modo: 'editar', usuario: u })}
                  className="flex-1 min-w-0 text-left"
                  title="Editar conta"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white truncate">{u.nome}</p>
                    <BadgePapel papel={u.papel} />
                    {u.tecnico && (
                      <span className="badge bg-dark-700 text-muted border border-dark-600 text-[10px]">
                        Técnico
                      </span>
                    )}
                    {ehEu && (
                      <span className="badge bg-dark-700 text-muted border border-dark-600 text-[10px]">
                        você
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-muted">@{u.username}</p>
                    {u.senhaProvisoria && (
                      <span className="badge bg-warning/10 text-warning border-warning/30 text-[10px] flex items-center gap-1">
                        <KeyRound size={9} />
                        PIN pendente
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`badge ${u.ativo ? 'bg-success/10 text-success border border-success/20' : 'bg-dark-700 text-muted border border-dark-600'}`}
                  >
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  <button
                    onClick={() => toggleAtivo(u)}
                    disabled={ehEu}
                    className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      u.ativo
                        ? 'bg-danger/10 text-danger hover:bg-danger/20'
                        : 'bg-success/10 text-success hover:bg-success/20'
                    }`}
                    title={u.ativo ? 'Desativar' : 'Ativar'}
                  >
                    {u.ativo ? <UserX size={16} /> : <UserCheck size={16} />}
                  </button>
                  <button
                    onClick={() => excluir(u)}
                    disabled={ehEu}
                    className="w-9 h-9 rounded-md flex items-center justify-center bg-dark-700 text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Excluir conta"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setModal({ modo: 'criar' })}
        aria-label="Nova conta"
        disabled={!catalogo}
        className="fixed bottom-24 lg:bottom-8 right-4 lg:right-8 w-14 h-14 rounded-lg bg-accent-400 flex items-center justify-center shadow-[0_0_24px_-4px_rgba(139,92,246,0.6)] text-dark-950 hover:bg-accent-300 transition-colors z-30 text-2xl font-light disabled:opacity-40"
      >
        +
      </button>

      {modal && catalogo && (
        <ModalUsuario
          modo={modal.modo}
          usuario={modal.usuario}
          catalogo={catalogo}
          euId={meuUser?.id}
          onClose={() => setModal(null)}
          onSalvo={buscar}
        />
      )}
    </div>
  );
}
