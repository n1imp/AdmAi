import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle,
  ClipboardList,
  Users,
  Boxes,
  ArrowRight,
  Wallet,
  HandCoins,
  Target,
} from 'lucide-react';
import api, { formatarMoeda, formatarData } from '../lib/api.js';
import { PageHeader, Surface, Row, FeedbackState } from '../components/ui/index.js';
import { SkeletonLista, SkeletonKpi } from '../components/Skeleton.jsx';
import { KpiCard, CardSatisfacao } from './DashboardParts.jsx';

// Home operacional do Gestor (PR2 + PR4): distinta do dashboard financeiro do Dono.
// F7: além das ações e da fila recente, surfacing de indicadores do período, aprovações
// pendentes e satisfação — tudo reusando endpoints já existentes (dashboard.ver, aprovacoes.ver,
// avaliacoes.ver). Sem mudanças de backend/RBAC.
const ACOES = [
  { to: '/aprovacoes', label: 'Aprovações', sub: 'Revisar serviços pendentes', icon: CheckCircle },
  { to: '/servicos', label: 'Serviços', sub: 'Fila e histórico completo', icon: ClipboardList },
  { to: '/tecnicos', label: 'Equipe', sub: 'Técnicos e desempenho', icon: Users },
  { to: '/estoque', label: 'Estoque', sub: 'Saldo e reposição', icon: Boxes },
];

const PERIODOS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
];

export default function GestorHome() {
  const [periodo, setPeriodo] = useState('mes');
  const [dados, setDados] = useState(null);
  const [carregandoKpis, setCarregandoKpis] = useState(true);
  const [pendentes, setPendentes] = useState(null);
  const [satisfacao, setSatisfacao] = useState(null);
  const [servicos, setServicos] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  // Indicadores do período (financeiro da empresa) — refaz ao trocar o período.
  useEffect(() => {
    let vivo = true;
    setCarregandoKpis(true);
    api
      .get(`/dashboard?periodo=${periodo}`)
      .then(({ data }) => {
        if (vivo) setDados(data);
      })
      .catch(() => {
        if (vivo) setDados(null);
      })
      .finally(() => {
        if (vivo) setCarregandoKpis(false);
      });
    return () => {
      vivo = false;
    };
  }, [periodo]);

  // Operacional (independe do período): fila recente, contagem de pendências e satisfação.
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(false);
    (async () => {
      try {
        const [rec, pend, aval] = await Promise.all([
          api.get('/servicos?limit=5'),
          api.get('/servicos/pendentes').catch(() => ({ data: [] })),
          api.get('/avaliacoes').catch(() => ({ data: null })),
        ]);
        if (!vivo) return;
        setServicos(rec.data.data ?? []);
        setTotal(rec.data.total ?? 0);
        const listaPend = Array.isArray(pend.data) ? pend.data : (pend.data?.data ?? []);
        setPendentes(listaPend.length);
        setSatisfacao(aval.data?.resumo ?? null);
      } catch {
        if (vivo) setErro(true);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const comp = dados?.comparativo ?? {};

  return (
    <div className="animate-fade-in pb-4">
      <PageHeader
        eyebrow="OPERAÇÃO"
        title="Operação de hoje"
        subtitle="Indicadores, fila de serviços, aprovações e equipe."
      />

      {/* Período dos indicadores */}
      <div className="px-4 flex gap-2 mb-4 flex-wrap" aria-label="Período dos indicadores">
        {PERIODOS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            aria-pressed={periodo === p.value}
            className={`px-4 py-1.5 rounded-md text-xs font-display font-semibold uppercase tracking-wider transition-all ${
              periodo === p.value
                ? 'bg-accent-400 text-dark-950'
                : 'bg-dark-700 text-muted border border-dark-600 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Indicadores do período */}
      <div className="px-4 grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {carregandoKpis ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} announce={i === 0} />)
        ) : dados ? (
          <>
            <KpiCard
              label="Serviços"
              valor={dados.totalServicos}
              icon={ClipboardList}
              cor="blue"
              variacao={comp.totalServicos}
            />
            <KpiCard
              label="Receita Líquida"
              valor={formatarMoeda(dados.receitaLiquida)}
              icon={Wallet}
              cor="green"
              variacao={comp.receitaLiquida}
            />
            <KpiCard
              label="Comissões"
              valor={formatarMoeda(dados.totalComissao)}
              icon={HandCoins}
              cor="indigo"
            />
            <KpiCard
              label="Ticket Médio"
              valor={formatarMoeda(dados.ticketMedio)}
              icon={Target}
              cor="accent"
              variacao={comp.ticketMedio}
            />
          </>
        ) : null}
      </div>

      {/* Aprovações pendentes + Satisfação */}
      <div className="px-4 grid gap-3 sm:grid-cols-2 mb-4">
        <Link
          to="/aprovacoes"
          className={`card flex items-center gap-3 hover:border-dark-500 transition-colors ${
            pendentes ? 'border-warning/30 bg-warning/5' : ''
          }`}
        >
          <div
            className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
              pendentes ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
            }`}
          >
            <CheckCircle size={20} strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="kpi-label truncate">Aprovações pendentes</p>
            <p className="kpi-value text-2xl mt-0.5 tnum">{pendentes == null ? '—' : pendentes}</p>
          </div>
          <ArrowRight size={16} className="text-muted shrink-0" aria-hidden="true" />
        </Link>

        <CardSatisfacao resumo={satisfacao} />
      </div>

      {/* Ações operacionais */}
      <nav aria-label="Ações operacionais" className="px-4 grid gap-3 sm:grid-cols-2">
        {ACOES.map(({ to, label, sub, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="card flex items-center gap-4 hover:border-dark-500 transition-colors min-h-[64px]"
          >
            <div className="w-11 h-11 rounded-md bg-accent-400/10 border border-dark-600 flex items-center justify-center shrink-0">
              <Icon size={20} className="text-accent-300" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">{label}</p>
              <p className="text-muted text-xs mt-0.5">{sub}</p>
            </div>
            <ArrowRight size={16} className="text-muted shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </nav>

      <section className="px-4 mt-6" aria-labelledby="servicos-recentes-titulo">
        <div className="flex items-center justify-between mb-2">
          <h2 id="servicos-recentes-titulo" className="section-label">
            <span className="w-5 h-px bg-accent-400" /> SERVIÇOS RECENTES
          </h2>
          <Link to="/servicos" className="text-xs text-accent-300 hover:text-accent-400">
            Ver todos{total ? ` (${total})` : ''}
          </Link>
        </div>

        {erro ? (
          <FeedbackState state="error" compact title="Não foi possível carregar os serviços." />
        ) : carregando ? (
          <SkeletonLista qtd={4} />
        ) : servicos.length === 0 ? (
          <FeedbackState
            state="empty"
            compact
            title="Nenhum serviço ainda"
            description="Os serviços registrados aparecerão aqui."
          />
        ) : (
          <Surface className="overflow-hidden">
            {servicos.map((s) => (
              <Row
                key={s.id}
                as={Link}
                to={`/servicos?servico=${s.id}`}
                className="last:!border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm truncate">
                    {s.tecnico?.nome ?? 'Sem técnico'}
                  </p>
                  <p className="text-muted text-xs truncate">
                    {s.local} · {formatarData(s.criadoEm)}
                  </p>
                </div>
                <p className="font-display font-bold text-accent-300 text-sm tnum shrink-0">
                  {formatarMoeda(s.valorLiquido)}
                </p>
              </Row>
            ))}
          </Surface>
        )}
      </section>
    </div>
  );
}
