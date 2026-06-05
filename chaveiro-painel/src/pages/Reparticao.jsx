import { useState } from 'react';
import { Download, Calculator } from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';

function hoje() {
  return new Date().toISOString().split('T')[0];
}

function inicioMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function Reparticao() {
  const toast = useToast();

  const [inicio, setInicio] = useState(inicioMes());
  const [fim, setFim] = useState(hoje());
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState(null);

  async function calcular() {
    setCarregando(true);
    setErro(null);
    try {
      const { data } = await api.get(`/dashboard?periodo=custom&inicio=${inicio}&fim=${fim}`);
      setDados(data);
    } catch {
      setErro('Não foi possível calcular a repartição.');
    } finally {
      setCarregando(false);
    }
  }

  async function exportarPDF() {
    setExportando(true);
    try {
      // Força download via anchor tag — o browser trata o blob corretamente
      const token = localStorage.getItem('chaveiro_token');
      const url = `/api/relatorio/pdf?inicio=${inicio}&fim=${fim}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Falha ao gerar PDF');

      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `relatorio_${inicio}_${fim}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);

      toast('PDF exportado com sucesso!', 'success');
    } catch {
      toast('Erro ao exportar PDF', 'error');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <p className="section-label mb-1"><span className="w-5 h-px bg-accent-400" /> FECHAMENTO</p>
        <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">Repartição</h1>
        <p className="text-muted text-xs mt-0.5">Período por técnico</p>
      </div>

      {/* Seletor de período */}
      <div className="px-4 mb-4 lg:max-w-3xl">
        <div className="card flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="kpi-label block mb-1.5">De</label>
              <input
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="input py-2"
              />
            </div>
            <div>
              <label className="kpi-label block mb-1.5">Até</label>
              <input
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="input py-2"
              />
            </div>
          </div>
          <button onClick={calcular} disabled={carregando} className="btn-primary flex items-center justify-center gap-2">
            <Calculator size={18} />
            {carregando ? 'Calculando...' : 'Calcular'}
          </button>
        </div>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={calcular} />}

      {carregando && (
        <div className="px-4">
          <SkeletonLista qtd={4} />
        </div>
      )}

      {!carregando && dados && (
        <div className="px-4 pb-6 flex flex-col gap-4 lg:max-w-3xl">
          {/* Resumo consolidado */}
          <div className="card">
            <h2 className="section-label mb-3"><span className="w-5 h-px bg-accent-400" /> CONSOLIDADO</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-dark-700 border border-dark-600 rounded-md p-3 text-center">
                <p className="kpi-label text-[10px]">Total Serviços</p>
                <p className="font-display font-bold text-white text-2xl tnum">{dados.totalServicos}</p>
              </div>
              <div className="bg-dark-700 border border-dark-600 rounded-md p-3 text-center">
                <p className="kpi-label text-[10px]">Ticket Médio</p>
                <p className="font-display font-bold text-white text-2xl tnum">{formatarMoeda(dados.ticketMedio)}</p>
              </div>
              <div className="bg-dark-700 border border-dark-600 rounded-md p-3 text-center">
                <p className="kpi-label text-[10px]">Receita Bruta</p>
                <p className="font-display font-bold text-white text-2xl tnum">{formatarMoeda(dados.receitaBruta)}</p>
              </div>
              <div className="bg-accent-400/10 rounded-md p-3 text-center border border-accent-400/20">
                <p className="kpi-label text-[10px] text-accent-300">Rec. Líquida</p>
                <p className="font-display font-bold text-accent-300 text-2xl tnum">{formatarMoeda(dados.receitaLiquida)}</p>
              </div>
            </div>
          </div>

          {/* Tabela por técnico */}
          {dados.porTecnico.length === 0 ? (
            <EstadoVazio mensagem="Nenhum serviço no período" />
          ) : (
            <div className="card">
              <h2 className="section-label mb-3"><span className="w-5 h-px bg-accent-400" /> POR TÉCNICO</h2>

              {/* Cabeçalho da tabela */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 pb-2 border-b border-dark-600 mb-2">
                <span className="kpi-label text-[10px]">Técnico</span>
                <span className="kpi-label text-[10px] text-right">Svç.</span>
                <span className="kpi-label text-[10px] text-right">Líquido</span>
                <span className="kpi-label text-[10px] text-right">%</span>
              </div>

              {dados.porTecnico.map((t, idx) => (
                <div
                  key={t.tecnico}
                  className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 py-2.5 items-center ${
                    idx < dados.porTecnico.length - 1 ? 'border-b border-dark-700' : ''
                  }`}
                >
                  <div>
                    <p className="text-white text-sm font-medium">{t.tecnico}</p>
                    <p className="text-muted text-xs">Bruto: {formatarMoeda(t.receitaBruta)}</p>
                  </div>
                  <span className="text-white text-sm text-right font-semibold tnum">{t.servicos}</span>
                  <span className="font-display font-bold text-accent-300 text-right tnum">
                    {formatarMoeda(t.receitaLiquida)}
                  </span>
                  <span className="text-muted text-xs text-right tnum">{t.percentualReceita}%</span>
                </div>
              ))}

              {/* Total */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 pt-3 mt-1 border-t-2 border-accent-400/40">
                <span className="text-white font-bold text-sm">Total</span>
                <span className="text-white font-bold text-sm text-right tnum">{dados.totalServicos}</span>
                <span className="font-display font-bold text-accent-300 text-right tnum">
                  {formatarMoeda(dados.receitaLiquida)}
                </span>
                <span className="text-accent-300 text-xs text-right font-bold tnum">100%</span>
              </div>
            </div>
          )}

          {/* Botão exportar PDF */}
          {dados.porTecnico.length > 0 && (
            <button
              onClick={exportarPDF}
              disabled={exportando}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Download size={18} />
              {exportando ? 'Gerando PDF...' : 'Exportar PDF'}
            </button>
          )}
        </div>
      )}

      {/* Estado inicial */}
      {!carregando && !dados && !erro && (
        <div className="px-4">
          <EstadoVazio
            mensagem="Selecione o período"
            sub="Defina as datas de início e fim e clique em Calcular"
          />
        </div>
      )}
    </div>
  );
}
