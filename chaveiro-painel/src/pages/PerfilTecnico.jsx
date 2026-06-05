import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  ArrowLeft, Wallet, ClipboardList, TrendingUp, DollarSign,
  CheckCircle, ChevronDown, ChevronUp, UserX, UserCheck, Target,
} from 'lucide-react';
import api, { formatarMoeda, formatarData, formatarDataCurta } from '../lib/api.js';
import { SkeletonLista, SkeletonKpi } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';

const PERIODOS = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
  { value: 'custom', label: 'Custom' },
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-500 rounded-md px-3 py-2 text-xs shadow-panel">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold tnum">
          {p.name === 'comissao' ? 'Comissão: ' : 'Receita: '}
          {formatarMoeda(p.value)}
        </p>
      ))}
    </div>
  );
}

function ModalPagamento({ tecnico, onConfirm, onClose }) {
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const toast = useToast();

  async function handleSubmit(e) {
    e.preventDefault();
    const num = parseFloat(valor.replace(',', '.'));
    if (!num || num <= 0) { toast('Informe um valor válido', 'warning'); return; }
    if (num > tecnico.saldoPendente) { toast('Valor maior que o saldo pendente', 'warning'); return; }

    setSalvando(true);
    try {
      await api.post('/pagamentos', { tecnicoId: tecnico.id, valor: num, descricao: descricao || undefined });
      toast('Pagamento registrado!', 'success');
      onConfirm();
    } catch {
      toast('Erro ao registrar pagamento', 'error');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-lg w-full max-w-sm p-5 animate-slide-up shadow-panel">
        <h3 className="font-display font-bold text-xl text-white mb-1 uppercase tracking-wide">Registrar Pagamento</h3>
        <p className="text-muted text-sm mb-4">
          Saldo pendente: <span className="text-accent-300 font-semibold tnum">{formatarMoeda(tecnico.saldoPendente)}</span>
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="kpi-label block mb-1.5">Valor pago (R$) *</label>
            <input
              type="number" step="0.01" min="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="input"
              autoFocus
            />
          </div>
          <div>
            <label className="kpi-label block mb-1.5">Descrição (opcional)</label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Pagamento semanal"
              className="input"
            />
          </div>
          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={salvando} className="btn-primary flex-1">
              {salvando ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PerfilTecnico() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [periodo, setPeriodo] = useState('mes');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [modalPagamento, setModalPagamento] = useState(false);
  const [historicoExpandido, setHistoricoExpandido] = useState(false);
  const [editandoComissao, setEditandoComissao] = useState(false);
  const [novaComissao, setNovaComissao] = useState('');
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [novaMeta, setNovaMeta] = useState('');

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const params = new URLSearchParams({ periodo });
      if (periodo === 'custom' && inicio && fim) {
        params.set('inicio', inicio);
        params.set('fim', fim);
      }
      const { data } = await api.get(`/tecnicos/${id}/perfil?${params}`);
      setDados(data);
      setNovaComissao(String(data.tecnico.comissao));
      setNovaMeta(data.tecnico.metaMensal != null ? String(data.tecnico.metaMensal) : '');
    } catch {
      setErro('Não foi possível carregar o perfil.');
    } finally {
      setCarregando(false);
    }
  }, [id, periodo, inicio, fim]);

  useEffect(() => {
    setCarregando(true);
    buscar();
  }, [buscar]);

  async function salvarComissao() {
    const num = parseFloat(novaComissao);
    if (isNaN(num) || num < 0 || num > 100) { toast('Valor inválido (0-100%)', 'warning'); return; }
    try {
      await api.patch(`/tecnicos/${id}`, { comissao: num });
      toast('Comissão atualizada', 'success');
      setEditandoComissao(false);
      buscar();
    } catch { toast('Erro ao atualizar comissão', 'error'); }
  }

  async function salvarMeta() {
    const txt = novaMeta.trim().replace(',', '.');
    // Campo vazio = remover meta (envia null)
    const valor = txt === '' ? null : parseFloat(txt);
    if (valor !== null && (isNaN(valor) || valor < 0)) { toast('Valor de meta inválido', 'warning'); return; }
    try {
      await api.patch(`/tecnicos/${id}`, { metaMensal: valor });
      toast(valor === null ? 'Meta removida' : 'Meta atualizada', 'success');
      setEditandoMeta(false);
      buscar();
    } catch { toast('Erro ao atualizar meta', 'error'); }
  }

  async function toggleAtivo() {
    try {
      await api.patch(`/tecnicos/${id}`, { ativo: !dados.tecnico.ativo });
      toast(`Técnico ${dados.tecnico.ativo ? 'desativado' : 'ativado'}`, 'success');
      buscar();
    } catch { toast('Erro ao atualizar', 'error'); }
  }

  const t = dados?.tecnico;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/tecnicos')}
          aria-label="Voltar"
          className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-muted hover:text-accent-300 hover:border-dark-500"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-2xl font-bold text-white uppercase tracking-wide">
          {t?.nome ?? 'Perfil'}
        </h1>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      {carregando ? (
        <div className="px-4 flex flex-col gap-3">
          <SkeletonKpi /><SkeletonKpi /><SkeletonLista qtd={3} />
        </div>
      ) : dados && (
        <div className="px-4 pb-8 flex flex-col gap-5">

          {/* Avatar + info + ações */}
          <div className="card flex items-center gap-4">
            {t.fotoPerfil ? (
              <img src={t.fotoPerfil} alt={t.nome}
                className="w-16 h-16 rounded-md object-cover shrink-0 border border-dark-600" />
            ) : (
              <div className="w-16 h-16 rounded-md bg-accent-400 flex items-center justify-center font-display font-bold text-2xl text-dark-950 shrink-0">
                {t.nome.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-base">{t.nome}</p>
              {t.telefone && (
                <p className="text-muted text-xs mt-0.5">📱 {t.telefone}</p>
              )}
              <span className={`badge mt-1 ${t.ativo ? 'bg-success/10 text-success border border-success/20' : 'bg-dark-700 text-muted border border-dark-600'}`}>
                {t.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <button
              onClick={toggleAtivo}
              aria-label={t.ativo ? 'Desativar' : 'Ativar'}
              className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors shrink-0 ${t.ativo ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}
            >
              {t.ativo ? <UserX size={16} /> : <UserCheck size={16} />}
            </button>
          </div>

          {/* Configuração de comissão */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="kpi-label">Percentual de comissão</p>
              {!editandoComissao && (
                <button onClick={() => setEditandoComissao(true)}
                  className="text-xs text-accent-300 hover:text-accent-400">
                  Editar
                </button>
              )}
            </div>
            {editandoComissao ? (
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" max="100" step="0.5"
                  value={novaComissao}
                  onChange={(e) => setNovaComissao(e.target.value)}
                  className="input flex-1 py-2"
                />
                <span className="text-muted">%</span>
                <button onClick={salvarComissao} className="btn-primary py-2 px-4 w-auto">Salvar</button>
                <button onClick={() => setEditandoComissao(false)} className="btn-ghost py-2 px-3">✕</button>
              </div>
            ) : (
              <p className="font-display text-4xl font-bold text-accent-300 tnum">{t.comissao}%</p>
            )}
          </div>

          {/* Meta mensal + barra de progresso */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="kpi-label flex items-center gap-1.5">
                <Target size={13} className="text-accent-300" />
                Meta mensal (receita líquida)
              </p>
              {!editandoMeta && (
                <button onClick={() => setEditandoMeta(true)}
                  className="text-xs text-accent-300 hover:text-accent-400">
                  {dados.meta?.metaMensal ? 'Editar' : 'Definir'}
                </button>
              )}
            </div>

            {editandoMeta ? (
              <div className="flex items-center gap-2">
                <span className="text-muted text-sm">R$</span>
                <input
                  type="number" min="0" step="50"
                  value={novaMeta}
                  onChange={(e) => setNovaMeta(e.target.value)}
                  placeholder="Sem meta"
                  className="input flex-1 py-2"
                />
                <button onClick={salvarMeta} className="btn-primary py-2 px-4 w-auto">Salvar</button>
                <button onClick={() => setEditandoMeta(false)} className="btn-ghost py-2 px-3">✕</button>
              </div>
            ) : dados.meta?.metaMensal ? (
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="font-display text-2xl font-bold text-white">
                    {formatarMoeda(dados.meta.receitaMes)}
                  </p>
                  <p className="text-muted text-sm">de {formatarMoeda(dados.meta.metaMensal)}</p>
                </div>
                <div className="h-3 rounded-full bg-dark-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${dados.meta.atingida ? 'bg-success' : 'bg-accent-400'}`}
                    style={{ width: `${Math.min(100, dados.meta.progresso ?? 0)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`text-xs font-semibold tnum ${dados.meta.atingida ? 'text-success' : 'text-accent-300'}`}>
                    {dados.meta.progresso}%
                  </span>
                  <span className="text-xs text-muted">
                    {dados.meta.atingida ? '🎉 Meta atingida!' : `Faltam ${formatarMoeda(Math.max(0, dados.meta.metaMensal - dados.meta.receitaMes))}`}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-muted text-sm">
                Sem meta definida. <span className="text-accent-300 tnum">{formatarMoeda(dados.meta?.receitaMes ?? 0)}</span> líquidos este mês.
              </p>
            )}
          </div>

          {/* Saldo financeiro */}
          <div className="card">
            <h2 className="section-label mb-3"><span className="w-5 h-px bg-accent-400" /> FINANCEIRO</h2>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-dark-700 border border-dark-600 rounded-md p-3 text-center">
                <p className="kpi-label text-[10px]">Total Gerado</p>
                <p className="font-display font-bold text-white text-base tnum">{formatarMoeda(t.totalComissaoGanha)}</p>
              </div>
              <div className="bg-dark-700 border border-dark-600 rounded-md p-3 text-center">
                <p className="kpi-label text-[10px]">Já Recebido</p>
                <p className="font-display font-bold text-success text-base tnum">{formatarMoeda(t.totalRecebido)}</p>
              </div>
              <div className="bg-accent-400/10 rounded-md p-3 text-center border border-accent-400/20">
                <p className="kpi-label text-[10px] text-accent-300">Pendente</p>
                <p className="font-display font-bold text-accent-300 text-base tnum">{formatarMoeda(t.saldoPendente)}</p>
              </div>
            </div>
            {t.saldoPendente > 0 && (
              <button
                onClick={() => setModalPagamento(true)}
                className="btn-primary flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} />
                Registrar Pagamento
              </button>
            )}

            {/* Histórico de pagamentos */}
            {dados.pagamentos.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setHistoricoExpandido(!historicoExpandido)}
                  className="flex items-center gap-1.5 text-muted text-xs hover:text-white"
                >
                  {historicoExpandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Histórico de pagamentos ({dados.pagamentos.length})
                </button>
                {historicoExpandido && (
                  <div className="mt-3 space-y-2 animate-fade-in">
                    {dados.pagamentos.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-dark-700 last:border-0">
                        <div>
                          <p className="text-white text-xs font-medium">{p.descricao || 'Pagamento'}</p>
                          <p className="text-muted text-xs">{formatarData(p.criadoEm)}</p>
                        </div>
                        <p className="font-display font-bold text-success text-sm">{formatarMoeda(p.valor)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Seletor de período para métricas */}
          <div>
            <div className="flex gap-2 mb-3">
              {PERIODOS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriodo(p.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold uppercase tracking-wide transition-all ${
                    periodo === p.value ? 'bg-accent-400 text-dark-950' : 'bg-dark-700 text-muted border border-dark-600 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodo === 'custom' && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input py-2 text-sm" />
                <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="input py-2 text-sm" />
              </div>
            )}
          </div>

          {/* KPIs do período */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Serviços', valor: dados.periodo.totalServicos, icon: ClipboardList, cor: 'text-sky-300 bg-sky-400/10' },
              { label: 'Receita Líquida', valor: formatarMoeda(dados.periodo.receitaLiquida), icon: TrendingUp, cor: 'text-accent-300 bg-accent-400/10' },
              { label: 'Comissão Gerada', valor: formatarMoeda(dados.periodo.comissaoGerada), icon: DollarSign, cor: 'text-success bg-success/10' },
              { label: 'Ticket Médio', valor: dados.periodo.totalServicos > 0 ? formatarMoeda(dados.periodo.receitaLiquida / dados.periodo.totalServicos) : 'R$ 0,00', icon: Wallet, cor: 'text-indigo-300 bg-indigo-400/10' },
            ].map(({ label, valor, icon: Icon, cor }) => (
              <div key={label} className="card flex items-center gap-3">
                <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${cor}`}>
                  <Icon size={18} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="kpi-label text-[10px] truncate">{label}</p>
                  <p className="font-display font-bold text-white text-lg leading-tight tnum">{valor}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Gráfico evolução diária */}
          {dados.periodo.evolucaoDiaria.length > 1 && (
            <div className="card">
              <h2 className="section-label mb-3"><span className="w-5 h-px bg-accent-400" /> EVOLUÇÃO NO PERÍODO</h2>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={dados.periodo.evolucaoDiaria} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#262B34" strokeDasharray="3 3" />
                  <XAxis dataKey="data" tick={{ fill: '#9AA3B2', fontSize: 9 }}
                    tickFormatter={(v) => formatarDataCurta(v)} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#9AA3B2', fontSize: 9 }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(34,211,238,0.06)' }} />
                  <Bar dataKey="receita" fill="#22D3EE" radius={[3, 3, 0, 0]} name="receita" />
                  <Bar dataKey="comissao" fill="#34D399" radius={[3, 3, 0, 0]} name="comissao" />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-3 h-3 rounded-sm bg-accent-400 inline-block" />Receita</span>
                <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-3 h-3 rounded-sm bg-success inline-block" />Comissão</span>
              </div>
            </div>
          )}

          {/* Lista de serviços do período */}
          <div>
            <h2 className="section-label mb-3">
              <span className="w-5 h-px bg-accent-400" /> SERVIÇOS NO PERÍODO ({dados.periodo.totalServicos})
            </h2>
            {dados.periodo.servicos.length === 0 ? (
              <EstadoVazio mensagem="Nenhum serviço neste período" sub="Tente ampliar o filtro de datas" />
            ) : (
              <div className="flex flex-col gap-2">
                {dados.periodo.servicos.map((s) => (
                  <div key={s.id} className="card flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{s.descricao}</p>
                      <p className="text-muted text-xs mt-0.5">{formatarData(s.criadoEm)} · {s.local}</p>
                      {s.comissaoGerada > 0 && (
                        <p className="text-success text-xs mt-0.5">Comissão: {formatarMoeda(s.comissaoGerada)}</p>
                      )}
                    </div>
                    <p className="font-display font-bold text-accent-300 text-lg shrink-0 tnum">
                      {formatarMoeda(s.valorLiquido)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {modalPagamento && dados && (
        <ModalPagamento
          tecnico={dados.tecnico}
          onConfirm={() => { setModalPagamento(false); buscar(); }}
          onClose={() => setModalPagamento(false)}
        />
      )}
    </div>
  );
}
