import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, UserX, ChevronRight, Pencil, Phone, User } from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';
import { Overlay } from '../components/ui/index.js';
import BotaoFlutuante from '../components/ui/BotaoFlutuante.jsx';

function fmtTel(tel) {
  if (!tel) return null;
  const d = String(tel).replace(/\D/g, '');
  if (d.length === 13)
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 5)} ${d.slice(5, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return tel;
}

function ModalEdicao({ tecnico, onClose, onSalvo }) {
  const toast = useToast();
  const [nome, setNome] = useState(tecnico.nome);
  const [tel, setTel] = useState(tecnico.telefoneDisplay || '');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      const telLimpo = tel.trim().replace(/\D/g, '') || null;
      await api.patch(`/tecnicos/${tecnico.id}`, {
        nome: nome.trim(),
        telefoneDisplay: telLimpo,
      });
      toast('Técnico atualizado', 'success');
      onSalvo();
      onClose();
    } catch {
      toast('Erro ao salvar', 'error');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Overlay open onClose={onClose} title="Editar técnico" size="sm">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div>
          <label className="kpi-label block mb-2">
            <User size={12} className="inline mr-1" />
            Nome
          </label>
          <input
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
            autoFocus
          />
        </div>

        <div>
          <label className="kpi-label block mb-2">
            <Phone size={12} className="inline mr-1" />
            Telefone (com DDI e DDD)
          </label>
          <input
            className="input"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            placeholder="5511912345678"
            inputMode="numeric"
          />
          <p className="text-muted text-xs mt-1">Ex: 5511912345678 — sem espaços ou traços</p>
        </div>

        <div className="flex gap-3 mt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !nome.trim()} className="btn-primary flex-1">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function CardTecnico({ tecnico, onToggle, onEditar }) {
  const navigate = useNavigate();
  const telFormatado = fmtTel(tecnico.telefone);

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        {tecnico.fotoPerfil ? (
          <img
            src={tecnico.fotoPerfil}
            alt={tecnico.nome}
            className="w-11 h-11 rounded-md object-cover shrink-0 border border-dark-600"
          />
        ) : (
          <div
            className={`w-11 h-11 rounded-md flex items-center justify-center font-display font-bold text-lg shrink-0 ${
              tecnico.ativo
                ? 'bg-accent-400 text-dark-950'
                : 'bg-dark-700 text-muted border border-dark-600'
            }`}
          >
            {tecnico.nome.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white truncate">{tecnico.nome}</p>
            <span
              className={`badge ${
                tecnico.ativo
                  ? 'bg-success/10 text-success border border-success/20'
                  : 'bg-dark-700 text-muted border border-dark-600'
              }`}
            >
              {tecnico.ativo ? 'Ativo' : 'Inativo'}
            </span>
            <span
              className={`badge ${
                tecnico.ehDono
                  ? 'bg-accent-400/10 text-accent-300 border border-accent-400/20'
                  : 'bg-dark-700 text-muted border border-dark-600'
              }`}
            >
              {tecnico.ehDono ? 'Dono' : 'Funcionário'}
            </span>
          </div>
          <p className="text-xs mt-0.5 flex items-center gap-1">
            <Phone size={11} className={telFormatado ? 'text-muted' : 'text-danger/60'} />
            {telFormatado ? (
              <span className="text-muted">{telFormatado}</span>
            ) : (
              <span className="text-danger/70 italic">Telefone não informado</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onEditar(tecnico)}
            className="w-9 h-9 rounded-md flex items-center justify-center bg-dark-700 border border-dark-600 text-muted hover:text-accent-300 hover:border-dark-500 transition-colors"
            title="Editar nome e telefone"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => onToggle(tecnico.id, !tecnico.ativo)}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
              tecnico.ativo
                ? 'bg-danger/10 text-danger hover:bg-danger/20'
                : 'bg-success/10 text-success hover:bg-success/20'
            }`}
            title={tecnico.ativo ? 'Desativar' : 'Ativar'}
          >
            {tecnico.ativo ? <UserX size={16} /> : <UserCheck size={16} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-3">
        <div className="bg-dark-700 border border-dark-600 rounded-md p-2 text-center">
          <p className="kpi-label text-[10px]">Serviços</p>
          <p className="font-display font-bold text-white text-lg tnum">{tecnico.totalServicos}</p>
        </div>
        <div className="bg-dark-700 border border-dark-600 rounded-md p-2 text-center">
          <p className="kpi-label text-[10px]">Líquido</p>
          <p className="font-display font-bold text-white text-sm tnum">
            {formatarMoeda(tecnico.receitaLiquida)}
          </p>
        </div>
        <div className="bg-dark-700 border border-dark-600 rounded-md p-2 text-center">
          <p className="kpi-label text-[10px]">Comissão</p>
          <p className="font-display font-bold text-white text-sm tnum">{tecnico.comissao}%</p>
        </div>
        <div
          className={`rounded-md p-2 text-center border ${tecnico.saldoPendente > 0 ? 'bg-accent-400/10 border-accent-400/20' : 'bg-dark-700 border-dark-600'}`}
        >
          <p
            className={`kpi-label text-[10px] ${tecnico.saldoPendente > 0 ? 'text-accent-300' : ''}`}
          >
            Pendente
          </p>
          <p
            className={`font-display font-bold text-sm tnum ${tecnico.saldoPendente > 0 ? 'text-accent-300' : 'text-white'}`}
          >
            {formatarMoeda(tecnico.saldoPendente)}
          </p>
        </div>
      </div>

      <button
        onClick={() => navigate(`/tecnicos/${tecnico.id}`, { viewTransition: true })}
        className="flex items-center gap-1.5 text-accent-300 text-xs mt-3 hover:text-accent-400 transition-colors"
      >
        Ver perfil completo
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

export default function Tecnicos() {
  const toast = useToast();
  const navigate = useNavigate();
  const [tecnicos, setTecnicos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [editando, setEditando] = useState(null);

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const { data } = await api.get('/tecnicos');
      setTecnicos(data);
    } catch {
      setErro('Não foi possível carregar os técnicos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    buscar();
  }, [buscar]);

  async function toggleAtivo(id, novoStatus) {
    try {
      const { data } = await api.patch(`/tecnicos/${id}`, { ativo: novoStatus });
      setTecnicos((prev) => prev.map((t) => (t.id === id ? { ...t, ativo: data.ativo } : t)));
      toast(`Técnico ${novoStatus ? 'ativado' : 'desativado'}`, 'success');
    } catch {
      toast('Erro ao atualizar técnico', 'error');
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 pt-6 pb-4">
        <p className="section-label mb-1">
          <span className="w-5 h-px bg-accent-400" /> EQUIPE
        </p>
        <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">
          Técnicos
        </h1>
        <p className="text-muted text-xs mt-0.5 tnum">
          {tecnicos.length} cadastrado{tecnicos.length !== 1 ? 's' : ''}
        </p>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      <div className="px-4 pb-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {carregando ? (
          <div className="lg:col-span-2 xl:col-span-3">
            <SkeletonLista qtd={4} />
          </div>
        ) : /* Falha de carregamento nao e evidencia de lista vazia: com `erro`,
               a lista continua desconhecida. Afirmar "Nenhum técnico cadastrado"
               aqui — ainda por cima com CTA de cadastro — declara um fato que
               nao esta em evidencia. O ErroBanner acima ja comunica o estado e
               oferece o retry. (DOG-002 / F-DOG-002) */
        tecnicos.length === 0 && !erro ? (
          <div className="lg:col-span-2 xl:col-span-3">
            <EstadoVazio
              mensagem="Nenhum técnico cadastrado"
              sub="Toque no + para adicionar um técnico, ou ele é criado automaticamente ao registrar serviços no WhatsApp"
              cta={{ label: 'Adicionar técnico', to: '/tecnicos/novo' }}
            />
          </div>
        ) : (
          tecnicos.map((t) => (
            <CardTecnico key={t.id} tecnico={t} onToggle={toggleAtivo} onEditar={setEditando} />
          ))
        )}
      </div>

      {/* FAB — adicionar técnico (wizard) */}
      <BotaoFlutuante onClick={() => navigate('/tecnicos/novo')} rotulo="Adicionar técnico">
        +
      </BotaoFlutuante>

      {editando && (
        <ModalEdicao tecnico={editando} onClose={() => setEditando(null)} onSalvo={buscar} />
      )}
    </div>
  );
}
