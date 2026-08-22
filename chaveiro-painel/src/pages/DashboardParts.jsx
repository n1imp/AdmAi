import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Star } from 'lucide-react';
import { formatarMoeda } from '../lib/api.js';

// Componentes de apresentação do Dashboard, extraídos para manter cada arquivo < 500 linhas.

// Cores semânticas dos KPIs no tema Industrial Técnico
const CORES_KPI = {
  accent: 'text-accent-300 bg-accent-400/10',
  green: 'text-success bg-success/10',
  red: 'text-danger bg-danger/10',
  indigo: 'text-indigo-300 bg-indigo-400/10',
  blue: 'text-sky-300 bg-sky-400/10',
};

function Variacao({ valor }) {
  if (valor == null) return null;
  const positivo = valor >= 0;
  const Icon = positivo ? TrendingUp : TrendingDown;
  const cor = positivo ? 'text-success' : 'text-danger';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${cor}`}>
      <Icon size={12} strokeWidth={2.2} />
      {Math.abs(valor)}%
    </span>
  );
}

/**
 * `hubEm` transforma o card em porta de entrada do Metric Hub daquele indicador — o Dashboard
 * segue cockpit resumido, e o aprofundamento vive na página própria. Sem `hubEm` o card continua
 * exatamente como era: nenhum card existente muda de comportamento por acidente.
 */
export function KpiCard({ label, valor, icon: Icon, cor = 'accent', variacao, hubEm }) {
  const conteudo = (
    <>
      <div
        className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${CORES_KPI[cor]}`}
      >
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        {/* Sem `truncate`: cortar o rótulo esconde QUAL número está sendo mostrado, que é a
            única coisa que o rótulo faz. Quebra em até duas linhas quando não couber —
            os cards da grade esticam juntos, então o alinhamento se mantém. [GAP-UI-03] */}
        <p className="kpi-label line-clamp-2">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="kpi-value text-2xl mt-0.5">{valor}</p>
          {variacao !== undefined && <Variacao valor={variacao} />}
        </div>
      </div>
    </>
  );

  if (!hubEm) return <div className="card flex items-center gap-3">{conteudo}</div>;

  return (
    <Link
      to={hubEm}
      className="card flex items-center gap-3 transition-colors hover:border-accent-400/60
                 focus:outline-none focus:ring-2 focus:ring-accent-400/40"
      aria-label={`${label}: abrir análise detalhada`}
    >
      {conteudo}
    </Link>
  );
}

export function TooltipMoeda({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-500 rounded-md px-3 py-2 text-xs shadow-panel">
      {label != null && <p className="text-muted mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold tnum">
          {formatarMoeda(p.value)}
        </p>
      ))}
    </div>
  );
}

// Card de satisfação dos clientes (média + distribuição 1–5)
export function CardSatisfacao({ resumo }) {
  const media = resumo?.media;
  const total = resumo?.total ?? 0;
  return (
    <div className="card flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div>
          <p className="kpi-label flex items-center gap-1.5">
            <Star size={12} className="text-warning" /> Satisfação
          </p>
          {total > 0 ? (
            <p className="font-display text-4xl font-bold text-white tracking-tight mt-1 tnum">
              {media?.toFixed(1)}
              <span className="text-lg text-muted">/5</span>
            </p>
          ) : (
            <p className="font-display text-2xl font-bold text-muted mt-2">Sem avaliações</p>
          )}
          {total > 0 && (
            <p className="text-muted text-xs mt-1">
              {/* O sufixo 'ões' substitui 'ão', não se soma a ele: antes saía
                  "5 avaliaçãoões respondidas" para qualquer contagem diferente de 1. */}
              {total} avaliaç{total !== 1 ? 'ões' : 'ão'} respondida{total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {total > 0 && (
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                size={16}
                className={n <= Math.round(media) ? 'text-warning fill-warning' : 'text-dark-500'}
                strokeWidth={1.5}
              />
            ))}
          </div>
        )}
      </div>
      {/* Mini distribuição */}
      {total > 0 && (
        <div className="mt-3">
          <div className="flex items-end gap-1.5 h-10" aria-hidden="true">
            {(resumo.distribuicao ?? []).map((d) => {
              const max = Math.max(1, ...resumo.distribuicao.map((x) => x.quantidade));
              const h = Math.max(8, (d.quantidade / max) * 100);
              return (
                <div key={d.nota} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-accent-400/70 rounded-sm" style={{ height: `${h}%` }} />
                  <span className="text-[9px] text-muted">{d.nota}</span>
                </div>
              );
            })}
          </div>
          {/* Alternativa textual da distribuição de notas (O-11) */}
          <p className="sr-only">
            Distribuição das notas:{' '}
            {(resumo.distribuicao ?? []).map((d) => `${d.quantidade} de nota ${d.nota}`).join(', ')}
            .
          </p>
        </div>
      )}
    </div>
  );
}
