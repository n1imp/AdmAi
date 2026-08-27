import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { UserCheck, UserX, ShieldCheck, Trash2, Users, FileText } from 'lucide-react';
import api from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * AUDITORIA consultável (USER GATE D3). A trilha (AuditLog) era gravada mas invisível;
 * esta tela a torna consultável pelo dono/admin. O backend (GET /auditoria, adminOnly)
 * é a autoridade — este autogate por `isAdmin` só evita a viagem e o flash de 403.
 */

// Rótulos legíveis por ação (as mesmas ações que services/auditoria.js grava).
const ACOES = {
  'usuario.criado': { rotulo: 'Usuário criado', icon: UserCheck, cor: 'text-success' },
  'usuario.desativado': { rotulo: 'Usuário desativado', icon: UserX, cor: 'text-warning' },
  'usuario.permissoes_alteradas': {
    rotulo: 'Permissões alteradas',
    icon: ShieldCheck,
    cor: 'text-accent-300',
  },
  'usuario.excluido': { rotulo: 'Usuário excluído', icon: Trash2, cor: 'text-danger' },
  'convite.enviado': { rotulo: 'Convite enviado', icon: Users, cor: 'text-sky-300' },
  'lgpd.cliente_anonimizado': {
    rotulo: 'Dados de cliente anonimizados',
    icon: ShieldCheck,
    cor: 'text-indigo-300',
  },
  'conta.excluida': { rotulo: 'Conta excluída', icon: Trash2, cor: 'text-danger' },
};

function metaAcao(acao) {
  return ACOES[acao] ?? { rotulo: acao, icon: FileText, cor: 'text-muted' };
}

// Resumo curto e legível do que mudou — a partir do DTO já filtrado pelo backend.
function descreverDetalhe(evento) {
  const d = evento.depois;
  const a = evento.antes;
  switch (evento.acao) {
    case 'usuario.criado':
      return d?.nome ? `${d.nome}${d.papel ? ` · ${d.papel}` : ''}` : null;
    case 'usuario.excluido':
      return a?.nome ? `${a.nome}${a.papel ? ` · ${a.papel}` : ''}` : null;
    case 'usuario.permissoes_alteradas':
      return a?.papel && d?.papel && a.papel !== d.papel
        ? `papel: ${a.papel} → ${d.papel}`
        : 'permissões atualizadas';
    case 'convite.enviado':
      return d?.email ? `${d.email}${d.papel ? ` · ${d.papel}` : ''}` : null;
    case 'lgpd.cliente_anonimizado':
      return `${d?.servicosAnonimizados ?? 0} serviço(s), ${d?.avaliacoesAnonimizadas ?? 0} avaliação(ões)`;
    case 'conta.excluida':
      return d?.escopo === 'empresa'
        ? `empresa inteira${d?.usuariosAfetados != null ? ` · ${d.usuariosAfetados} usuário(s)` : ''}`
        : 'conta de usuário';
    default:
      return null;
  }
}

function dataHora(iso) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function LinhaEvento({ evento }) {
  const meta = metaAcao(evento.acao);
  const Icon = meta.icon;
  const detalhe = descreverDetalhe(evento);
  return (
    <div className="card flex items-start gap-3">
      <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 border border-dark-600 bg-dark-700">
        <Icon size={17} className={meta.cor} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">{meta.rotulo}</p>
        {detalhe && <p className="text-muted text-xs mt-0.5 truncate">{detalhe}</p>}
        <p className="text-muted text-[11px] mt-1">
          {dataHora(evento.criadoEm)}
          {evento.autorNome ? ` · por ${evento.autorNome}` : ''}
          {evento.ip ? ` · ${evento.ip}` : ''}
        </p>
      </div>
    </div>
  );
}

export default function Auditoria() {
  const { isAdmin } = useAuth();
  const [itens, setItens] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState(null);

  const buscar = useCallback(async (cursorAtual) => {
    setErro(null);
    try {
      const params = new URLSearchParams({ take: '20' });
      if (cursorAtual) params.set('cursor', String(cursorAtual));
      const { data } = await api.get(`/auditoria?${params}`);
      setItens((prev) => (cursorAtual ? [...prev, ...data.itens] : data.itens));
      setCursor(data.proximoCursor);
    } catch {
      setErro('Não foi possível carregar a auditoria.');
    } finally {
      setCarregando(false);
      setCarregandoMais(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) buscar(null);
  }, [isAdmin, buscar]);

  // Autogate: espelha o adminOnly do backend (que continua autoritativo).
  if (!isAdmin) return <Navigate to="/configuracao" replace />;

  function carregarMais() {
    if (!cursor || carregandoMais) return;
    setCarregandoMais(true);
    buscar(cursor);
  }

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Auditoria" />

      <div className="px-4 pt-2 pb-4">
        <p className="text-muted text-xs">
          Registro das ações administrativas da sua empresa (usuários, permissões e privacidade).
        </p>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={() => buscar(null)} />}

      <div className="flex-1 overflow-y-auto px-4 pb-24 flex flex-col gap-3 lg:max-w-2xl">
        {carregando ? (
          <SkeletonLista qtd={4} />
        ) : itens.length === 0 && !erro ? (
          <EstadoVazio
            mensagem="Nenhum evento registrado ainda"
            sub="As ações administrativas (criar usuário, alterar permissões, anonimizar dados) aparecerão aqui."
          />
        ) : (
          <>
            {itens.map((ev) => (
              <LinhaEvento key={ev.id} evento={ev} />
            ))}
            {cursor && (
              <button
                onClick={carregarMais}
                disabled={carregandoMais}
                className="btn-ghost mt-1 self-center disabled:opacity-50"
              >
                {carregandoMais ? 'Carregando…' : 'Carregar mais'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
