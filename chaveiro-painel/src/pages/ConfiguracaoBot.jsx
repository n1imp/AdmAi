import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Wifi, WifiOff, Loader2, QrCode, RefreshCw, AlertTriangle, Smartphone, Power, HelpCircle, ShieldCheck, Info } from 'lucide-react';
import api from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';

const ESTADOS = {
  conectado: { label: 'Conectado', cor: 'text-success', bg: 'bg-success/10 border-success/20', Icon: Wifi },
  conectando: { label: 'Conectando…', cor: 'text-warning', bg: 'bg-warning/10 border-warning/20', Icon: Loader2 },
  aguardando_qr: { label: 'Aguardando QR', cor: 'text-warning', bg: 'bg-warning/10 border-warning/20', Icon: QrCode },
  desconectado: { label: 'Desconectado', cor: 'text-danger', bg: 'bg-danger/10 border-danger/20', Icon: WifiOff },
};

// Aceita tanto data-URL completo ('data:image/png;base64,…') quanto base64 cru
// vindo do gateway, devolvendo sempre um src renderável por <img>.
function normalizarQr(qr) {
  if (!qr) return null;
  return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
}

// ── "Em breve" ────────────────────────────────────────────────────────────────
// O robô do WhatsApp é uma FEATURE FUTURA. A implementação real fica preservada abaixo
// (ConfiguracaoBotLegado) e a flag de backend WHATSAPP_HABILITADO mantém o bot inerte.
// Para religar: trocar o export default por ConfiguracaoBotLegado e ligar a flag.
export default function ConfiguracaoBot() {
  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="WhatsApp" />
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-center mb-5">
          <Smartphone size={30} className="text-success" strokeWidth={1.6} />
        </div>
        <span className="badge text-[10px] mb-3">Em breve</span>
        <h2 className="font-display text-xl font-bold text-white uppercase tracking-wide">
          Robô do WhatsApp
        </h2>
        <p className="text-muted text-sm mt-2 max-w-sm leading-relaxed">
          Em breve seus técnicos vão poder registrar serviços e bater ponto conversando com
          o robô no WhatsApp, e os clientes receberão a pesquisa de avaliação automaticamente.
          Estamos finalizando essa integração.
        </p>
        <p className="text-dark-500 text-xs mt-6 max-w-sm">
          Por enquanto, tudo é feito pelo painel: serviços, ponto e avaliações.
        </p>
      </div>
    </div>
  );
}

function ConfiguracaoBotLegado() {
  const [estado, setEstado] = useState('desconectado');
  const [qr, setQr] = useState(null);
  const [instanceName, setInstanceName] = useState(null);
  const [ehSuperAdmin, setEhSuperAdmin] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [erro, setErro] = useState(null);
  const intervalRef = useRef(null);

  async function buscarStatus() {
    try {
      const { data } = await api.get('/bot/whatsapp/status');
      setEstado(data.estado ?? 'desconectado');
      setQr(normalizarQr(data.qr));
      setInstanceName(data.instanceName ?? null);
      setEhSuperAdmin(Boolean(data.ehSuperAdmin));
      setAtualizadoEm(data.atualizadoEm ?? null);
      setErro(null);
      return true;
    } catch (e) {
      setErro(e.response?.status === 401 ? 'Sem autorização.' : 'Erro ao conectar com o servidor.');
      return false;
    } finally {
      setCarregando(false);
    }
  }

  async function parear() {
    setConectando(true);
    setErro(null);
    try {
      const { data } = await api.post('/bot/whatsapp/conectar');
      if (data.estado) setEstado(data.estado);
      if (data.qr) setQr(normalizarQr(data.qr));
    } catch (e) {
      setErro(e.response?.status === 403
        ? 'Apenas a equipe técnica pode parear o robô.'
        : e.response?.data?.erro ?? 'Falha ao parear o robô.');
    } finally {
      setConectando(false);
    }
  }

  async function desconectar() {
    setDesconectando(true);
    setErro(null);
    try {
      await api.post('/bot/whatsapp/desconectar');
      setEstado('desconectado');
      setQr(null);
      await buscarStatus();
    } catch (e) {
      setErro(e.response?.status === 403
        ? 'Apenas a equipe técnica pode desconectar o robô.'
        : e.response?.data?.erro ?? 'Falha ao desconectar o robô.');
    } finally {
      setDesconectando(false);
    }
  }

  useEffect(() => {
    let active = true;

    function pararPolling() {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    async function tick() {
      const ok = await buscarStatus();
      if (!active || !ok || document.hidden) pararPolling();
    }

    function iniciarPolling() {
      if (!active || document.hidden || intervalRef.current) return;
      intervalRef.current = setInterval(tick, 4000);
    }

    function aoMudarVisibilidade() {
      if (document.hidden) {
        pararPolling();
      } else if (active) {
        buscarStatus().then((ok) => { if (active && ok) iniciarPolling(); });
      }
    }

    buscarStatus().then((ok) => { if (active && ok) iniciarPolling(); });
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    return () => {
      active = false;
      pararPolling();
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, []);

  const info = ESTADOS[estado] ?? ESTADOS.desconectado;
  const { Icon } = info;

  return (
    <div className="flex flex-col min-h-full pb-8">
      <BackHeader titulo="WhatsApp" />
      <div className="px-4 pt-4 pb-2 mb-2">
        <p className="text-muted text-xs">Status da conexão do robô com o WhatsApp</p>
      </div>

      {/* Badge de estado */}
      <div className={`mx-4 flex items-center gap-2.5 rounded-xl border px-4 py-3 mb-6 ${info.bg}`}>
        <Icon size={18} className={`${info.cor} ${estado === 'conectando' ? 'animate-spin' : ''}`} strokeWidth={1.8} />
        <div className="min-w-0">
          <p className={`font-semibold text-sm ${info.cor}`}>{info.label}</p>
          <p className="text-muted text-xs">
            {estado === 'conectado'
              ? 'O robô está ativo e recebendo mensagens'
              : estado === 'aguardando_qr'
              ? 'Aguardando leitura do QR Code'
              : estado === 'conectando'
              ? 'Estabelecendo conexão com o WhatsApp…'
              : 'O robô não está conectado no momento'}
          </p>
        </div>
      </div>

      {erro && (
        <div className="mx-4 bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 mb-6">
          <p className="text-danger text-sm">{erro}</p>
        </div>
      )}

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
              <p className="font-display font-bold text-white text-lg">Robô conectado!</p>
              <p className="text-muted text-sm mt-1">O AdmAi está ativo e atendendo no WhatsApp.</p>
            </div>
            {instanceName && (
              <div className="flex items-center gap-1.5 text-muted text-xs bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5">
                <Smartphone size={13} className="text-success" />
                <span>Instância: <strong className="text-white">{instanceName}</strong></span>
              </div>
            )}
          </div>
        ) : ehSuperAdmin && qr ? (
          <div className="flex flex-col items-center gap-4">
            <div className="card p-4 flex flex-col items-center gap-3">
              <div className="bg-white rounded-xl p-3">
                <img src={qr} alt="QR Code WhatsApp" className="w-56 h-56 block" />
              </div>
              <p className="text-muted text-xs text-center flex items-center gap-1">
                <RefreshCw size={11} /> Atualizado automaticamente
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
              <p className="font-display font-bold text-white text-lg">Robô desconectado</p>
              {ehSuperAdmin ? (
                <p className="text-muted text-sm mt-1">Pareie o robô para gerar o QR Code e vincular o número.</p>
              ) : (
                <p className="text-muted text-sm mt-1 max-w-xs">O robô é gerenciado pela equipe técnica. Em caso de indisponibilidade, fale com o suporte.</p>
              )}
            </div>
            {ehSuperAdmin && (
              <button onClick={parear} disabled={conectando}
                className="btn-primary flex items-center gap-2 px-6 disabled:opacity-50 disabled:cursor-not-allowed">
                {conectando ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
                {conectando ? 'Gerando…' : 'Parear robô'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ações de super-admin */}
      {ehSuperAdmin && !carregando && (
        <div className="px-4 mt-6">
          <div className="card p-4 space-y-3">
            <p className="text-white text-sm font-semibold flex items-center gap-2">
              <ShieldCheck size={15} className="text-accent-300" /> Gestão técnica do robô
            </p>
            <p className="text-muted text-xs">Estas ações afetam o número único do robô para todas as empresas.</p>
            <div className="flex gap-3">
              <button onClick={parear} disabled={conectando || estado === 'conectado'}
                className="btn-ghost flex-1 flex items-center justify-center gap-1.5 disabled:opacity-40">
                {conectando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Parear
              </button>
              <button onClick={desconectar} disabled={desconectando}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-danger/30 text-danger text-sm font-medium hover:bg-danger/10 transition-colors disabled:opacity-50">
                {desconectando ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                {desconectando ? 'Desconectando…' : 'Desconectar'}
              </button>
            </div>
            {atualizadoEm && (
              <p className="text-dark-500 text-[11px]">Última atualização de estado: {new Date(atualizadoEm).toLocaleString('pt-BR')}</p>
            )}
          </div>
        </div>
      )}

      {/* Nota para usuário comum */}
      {!ehSuperAdmin && !carregando && (
        <div className="px-4 mt-6">
          <div className="bg-dark-700/60 border border-dark-600 rounded-xl px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Info size={16} className="text-accent-300 shrink-0 mt-0.5" strokeWidth={1.8} />
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold">Conexão gerenciada pela equipe técnica</p>
                <p className="text-muted text-xs mt-1">
                  Você não precisa parear nada — o robô usa um número único mantido pelo suporte.
                </p>
                <Link to="/ajuda" className="text-accent-300 text-xs font-medium inline-flex items-center gap-1 mt-2 hover:underline">
                  <HelpCircle size={12} /> Central de ajuda
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
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
