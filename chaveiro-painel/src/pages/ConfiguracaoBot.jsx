import { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff, Loader2, QrCode, RefreshCw, Users, Star, Save, Link as LinkIcon } from 'lucide-react';
import api from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';

const ESTADOS = {
  conectado: { label: 'Conectado', cor: 'text-success', bg: 'bg-success/10 border-success/20', Icon: Wifi },
  conectando: { label: 'Conectando…', cor: 'text-warning', bg: 'bg-warning/10 border-warning/20', Icon: Loader2 },
  aguardando_qr: { label: 'Aguardando QR', cor: 'text-warning', bg: 'bg-warning/10 border-warning/20', Icon: QrCode },
  desconectado: { label: 'Desconectado', cor: 'text-danger', bg: 'bg-danger/10 border-danger/20', Icon: WifiOff },
};

export default function ConfiguracaoBot() {
  const [qr, setQr] = useState(null);
  const [estado, setEstado] = useState('desconectado');
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState(null);
  const [config, setConfig] = useState({ grupoJid: null, reviewDelayHoras: 2, reviewLink: '', numeroDisplay: '' });
  const [grupos, setGrupos] = useState([]);
  const [carregandoGrupos, setCarregandoGrupos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const intervalRef = useRef(null);

  async function buscarStatus() {
    try {
      const { data } = await api.get('/whatsapp/status');
      setQr(data.qr);
      setEstado(data.estado);
      setErro(null);
    } catch (e) {
      setErro(e.response?.status === 401 ? 'Sem autorização.' : 'Erro ao conectar com o servidor.');
    } finally {
      setCarregando(false);
    }
  }

  async function buscarConfig() {
    try {
      const { data } = await api.get('/whatsapp/config');
      setConfig({
        grupoJid: data.grupoJid ?? null,
        reviewDelayHoras: data.reviewDelayHoras ?? 2,
        reviewLink: data.reviewLink ?? '',
        numeroDisplay: data.numeroDisplay ?? '',
      });
    } catch { /* silencioso */ }
  }

  async function conectar() {
    setConectando(true);
    setErro(null);
    try {
      const { data } = await api.post('/whatsapp/conectar');
      setQr(data.qr);
      setEstado(data.estado);
    } catch (e) {
      setErro(e.response?.data?.erro ?? 'Falha ao conectar ao gateway WhatsApp.');
    } finally {
      setConectando(false);
    }
  }

  async function carregarGrupos() {
    setCarregandoGrupos(true);
    try {
      const { data } = await api.get('/whatsapp/grupos');
      setGrupos(data);
    } catch (e) {
      setErro(e.response?.data?.erro ?? 'Não foi possível listar os grupos.');
    } finally {
      setCarregandoGrupos(false);
    }
  }

  async function salvarConfig() {
    setSalvando(true);
    setSalvo(false);
    try {
      const payload = {
        grupoJid: config.grupoJid || null,
        reviewDelayHoras: Number(config.reviewDelayHoras) || 0,
        reviewLink: config.reviewLink || '',
        numeroDisplay: config.numeroDisplay || null,
      };
      const { data } = await api.patch('/whatsapp/config', payload);
      setConfig({
        grupoJid: data.grupoJid ?? null,
        reviewDelayHoras: data.reviewDelayHoras ?? 2,
        reviewLink: data.reviewLink ?? '',
        numeroDisplay: data.numeroDisplay ?? '',
      });
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    } catch (e) {
      setErro(e.response?.data?.erro ?? 'Erro ao salvar configuração.');
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    buscarStatus();
    buscarConfig();
    intervalRef.current = setInterval(buscarStatus, 4000);
    return () => clearInterval(intervalRef.current);
  }, []);

  // Quando conecta, já busca os grupos para escolha
  useEffect(() => {
    if (estado === 'conectado' && grupos.length === 0) carregarGrupos();
  }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = ESTADOS[estado] ?? ESTADOS.desconectado;
  const { Icon } = info;

  return (
    <div className="flex flex-col min-h-full pb-8">
      <BackHeader titulo="WhatsApp" />
      <div className="px-4 pt-4 pb-2 mb-2">
        <p className="text-muted text-xs">Conexão do bot com o WhatsApp da sua empresa</p>
      </div>

      {/* Badge de estado */}
      <div className={`mx-4 flex items-center gap-2.5 rounded-xl border px-4 py-3 mb-6 ${info.bg}`}>
        <Icon size={18} className={`${info.cor} ${estado === 'conectando' ? 'animate-spin' : ''}`} strokeWidth={1.8} />
        <div>
          <p className={`font-semibold text-sm ${info.cor}`}>{info.label}</p>
          <p className="text-muted text-xs">
            {estado === 'conectado'
              ? 'O bot está ativo e recebendo mensagens'
              : estado === 'aguardando_qr'
              ? 'Escaneie o QR Code abaixo com o WhatsApp'
              : estado === 'conectando'
              ? 'Estabelecendo conexão com o WhatsApp…'
              : 'O bot não está conectado. Clique em Conectar para gerar o QR.'}
          </p>
        </div>
      </div>

      {erro && (
        <div className="mx-4 bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 mb-6">
          <p className="text-danger text-sm">{erro}</p>
        </div>
      )}

      {/* Conexão / QR */}
      <div className="px-4">
        {carregando ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 size={32} className="text-muted animate-spin" />
            <p className="text-muted text-sm">Verificando conexão…</p>
          </div>
        ) : estado === 'conectado' ? (
          <div className="card flex flex-col items-center gap-4 py-10">
            <div className="w-16 h-16 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center">
              <Wifi size={32} className="text-success" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-white text-lg">Bot conectado!</p>
              <p className="text-muted text-sm mt-1">O ChaveiroBot está ativo nesta empresa.</p>
            </div>
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center gap-4">
            <div className="card p-4 flex flex-col items-center gap-3">
              <p className="text-muted text-xs text-center">
                Abra o WhatsApp → <strong className="text-white">Aparelhos conectados</strong> → Conectar um aparelho
              </p>
              <div className="bg-white rounded-xl p-3">
                <img src={qr} alt="QR Code WhatsApp" className="w-56 h-56 block" />
              </div>
              <p className="text-muted text-xs text-center flex items-center gap-1">
                <RefreshCw size={11} /> Atualizado automaticamente a cada 4s
              </p>
            </div>
          </div>
        ) : (
          <div className="card flex flex-col items-center gap-4 py-10">
            <div className="w-16 h-16 rounded-lg bg-dark-700 border border-dark-600 flex items-center justify-center">
              <QrCode size={32} className="text-muted" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-white text-lg">Conectar WhatsApp</p>
              <p className="text-muted text-sm mt-1">Gere o QR Code para vincular o número da empresa.</p>
            </div>
            <button onClick={conectar} disabled={conectando} className="btn-primary flex items-center gap-2 px-6">
              {conectando ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
              {conectando ? 'Gerando…' : 'Conectar'}
            </button>
          </div>
        )}
      </div>

      {/* Configurações por empresa */}
      <div className="px-4 mt-8 space-y-4">
        <h2 className="font-display font-bold text-white text-base">Configurações</h2>

        {/* Grupo de resumo */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white text-sm font-semibold flex items-center gap-2"><Users size={15} /> Grupo de resumos</p>
            <button onClick={carregarGrupos} disabled={estado !== 'conectado' || carregandoGrupos}
              className="text-muted text-xs flex items-center gap-1 disabled:opacity-40">
              {carregandoGrupos ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Atualizar
            </button>
          </div>
          <p className="text-muted text-xs mb-2">Grupo que recebe o resumo de cada serviço concluído.</p>
          <select
            value={config.grupoJid ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, grupoJid: e.target.value || null }))}
            disabled={estado !== 'conectado'}
            className="input w-full disabled:opacity-50"
          >
            <option value="">— Nenhum grupo selecionado —</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>{g.nome} ({g.participantes})</option>
            ))}
          </select>
          {estado !== 'conectado' && <p className="text-muted text-xs mt-1">Conecte o WhatsApp para listar os grupos.</p>}
        </div>

        {/* Avaliação do cliente */}
        <div className="card p-4 space-y-3">
          <p className="text-white text-sm font-semibold flex items-center gap-2"><Star size={15} /> Avaliação do cliente</p>
          <div>
            <label className="text-muted text-xs">Atraso para pedir avaliação (horas)</label>
            <input type="number" min="0" max="168" value={config.reviewDelayHoras}
              onChange={(e) => setConfig((c) => ({ ...c, reviewDelayHoras: e.target.value }))}
              className="input w-full mt-1" />
          </div>
          <div>
            <label className="text-muted text-xs flex items-center gap-1"><LinkIcon size={11} /> Link de avaliação</label>
            <input type="url" placeholder="https://g.page/sua-empresa/review" value={config.reviewLink}
              onChange={(e) => setConfig((c) => ({ ...c, reviewLink: e.target.value }))}
              className="input w-full mt-1" />
          </div>
        </div>

        <button onClick={salvarConfig} disabled={salvando} className="btn-primary w-full flex items-center justify-center gap-2">
          {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {salvo ? 'Salvo!' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  );
}
