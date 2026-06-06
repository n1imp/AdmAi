import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Wifi, WifiOff, Loader2, QrCode, RefreshCw, Users, Star, Save, Link as LinkIcon, AlertTriangle, Smartphone, Power, HelpCircle } from 'lucide-react';
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
  const [desconectando, setDesconectando] = useState(false);
  const [configIncompleta, setConfigIncompleta] = useState(false);
  const [faltando, setFaltando] = useState([]);
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
      setConfigIncompleta(Boolean(data.configIncompleta));
      setFaltando(Array.isArray(data.faltando) ? data.faltando : []);
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

  async function desconectar() {
    setDesconectando(true);
    setErro(null);
    try {
      await api.post('/whatsapp/desconectar');
      setEstado('desconectado');
      setQr(null);
      setGrupos([]);
      await buscarStatus();
    } catch (e) {
      setErro(e.response?.data?.erro ?? 'Falha ao desconectar o WhatsApp.');
    } finally {
      setDesconectando(false);
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

      {/* Banner de configuração incompleta no servidor */}
      {configIncompleta && (
        <div className="mx-4 bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 mb-6">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" strokeWidth={1.8} />
            <div className="min-w-0">
              <p className="text-warning text-sm font-semibold">Configuração pendente no servidor</p>
              <p className="text-muted text-xs mt-1">
                {faltando.length > 0
                  ? <>Faltam definir: <strong className="text-white">{faltando.join(', ')}</strong>. Peça ao administrador para configurar no .env.</>
                  : 'Há variáveis de ambiente faltando. Peça ao administrador para configurar no .env.'}
              </p>
              <Link to="/ajuda" className="text-warning text-xs font-medium inline-flex items-center gap-1 mt-2 hover:underline">
                <HelpCircle size={12} /> Como configurar
              </Link>
            </div>
          </div>
        </div>
      )}

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
            {config.numeroDisplay && (
              <div className="flex items-center gap-1.5 text-muted text-xs bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5">
                <Smartphone size={13} className="text-success" />
                <span>Número conectado: <strong className="text-white">{config.numeroDisplay}</strong></span>
              </div>
            )}
            <button onClick={desconectar} disabled={desconectando}
              className="flex items-center gap-2 px-5 py-2 rounded-lg border border-danger/30 text-danger text-sm font-medium hover:bg-danger/10 transition-colors disabled:opacity-50">
              {desconectando ? <Loader2 size={15} className="animate-spin" /> : <Power size={15} />}
              {desconectando ? 'Desconectando…' : 'Desconectar'}
            </button>
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center gap-4">
            <div className="card p-4 flex flex-col items-center gap-3">
              <div className="bg-white rounded-xl p-3">
                <img src={qr} alt="QR Code WhatsApp" className="w-56 h-56 block" />
              </div>
              <p className="text-muted text-xs text-center flex items-center gap-1">
                <RefreshCw size={11} /> Atualizado automaticamente a cada 4s
              </p>
              <ComoConectar />
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
            <button onClick={conectar} disabled={conectando || configIncompleta}
              className="btn-primary flex items-center gap-2 px-6 disabled:opacity-50 disabled:cursor-not-allowed">
              {conectando ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
              {conectando ? 'Gerando…' : 'Conectar'}
            </button>
            {configIncompleta && (
              <p className="text-warning text-xs text-center flex items-center gap-1">
                <AlertTriangle size={11} /> Conexão indisponível até o servidor ser configurado.
              </p>
            )}
            <div className="w-full max-w-xs">
              <ComoConectar />
            </div>
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
          {estado === 'conectado' && !carregandoGrupos && grupos.length === 0 && (
            <p className="text-muted text-xs mt-1">Nenhum grupo encontrado — confirme que o número do bot participa de algum grupo.</p>
          )}
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

// Mini-guia compacto de 3 passos para vincular o aparelho
function ComoConectar() {
  const passos = [
    'Abra o WhatsApp no celular',
    'Toque em Aparelhos conectados → Conectar um aparelho',
    'Aponte a câmera para o QR Code acima',
  ];
  return (
    <div className="w-full rounded-lg bg-dark-700/60 border border-dark-600 p-3">
      <p className="text-white text-xs font-semibold flex items-center gap-1.5 mb-2">
        <Smartphone size={13} className="text-success" /> Como conectar
      </p>
      <ol className="space-y-1.5">
        {passos.map((passo, i) => (
          <li key={i} className="flex items-start gap-2 text-muted text-xs">
            <span className="shrink-0 w-4 h-4 rounded-full bg-success/15 text-success text-[10px] font-bold flex items-center justify-center mt-px">
              {i + 1}
            </span>
            <span>{passo}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
