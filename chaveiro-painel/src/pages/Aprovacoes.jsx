import { useState, useEffect, useCallback } from 'react';
import {
  Check, X, Calendar, MapPin, User, HardHat, Loader2,
} from 'lucide-react';
import api, { formatarMoeda, formatarData } from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';

function CardPendente({ servico, onAprovar, onRejeitar, processando }) {
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="card animate-fade-in">
      {/* Técnico */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-accent-300 shrink-0">
          <HardHat size={16} strokeWidth={1.8} />
        </div>
        <span className="font-semibold text-white text-sm truncate">{servico.tecnico?.nome ?? 'Técnico'}</span>
        <span className="badge bg-dark-700 text-muted border border-dark-600 ml-auto">{servico.local}</span>
      </div>

      <p className="text-white text-sm font-medium">{servico.descricao}</p>

      {servico.clienteNome && (
        <p className="text-muted text-xs mt-1.5 flex items-center gap-1 truncate">
          <User size={11} className="shrink-0" /> {servico.clienteNome}
        </p>
      )}
      <p className="text-xs text-dark-600 mt-1 flex items-center gap-1">
        <Calendar size={11} /> {formatarData(servico.criadoEm)}
      </p>

      {/* Valores */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="bg-dark-700 border border-dark-600 rounded-md p-2 text-center">
          <p className="kpi-label text-[10px]">Cobrado</p>
          <p className="font-display font-bold text-white text-base tnum">{formatarMoeda(servico.valorCobrado)}</p>
        </div>
        <div className="bg-indigo-400/10 border border-indigo-400/20 rounded-md p-2 text-center">
          <p className="kpi-label text-[10px] text-indigo-300">Comissão</p>
          <p className="font-display font-bold text-indigo-300 text-base tnum">{formatarMoeda(servico.comissaoGerada)}</p>
        </div>
      </div>

      {/* Ações */}
      {!confirmando ? (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onAprovar(servico.id)}
            disabled={processando}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-md bg-success/15 border border-success/30 text-success font-semibold text-sm hover:bg-success/25 transition-colors disabled:opacity-50"
          >
            {processando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Aprovar
          </button>
          <button
            onClick={() => setConfirmando(true)}
            disabled={processando}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-md bg-danger/10 border border-danger/30 text-danger font-semibold text-sm hover:bg-danger/20 transition-colors disabled:opacity-50"
          >
            <X size={16} /> Rejeitar
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 mt-3 rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5">
          <p className="text-danger text-xs flex-1">Rejeitar este serviço?</p>
          <button
            onClick={() => onRejeitar(servico.id)}
            disabled={processando}
            className="text-xs font-semibold text-danger hover:text-red-300 disabled:opacity-50"
          >
            Sim, rejeitar
          </button>
          <button
            onClick={() => setConfirmando(false)}
            disabled={processando}
            className="text-xs text-muted hover:text-white"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

export default function Aprovacoes() {
  const toast = useToast();
  const [pendentes, setPendentes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [processando, setProcessando] = useState(null); // id em processamento

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const { data } = await api.get('/servicos/pendentes');
      setPendentes(Array.isArray(data) ? data : []);
    } catch {
      setErro('Não foi possível carregar a fila de aprovação.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  async function aprovar(id) {
    setProcessando(id);
    try {
      await api.post(`/servicos/${id}/aprovar`);
      setPendentes((prev) => prev.filter((s) => s.id !== id));
      toast('Serviço aprovado', 'success');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Não foi possível aprovar.', 'error');
    } finally {
      setProcessando(null);
    }
  }

  async function rejeitar(id) {
    setProcessando(id);
    try {
      await api.post(`/servicos/${id}/rejeitar`);
      setPendentes((prev) => prev.filter((s) => s.id !== id));
      toast('Serviço rejeitado', 'success');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Não foi possível rejeitar.', 'error');
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Aprovações" />
      <p className="px-4 -mt-0.5 mb-2 text-muted text-xs tnum">
        {pendentes.length > 0
          ? `${pendentes.length} serviço${pendentes.length !== 1 ? 's' : ''} aguardando`
          : 'Fila de aprovação dos funcionários'}
      </p>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8 flex flex-col gap-3">
        {carregando ? (
          <SkeletonLista qtd={4} />
        ) : pendentes.length === 0 ? (
          <EstadoVazio
            mensagem="Nenhum serviço aguardando aprovação"
            sub="Os serviços enviados pelos funcionários aparecerão aqui"
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {pendentes.map((s) => (
              <CardPendente
                key={s.id}
                servico={s}
                onAprovar={aprovar}
                onRejeitar={rejeitar}
                processando={processando === s.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
