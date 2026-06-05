import { useState, useEffect, useCallback } from 'react';
import { Star, Clock, Send, CheckCircle2, Phone, RefreshCw, MessageSquareQuote } from 'lucide-react';
import api, { formatarData } from '../lib/api.js';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';

const FILTROS = [
  { value: '', label: 'Todas' },
  { value: 'respondida', label: 'Respondidas' },
  { value: 'enviada', label: 'Enviadas' },
  { value: 'pendente', label: 'Agendadas' },
];

const STATUS_META = {
  pendente: { label: 'Agendada', Icon: Clock, cor: 'text-muted', bg: 'bg-dark-700 border-dark-600' },
  enviada: { label: 'Enviada', Icon: Send, cor: 'text-sky-300', bg: 'bg-sky-400/10 border-sky-400/20' },
  respondida: { label: 'Respondida', Icon: CheckCircle2, cor: 'text-success', bg: 'bg-success/10 border-success/20' },
  expirada: { label: 'Expirada', Icon: Clock, cor: 'text-muted', bg: 'bg-dark-700 border-dark-600' },
};

function Estrelas({ nota, size = 14 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size}
          className={n <= (nota ?? 0) ? 'text-warning fill-warning' : 'text-dark-500'}
          strokeWidth={1.5} />
      ))}
    </div>
  );
}

export default function Avaliacoes() {
  const [dados, setDados] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const params = filtro ? `?status=${filtro}` : '';
      const { data } = await api.get(`/avaliacoes${params}`);
      setDados(data);
    } catch {
      setErro('Não foi possível carregar as avaliações.');
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => { setCarregando(true); buscar(); }, [buscar]);

  const resumo = dados?.resumo;
  const lista = dados?.avaliacoes ?? [];
  const maxDist = Math.max(1, ...(resumo?.distribuicao ?? []).map((d) => d.quantidade));

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
          <p className="section-label mb-1"><span className="w-5 h-px bg-accent-400" /> FEEDBACK DOS CLIENTES</p>
          <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">Avaliações</h1>
        </div>
        <button onClick={buscar} aria-label="Atualizar"
          className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-muted hover:text-accent-300 hover:border-dark-500 transition-colors">
          <RefreshCw size={17} className={carregando ? 'animate-spin' : ''} />
        </button>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      {/* Resumo: média + distribuição */}
      {!carregando && resumo && (
        <div className="px-4 mb-4 grid gap-3 lg:grid-cols-2">
          <div className="card-accent flex items-center justify-between">
            <div>
              <p className="kpi-label">Nota média</p>
              {resumo.total > 0 ? (
                <>
                  <p className="font-display text-5xl font-bold text-white tracking-tight mt-1 tnum">
                    {resumo.media?.toFixed(1)}<span className="text-xl text-muted">/5</span>
                  </p>
                  <div className="mt-2"><Estrelas nota={Math.round(resumo.media)} size={18} /></div>
                  <p className="text-muted text-xs mt-2">{resumo.total} resposta{resumo.total !== 1 ? 's' : ''}</p>
                </>
              ) : (
                <p className="font-display text-2xl font-bold text-muted mt-3">Sem respostas ainda</p>
              )}
            </div>
          </div>

          {/* Distribuição 1–5 */}
          <div className="card">
            <p className="kpi-label mb-3">Distribuição</p>
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((n) => {
                const d = resumo.distribuicao?.find((x) => x.nota === n) ?? { quantidade: 0 };
                const pct = (d.quantidade / maxDist) * 100;
                return (
                  <div key={n} className="flex items-center gap-2">
                    <span className="flex items-center gap-1 w-8 text-xs text-muted tnum">
                      {n}<Star size={10} className="text-warning fill-warning" />
                    </span>
                    <div className="flex-1 h-2.5 rounded-full bg-dark-700 overflow-hidden">
                      <div className="h-full rounded-full bg-accent-400/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right text-xs text-muted tnum">{d.quantidade}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="px-4 flex gap-2 mb-2 flex-wrap">
        {FILTROS.map((f) => (
          <button key={f.value} onClick={() => setFiltro(f.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold uppercase tracking-wide transition-all ${
              filtro === f.value ? 'bg-accent-400 text-dark-950' : 'bg-dark-700 text-muted border border-dark-600 hover:text-white'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
        {carregando ? (
          <SkeletonLista qtd={5} />
        ) : lista.length === 0 ? (
          <EstadoVazio mensagem="Nenhuma avaliação" sub="As avaliações aparecem aqui após os serviços com cliente." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {lista.map((a) => {
              const st = STATUS_META[a.status] ?? STATUS_META.pendente;
              return (
                <div key={a.id} className="card animate-fade-in">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{a.clienteNome ?? 'Cliente'}</p>
                      <p className="text-xs text-muted flex items-center gap-1 mt-0.5 tnum">
                        <Phone size={11} /> {a.clienteTelefone}
                      </p>
                    </div>
                    <span className={`badge ${st.bg} ${st.cor} shrink-0`}>
                      <st.Icon size={11} /> {st.label}
                    </span>
                  </div>

                  {a.nota != null ? (
                    <div className="mt-3 flex items-center gap-2">
                      <Estrelas nota={a.nota} size={16} />
                      <span className="font-display font-bold text-white tnum">{a.nota}.0</span>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted">
                      {a.status === 'enviada' ? 'Aguardando resposta do cliente…' : `Envio agendado para ${formatarData(a.agendadoPara)}`}
                    </p>
                  )}

                  {a.comentario && a.comentario !== String(a.nota) && (
                    <p className="mt-2 text-sm text-muted flex gap-2">
                      <MessageSquareQuote size={14} className="text-accent-300 shrink-0 mt-0.5" />
                      <span className="italic">"{a.comentario}"</span>
                    </p>
                  )}

                  <p className="text-[11px] text-dark-500 mt-3">
                    {a.respondidoEm ? `Respondida em ${formatarData(a.respondidoEm)}` : `Serviço #${a.servicoId}`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
