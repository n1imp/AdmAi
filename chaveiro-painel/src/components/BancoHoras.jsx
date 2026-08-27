import { useState, useEffect, useCallback } from 'react';
import { Download, Loader2, Clock, AlertTriangle, FileText, FileSpreadsheet } from 'lucide-react';
import api from '../lib/api.js';
import { SkeletonLista } from './Skeleton.jsx';
import EstadoVazio from './EstadoVazio.jsx';
import ErroBanner from './ErroBanner.jsx';
import { useToast } from './Toast.jsx';

// Mês atual no formato YYYY-MM.
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Converte minutos em "Xh Ymin" (com sinal preservado para saldos negativos).
function fmtMin(min) {
  if (min == null) return '—';
  const neg = min < 0;
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const corpo = h > 0 ? `${h}h ${m}min` : `${m}min`;
  return neg ? `-${corpo}` : corpo;
}

// Hora HH:MM de um ISO; "—" se ausente.
function fmtHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

// Dia/mês de uma data ISO/YYYY-MM-DD.
function fmtDia(d) {
  if (!d) return '—';
  const data = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

export default function BancoHoras({ tecnicoId }) {
  const toast = useToast();
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [baixando, setBaixando] = useState(null); // 'pdf' | 'csv' | null

  const buscar = useCallback(async () => {
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.get(`/tecnicos/${tecnicoId}/ponto?mes=${mes}`);
      setDados(data);
    } catch {
      setErro('Não foi possível carregar o banco de horas.');
    } finally {
      setCarregando(false);
    }
  }, [tecnicoId, mes]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  async function baixar(formato) {
    setBaixando(formato);
    try {
      const { data: blob } = await api.get(`/tecnicos/${tecnicoId}/ponto/relatorio`, {
        params: { mes, formato },
        responseType: 'blob',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `banco_horas_${mes}.${formato}`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast('Relatório baixado', 'success');
    } catch {
      toast('Erro ao baixar relatório', 'error');
    } finally {
      setBaixando(null);
    }
  }

  const dias = dados?.dias ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Seletor de mês + downloads */}
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <label className="kpi-label block mb-1.5">Mês de referência</label>
          <input
            type="month"
            className="input"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => baixar('pdf')}
            disabled={baixando !== null || !dados}
            className="btn-ghost flex items-center gap-1.5 px-3 disabled:opacity-50"
          >
            {baixando === 'pdf' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileText size={14} />
            )}{' '}
            PDF
          </button>
          <button
            onClick={() => baixar('csv')}
            disabled={baixando !== null || !dados}
            className="btn-ghost flex items-center gap-1.5 px-3 disabled:opacity-50"
          >
            {baixando === 'csv' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileSpreadsheet size={14} />
            )}{' '}
            CSV
          </button>
        </div>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      {carregando ? (
        <SkeletonLista qtd={4} />
      ) : !dados ? null : (
        <>
          {/* Totais */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-dark-700 border border-dark-600 rounded-md p-3 text-center">
              <p className="kpi-label text-[10px]">Trabalhado</p>
              <p className="font-display font-bold text-white text-base tnum">
                {fmtMin(dados.totalTrabalhadoMin)}
              </p>
            </div>
            <div className="bg-dark-700 border border-dark-600 rounded-md p-3 text-center">
              <p className="kpi-label text-[10px]">Hora extra</p>
              <p className="font-display font-bold text-accent-300 text-base tnum">
                {fmtMin(dados.horaExtraMin)}
              </p>
            </div>
            <div
              className={`rounded-md p-3 text-center border ${(dados.saldoBancoMin ?? 0) < 0 ? 'bg-danger/10 border-danger/20' : 'bg-success/10 border-success/20'}`}
            >
              <p className="kpi-label text-[10px]">Saldo banco</p>
              <p
                className={`font-display font-bold text-base tnum ${(dados.saldoBancoMin ?? 0) < 0 ? 'text-danger' : 'text-success'}`}
              >
                {fmtMin(dados.saldoBancoMin)}
              </p>
            </div>
          </div>

          {/* Tabela de dias */}
          {dias.length === 0 ? (
            <EstadoVazio
              mensagem="Sem registros neste mês"
              sub="Os registros aparecem quando o técnico bate ponto pelo painel."
            />
          ) : (
            <div className="card overflow-x-auto">
              <h2 className="section-label mb-3">
                <span className="w-5 h-px bg-accent-400" /> REGISTROS DO MÊS
              </h2>
              <table className="w-full text-xs min-w-[520px]">
                <thead>
                  <tr className="text-left">
                    <th className="kpi-label text-[10px] pb-2">Dia</th>
                    <th className="kpi-label text-[10px] pb-2">Entrada</th>
                    <th className="kpi-label text-[10px] pb-2">Almoço</th>
                    <th className="kpi-label text-[10px] pb-2">Volta</th>
                    <th className="kpi-label text-[10px] pb-2">Saída</th>
                    <th className="kpi-label text-[10px] pb-2 text-right">Horas</th>
                    <th className="kpi-label text-[10px] pb-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {dias.map((d) => (
                    <tr key={d.data} className="border-t border-dark-700">
                      <td className="py-2 text-white font-medium tnum">{fmtDia(d.data)}</td>
                      <td className="py-2 text-muted tnum">{fmtHora(d.entradaEm)}</td>
                      <td className="py-2 text-muted tnum">{fmtHora(d.almocoSaidaEm)}</td>
                      <td className="py-2 text-muted tnum">{fmtHora(d.almocoVoltaEm)}</td>
                      <td className="py-2 text-muted tnum">{fmtHora(d.saidaEm)}</td>
                      <td className="py-2 text-white text-right tnum">{fmtMin(d.totalMinutos)}</td>
                      <td
                        className={`py-2 text-right tnum font-semibold ${(d.saldoMinutos ?? 0) < 0 ? 'text-danger' : 'text-success'}`}
                      >
                        {fmtMin(d.saldoMinutos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Aviso gerencial */}
          <div className="bg-warning/5 border border-warning/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" strokeWidth={1.8} />
            <p className="text-muted text-xs leading-relaxed">
              <span className="text-warning font-semibold flex items-center gap-1 mb-0.5">
                <Clock size={12} /> Cálculo gerencial
              </span>
              Este banco de horas é uma ferramenta de gestão e{' '}
              <strong className="text-white">não substitui</strong> o controle oficial de jornada da
              folha de pagamento nem orientação jurídica/contábil.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
