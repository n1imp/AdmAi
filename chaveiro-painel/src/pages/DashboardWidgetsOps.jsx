import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertTriangle, ClipboardList, ArrowRight } from 'lucide-react';
import api, { formatarMoeda, formatarData } from '../lib/api.js';
import { Surface, Row, FeedbackState } from '../components/ui/index.js';
import { SkeletonLista } from '../components/Skeleton.jsx';

// F7 (surfacing): widgets OPERACIONAIS do dashboard do Dono, reusando endpoints já existentes
// (/servicos/pendentes, /estoque, /servicos). Cada um é auto-suficiente (faz o próprio fetch) e
// entra no registro reordenável/ocultável de DashboardWidgets. Widget oculto não monta → não busca.

function useFetch(url, mapear) {
  const [estado, setEstado] = useState({ carregando: true, erro: false, dados: null });
  useEffect(() => {
    let vivo = true;
    setEstado({ carregando: true, erro: false, dados: null });
    api
      .get(url)
      .then(({ data }) => {
        if (vivo) setEstado({ carregando: false, erro: false, dados: mapear(data) });
      })
      .catch(() => {
        if (vivo) setEstado({ carregando: false, erro: true, dados: null });
      });
    return () => {
      vivo = false;
    };
    // mapear é uma transformação pura por widget; só a url determina o refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return estado;
}

const lista = (d) => (Array.isArray(d) ? d : (d?.data ?? []));

function BlocoWidget({ titulo, icon: Icon, children }) {
  return (
    <div className="px-4 lg:px-0 mb-6">
      <h2 className="section-label mb-3">
        <Icon size={14} className="text-accent-300" /> {titulo}
      </h2>
      {children}
    </div>
  );
}

function WidgetAprovacoes() {
  const { carregando, erro, dados } = useFetch('/servicos/pendentes', lista);
  const n = dados?.length ?? 0;
  return (
    <BlocoWidget titulo="APROVAÇÕES PENDENTES" icon={CheckCircle}>
      {carregando ? (
        <SkeletonLista qtd={1} />
      ) : erro ? (
        <FeedbackState state="error" compact title="Não foi possível carregar." />
      ) : (
        <Link
          to="/aprovacoes"
          className={`card flex items-center gap-3 hover:border-dark-500 transition-colors ${
            n ? 'border-warning/30 bg-warning/5' : ''
          }`}
        >
          <div
            className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
              n ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
            }`}
          >
            <CheckCircle size={20} strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="kpi-value text-2xl tnum">{n}</p>
            <p className="text-muted text-xs">
              {n ? 'serviços aguardando aprovação' : 'tudo aprovado'}
            </p>
          </div>
          <ArrowRight size={16} className="text-muted shrink-0" aria-hidden="true" />
        </Link>
      )}
    </BlocoWidget>
  );
}

function WidgetEstoqueBaixo() {
  const { carregando, erro, dados } = useFetch('/estoque?periodo=30', (d) =>
    lista(d).filter((m) => m.alerta)
  );
  return (
    <BlocoWidget titulo="ESTOQUE BAIXO" icon={AlertTriangle}>
      {carregando ? (
        <SkeletonLista qtd={2} />
      ) : erro ? (
        <FeedbackState state="error" compact title="Não foi possível carregar." />
      ) : dados.length === 0 ? (
        <FeedbackState
          state="empty"
          compact
          title="Nenhum alerta de estoque"
          description="Todos os materiais estão acima do mínimo."
        />
      ) : (
        <Surface className="overflow-hidden">
          {dados.slice(0, 5).map((m) => (
            <Row key={m.id} as={Link} to="/estoque" className="last:!border-b-0">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm truncate">{m.nome}</p>
                <p className="text-muted text-xs tnum">
                  mín. {m.estoqueMinimo} {m.unidade}
                </p>
              </div>
              <span className="badge bg-danger/10 text-danger border-danger/20 shrink-0 tnum">
                {m.quantidadeAtual ?? 0} {m.unidade}
              </span>
            </Row>
          ))}
        </Surface>
      )}
    </BlocoWidget>
  );
}

function WidgetOperacao() {
  const { carregando, erro, dados } = useFetch('/servicos?limit=5', (d) => d?.data ?? []);
  return (
    <BlocoWidget titulo="ATIVIDADE RECENTE" icon={ClipboardList}>
      {carregando ? (
        <SkeletonLista qtd={3} />
      ) : erro ? (
        <FeedbackState state="error" compact title="Não foi possível carregar." />
      ) : dados.length === 0 ? (
        <FeedbackState state="empty" compact title="Nenhum serviço ainda" />
      ) : (
        <Surface className="overflow-hidden">
          {dados.map((s) => (
            <Row key={s.id} as={Link} to={`/servicos?servico=${s.id}`} className="last:!border-b-0">
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
    </BlocoWidget>
  );
}

// Entradas de registro (mesmo formato dos widgets de gráfico). `disponivel: () => true` porque
// cada widget resolve o próprio estado (loading/vazio/erro) internamente.
export const WIDGETS_OPS = [
  {
    id: 'aprovacoes',
    label: 'Aprovações pendentes',
    disponivel: () => true,
    Render: WidgetAprovacoes,
  },
  {
    id: 'estoque-baixo',
    label: 'Estoque baixo',
    disponivel: () => true,
    Render: WidgetEstoqueBaixo,
  },
  { id: 'operacao', label: 'Atividade recente', disponivel: () => true, Render: WidgetOperacao },
];
