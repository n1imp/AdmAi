import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { MapPin, Settings2, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react';
import { formatarMoeda, formatarDataCurta } from '../lib/api.js';
import { TooltipMoeda } from './DashboardParts.jsx';
import { WIDGETS_OPS } from './DashboardWidgetsOps.jsx';
import { useWidgetPrefs } from '../hooks/useWidgetPrefs.js';

// Paleta categórica Aurora para os gráficos (violeta de marca + tokens de dados)
const CORES_LOCAL = ['#a78bfa', '#38bdf8', '#2dd4bf', '#6ee7b7', '#fcd34d', '#f472b6'];

function WidgetTecnicos({ dados }) {
  return (
    <div className="px-4 lg:px-0 mb-6">
      <h2 className="section-label mb-3">
        <span className="w-5 h-px bg-accent-400" /> DESEMPENHO POR TÉCNICO
      </h2>
      {/* Gráfico decorativo: a lista abaixo é a alternativa textual (O-11). */}
      <div className="card p-3 mb-3" aria-hidden="true">
        <ResponsiveContainer width="100%" height={dados.porTecnico.length * 48 + 20}>
          <BarChart
            layout="vertical"
            data={dados.porTecnico}
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fill: '#9AA3B2', fontSize: 10 }}
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="tecnico"
              type="category"
              tick={{ fill: '#E6E9EF', fontSize: 11, fontWeight: 600 }}
              width={70}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<TooltipMoeda />} cursor={{ fill: 'rgba(167,139,250,0.08)' }} />
            <Bar dataKey="receitaLiquida" fill="#a78bfa" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-2">
        {dados.porTecnico.map((t) => (
          <div key={t.tecnico} className="card flex items-center gap-3 py-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{t.tecnico}</p>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted tnum">
                <span>{t.servicos} serv.</span>
                <span>tkt {formatarMoeda(t.ticketMedio)}</span>
                <span className="text-indigo-300">com. {formatarMoeda(t.comissao)}</span>
              </div>
            </div>
            <span className="badge bg-accent-400/10 text-accent-300 border-accent-400/20 shrink-0 tnum">
              {t.percentualReceita}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetLocal({ dados }) {
  return (
    <div className="px-4 lg:px-0 mb-6">
      <h2 className="section-label mb-3">
        <MapPin size={14} className="text-accent-300" /> RECEITA POR LOCAL
      </h2>
      <div className="card p-3">
        <div aria-hidden="true">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={dados.porLocal}
                dataKey="receita"
                nameKey="local"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
              >
                {dados.porLocal.map((entry, i) => (
                  <Cell
                    key={entry.local}
                    fill={CORES_LOCAL[i % CORES_LOCAL.length]}
                    stroke="#15181F"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<TooltipMoeda />} />
              <Legend
                formatter={(value) => <span className="text-xs text-muted">{value}</span>}
                iconType="circle"
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Alternativa textual do gráfico de pizza (O-11) */}
        <ul className="sr-only">
          {dados.porLocal.map((l) => (
            <li key={l.local}>
              {l.local}: {formatarMoeda(l.receita)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function WidgetEvolucao({ dados }) {
  return (
    <div className="px-4 lg:px-0 mb-6">
      <h2 className="section-label mb-3">
        <span className="w-5 h-px bg-accent-400" /> EVOLUÇÃO DIÁRIA
      </h2>
      <div className="card p-3">
        <div aria-hidden="true">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart
              data={dados.evolucaoDiaria}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#262B34" strokeDasharray="3 3" />
              <XAxis
                dataKey="data"
                tick={{ fill: '#9AA3B2', fontSize: 10 }}
                tickFormatter={(v) => formatarDataCurta(v)}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#9AA3B2', fontSize: 10 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<TooltipMoeda />} />
              <Line
                type="monotone"
                dataKey="receita"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#38bdf8' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Alternativa textual do gráfico de linha (O-11) */}
        <p className="sr-only">
          Evolução da receita em {dados.evolucaoDiaria.length} dias: de{' '}
          {formatarMoeda(dados.evolucaoDiaria[0].receita)} em{' '}
          {formatarDataCurta(dados.evolucaoDiaria[0].data)} a{' '}
          {formatarMoeda(dados.evolucaoDiaria.at(-1).receita)} em{' '}
          {formatarDataCurta(dados.evolucaoDiaria.at(-1).data)}.
        </p>
      </div>
    </div>
  );
}

const WIDGETS = [
  {
    id: 'tecnicos',
    label: 'Desempenho por técnico',
    disponivel: (d) => d?.porTecnico?.length > 0,
    Render: WidgetTecnicos,
  },
  {
    id: 'local',
    label: 'Receita por local',
    disponivel: (d) => d?.porLocal?.length > 0,
    Render: WidgetLocal,
  },
  {
    id: 'evolucao',
    label: 'Evolução diária',
    disponivel: (d) => d?.evolucaoDiaria?.length > 1,
    Render: WidgetEvolucao,
  },
  // F7: widgets operacionais (auto-suficientes, endpoints existentes) — ver DashboardWidgetsOps.jsx.
  ...WIDGETS_OPS,
];
const IDS = WIDGETS.map((w) => w.id);
const btnControle =
  'flex items-center justify-center h-11 w-11 rounded-md border border-dark-600 bg-dark-700 text-muted hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

// F4d: painéis do dashboard do Dono reordenáveis/ocultáveis, com controles acessíveis
// (não dependem de arrastar) e persistência local. Os itens essenciais (herói e KPIs) não
// entram aqui — ficam sempre visíveis no Dashboard.
export default function DashboardWidgets({ dados }) {
  const { ordem, ocultos, editando, setEditando, mover, alternarVisibilidade, anuncio } =
    useWidgetPrefs(IDS);
  const ordenados = ordem.map((id) => WIDGETS.find((w) => w.id === id)).filter(Boolean);

  return (
    <div>
      <div className="px-4 flex justify-end mb-2">
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          aria-pressed={editando}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-accent-300 min-h-[44px] px-2"
        >
          <Settings2 size={15} /> {editando ? 'Concluir' : 'Personalizar'}
        </button>
      </div>

      {editando && (
        <div className="px-4 mb-4">
          <div className="card flex flex-col gap-3">
            <p className="kpi-label">Ordem e visibilidade dos painéis</p>
            {ordenados.map((w, i) => (
              <div key={w.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-white min-w-0 truncate">{w.label}</span>
                <button
                  type="button"
                  onClick={() => mover(w.id, -1, w.label)}
                  disabled={i === 0}
                  aria-label={`Mover ${w.label} para cima`}
                  className={btnControle}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => mover(w.id, 1, w.label)}
                  disabled={i === ordenados.length - 1}
                  aria-label={`Mover ${w.label} para baixo`}
                  className={btnControle}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => alternarVisibilidade(w.id, w.label)}
                  aria-pressed={!ocultos.has(w.id)}
                  aria-label={ocultos.has(w.id) ? `Exibir ${w.label}` : `Ocultar ${w.label}`}
                  className={btnControle}
                >
                  {ocultos.has(w.id) ? (
                    <EyeOff size={16} aria-hidden="true" />
                  ) : (
                    <Eye size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:px-4">
        {ordenados
          .filter((w) => !ocultos.has(w.id) && w.disponivel(dados))
          .map((w) => (
            <w.Render key={w.id} dados={dados} />
          ))}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {anuncio}
      </p>
    </div>
  );
}
