import { useState, useEffect, useCallback, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  ShieldCheck,
  LogOut,
  Check,
  X,
  Loader2,
  Copy,
  UserX,
  Trash2,
  Monitor,
} from 'lucide-react';
import api from '../lib/api.js';
import { avaliarForcaSenha } from '../lib/senha.js';
import BackHeader from '../components/BackHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Overlay } from '../components/ui/index.js';

const CORES_FORCA = {
  fraca: { barra: 'bg-danger', texto: 'text-danger', label: 'Fraca', n: 1 },
  media: { barra: 'bg-warning', texto: 'text-warning', label: 'Média', n: 2 },
  forte: { barra: 'bg-success', texto: 'text-success', label: 'Forte', n: 3 },
};

/**
 * A pergunta da lista de sessões é "esta sessão é MINHA?" — e "curl/8.19.0" com "::ffff:127.0.0.1"
 * não responde isso para ninguém. Tradução determinística, sem dependência nova:
 * navegador + sistema para UAs reais, nome honesto para ferramentas, e IP legível. [SL-14]
 */
export function descreverDispositivo(userAgent) {
  if (!userAgent) return 'Dispositivo desconhecido';
  const ua = userAgent.toLowerCase();
  if (/curl|wget|postman|httpie|python-requests|node-fetch|axios/.test(ua)) {
    return 'Ferramenta de linha de comando';
  }
  const sistema = /iphone|ipad/.test(ua)
    ? 'iPhone/iPad'
    : /android/.test(ua)
      ? 'Android'
      : /windows/.test(ua)
        ? 'Windows'
        : /mac os x|macintosh/.test(ua)
          ? 'Mac'
          : /linux/.test(ua)
            ? 'Linux'
            : null;
  const navegador = /edg\//.test(ua)
    ? 'Edge'
    : /opr\//.test(ua)
      ? 'Opera'
      : /firefox\//.test(ua)
        ? 'Firefox'
        : /chrome\//.test(ua)
          ? 'Chrome'
          : /safari\//.test(ua)
            ? 'Safari'
            : null;
  if (navegador && sistema) return `${navegador} em ${sistema}`;
  return navegador ?? sistema ?? 'Dispositivo desconhecido';
}

/** Loopback vira "acesso local"; IPv4 mapeado em IPv6 perde o prefixo; público fica cru (é o dado real). */
export function formatarIp(ip) {
  if (!ip) return '—';
  const limpo = ip.replace(/^::ffff:/i, '');
  if (limpo === '::1' || limpo === '127.0.0.1') return 'acesso local';
  return limpo;
}

const REQUISITOS = [
  { chave: 'tamanho', label: 'Pelo menos 8 caracteres' },
  { chave: 'maiuscula', label: 'Uma letra maiúscula' },
  { chave: 'minuscula', label: 'Uma letra minúscula' },
  { chave: 'numero', label: 'Um número' },
  { chave: 'especial', label: 'Um caractere especial' },
];

function MedidorForca({ senha }) {
  if (!senha) return null;
  const { nivel, requisitos } = avaliarForcaSenha(senha);
  const cfg = CORES_FORCA[nivel];
  return (
    <div className="mt-2">
      <div className="flex gap-1.5 mb-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= cfg.n ? cfg.barra : 'bg-dark-600'}`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${cfg.texto} mb-2`}>Senha {cfg.label.toLowerCase()}</p>
      <ul className="flex flex-col gap-1">
        {REQUISITOS.map((r) => (
          <li
            key={r.chave}
            className={`flex items-center gap-1.5 text-xs ${requisitos[r.chave] ? 'text-success' : 'text-muted'}`}
          >
            {requisitos[r.chave] ? <Check size={12} /> : <X size={12} />}
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampoSenha({ label, valor, onChange, autoComplete }) {
  const [mostrar, setMostrar] = useState(false);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="kpi-label block mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={mostrar ? 'text' : 'password'}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="input pr-12"
          autoComplete={autoComplete}
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setMostrar(!mostrar)}
          aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute right-0 top-1/2 -translate-y-1/2 p-3 text-muted hover:text-white transition-colors"
        >
          {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

// Campo de código de 6 dígitos (só números), reutilizado nos fluxos de 2FA.
function CampoCodigo({ valor, onChange, onEnter, autoFocus, ariaLabel }) {
  return (
    <input
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      autoFocus={autoFocus}
      value={valor}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) onEnter();
      }}
      placeholder="000000"
      aria-label={ariaLabel}
      className="input text-center text-2xl font-display tracking-[0.4em] font-bold"
    />
  );
}

// Modal do app apoiado no primitive acessível Overlay (foco preso, inert, Escape, restauração).
function Modal({ titulo, onClose, children }) {
  return (
    <Overlay open onClose={onClose} title={titulo} size="sm">
      <div className="flex flex-col gap-4">{children}</div>
    </Overlay>
  );
}

export default function Seguranca() {
  const toast = useToast();
  const navigate = useNavigate();
  const { login, logout, isAdmin } = useAuth();
  const [dados, setDados] = useState(null);
  // Falha ao carregar /me precisa ser VISÍVEL: sem isso o switch de 2FA fica desabilitado
  // sem explicação e o usuário não tem como saber que deve recarregar.
  const [erroCarregar, setErroCarregar] = useState('');

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [sessoes, setSessoes] = useState(null);

  // 2FA — ativação (modal com QR + secret + código)
  const [setup2fa, setSetup2fa] = useState(null); // { secret, otpauthUrl, qrDataUrl }
  const [abrindoSetup, setAbrindoSetup] = useState(false);
  const [codigoAtivar, setCodigoAtivar] = useState('');
  const [ativando, setAtivando] = useState(false);
  const [erro2fa, setErro2fa] = useState('');

  // 2FA — desativação (confirmação com código)
  const [confirmarDesativar, setConfirmarDesativar] = useState(false);
  const [codigoDesativar, setCodigoDesativar] = useState('');
  const [desativando, setDesativando] = useState(false);

  // LGPD — anonimização de dados de cliente (admin)
  const [telefoneLgpd, setTelefoneLgpd] = useState('');
  const [confirmarLgpd, setConfirmarLgpd] = useState(false);
  const [anonimizando, setAnonimizando] = useState(false);

  // Exclusão de conta (autoexclusão) — reautenticação por senha (+2FA se ativo)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [senhaExclusao, setSenhaExclusao] = useState('');
  const [codigoExclusao, setCodigoExclusao] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState('');

  const buscar = useCallback(async () => {
    // Antes as duas chamadas iam num Promise.all e o catch era vazio: se /me/sessoes
    // falhasse (404 num backend antigo, 500, rede), NENHUM dos dois setters rodava.
    // Resultado: `dados` ficava null para sempre e o switch de 2FA — que tem
    // `disabled={... || !dados}` — ficava PERMANENTEMENTE desabilitado, sem erro
    // nenhum na tela. O usuário não conseguia mais ativar nem desativar 2FA.
    // Agora cada recurso é independente e a falha aparece.
    const [rMe, rSessoes] = await Promise.allSettled([api.get('/me'), api.get('/me/sessoes')]);

    if (rMe.status === 'fulfilled') {
      setDados(rMe.value.data);
      setErroCarregar('');
    } else {
      setErroCarregar('Não foi possível carregar seus dados de segurança. Tente recarregar.');
    }

    // Sessões são acessórias: falhar aqui não pode bloquear o resto da tela.
    setSessoes(rSessoes.status === 'fulfilled' ? rSessoes.value.data : []);
  }, []);

  useEffect(() => {
    buscar();
  }, [buscar]);

  const forca = avaliarForcaSenha(nova);
  const podeTrocar = atual && forca.valida && nova === confirma;

  async function trocarSenha(e) {
    e.preventDefault();
    if (nova !== confirma) {
      toast('As senhas não coincidem', 'error');
      return;
    }
    if (!forca.valida) {
      toast('A nova senha é muito fraca', 'error');
      return;
    }
    setSalvando(true);
    try {
      const { data } = await api.patch('/me/senha', { senhaAtual: atual, novaSenha: nova });
      if (data.token) login(data.token); // renova o token (os antigos foram invalidados)
      toast('Senha alterada com sucesso', 'success');
      setAtual('');
      setNova('');
      setConfirma('');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao trocar senha', 'error');
    } finally {
      setSalvando(false);
    }
  }

  // Liga/desliga: abre o fluxo apropriado conforme o estado atual.
  function aoAlternar2fa() {
    if (dados?.twoFactorAtivo) abrirDesativar();
    else iniciarSetup();
  }

  // Ativação — passo 1: gera o segredo + QR e abre o modal.
  async function iniciarSetup() {
    setAbrindoSetup(true);
    setErro2fa('');
    try {
      const { data } = await api.post('/me/2fa/setup');
      setSetup2fa(data);
      setCodigoAtivar('');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao iniciar 2FA', 'error');
    } finally {
      setAbrindoSetup(false);
    }
  }

  // Ativação — passo 2: confirma o código do app autenticador.
  async function ativar2fa() {
    if (codigoAtivar.length !== 6) return;
    setAtivando(true);
    setErro2fa('');
    try {
      await api.post('/me/2fa/ativar', { codigo: codigoAtivar });
      setDados((d) => ({ ...d, twoFactorAtivo: true }));
      setSetup2fa(null);
      setCodigoAtivar('');
      toast('2FA ativado', 'success');
    } catch (err) {
      setErro2fa(err.response?.data?.erro ?? 'Código inválido');
    } finally {
      setAtivando(false);
    }
  }

  function abrirDesativar() {
    setConfirmarDesativar(true);
    setCodigoDesativar('');
    setErro2fa('');
  }

  // Desativação: exige código válido do app autenticador.
  async function desativar2fa() {
    if (codigoDesativar.length !== 6) return;
    setDesativando(true);
    setErro2fa('');
    try {
      await api.post('/me/2fa/desativar', { codigo: codigoDesativar });
      setDados((d) => ({ ...d, twoFactorAtivo: false }));
      setConfirmarDesativar(false);
      setCodigoDesativar('');
      toast('2FA desativado', 'success');
    } catch (err) {
      setErro2fa(err.response?.data?.erro ?? 'Código inválido');
    } finally {
      setDesativando(false);
    }
  }

  function copiarSecret() {
    if (!setup2fa?.secret) return;
    navigator.clipboard
      ?.writeText(setup2fa.secret)
      .then(() => toast('Chave copiada', 'success'))
      .catch(() => {});
  }

  async function sairDeTudo() {
    setSaindo(true);
    try {
      await api.post('/me/logout-all');
      toast('Todas as sessões foram encerradas', 'success');
      // Limpa token + estado React desta sessão antes de redirecionar.
      logout();
      navigate('/login', { replace: true });
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao encerrar sessões', 'error');
      setSaindo(false);
    }
  }

  // LGPD — anonimiza a PII de um cliente (direito ao esquecimento). Irreversível.
  async function anonimizarCliente() {
    const telefone = telefoneLgpd.trim();
    if (telefone.length < 8) {
      toast('Informe um telefone válido', 'error');
      return;
    }
    setAnonimizando(true);
    try {
      const { data } = await api.post('/lgpd/anonimizar-cliente', { telefone });
      const total = (data.servicosAnonimizados ?? 0) + (data.avaliacoesAnonimizadas ?? 0);
      toast(
        total > 0
          ? `Dados anonimizados (${data.servicosAnonimizados} serviço(s), ${data.avaliacoesAnonimizadas} avaliação(ões))`
          : 'Nenhum registro encontrado para este telefone',
        total > 0 ? 'success' : 'error'
      );
      setConfirmarLgpd(false);
      setTelefoneLgpd('');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao anonimizar dados', 'error');
    } finally {
      setAnonimizando(false);
    }
  }

  // Autoexclusão de conta. Para o único dono, o backend apaga a empresa inteira em
  // cascata; para os demais, apaga só a própria conta. Em qualquer caso, deslogamos.
  async function excluirConta() {
    setExcluindo(true);
    setErroExclusao('');
    try {
      await api.delete('/me/conta', { data: { senha: senhaExclusao, codigo: codigoExclusao } });
      toast('Conta excluída', 'success');
      logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setErroExclusao(err.response?.data?.erro ?? 'Erro ao excluir conta');
      setExcluindo(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Segurança" />

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8 flex flex-col gap-6 lg:max-w-2xl">
        {erroCarregar && (
          <div
            role="alert"
            className="card border border-red-500/40 bg-red-500/10 text-sm text-red-200"
          >
            {erroCarregar}
          </div>
        )}

        {/* Trocar senha */}
        <section>
          <p className="section-label mb-2 px-1">Senha</p>
          <form onSubmit={trocarSenha} className="card flex flex-col gap-4">
            <CampoSenha
              label="Senha atual"
              valor={atual}
              onChange={setAtual}
              autoComplete="current-password"
            />
            <div>
              <CampoSenha
                label="Nova senha"
                valor={nova}
                onChange={setNova}
                autoComplete="new-password"
              />
              <MedidorForca senha={nova} />
            </div>
            <CampoSenha
              label="Confirmar nova senha"
              valor={confirma}
              onChange={setConfirma}
              autoComplete="new-password"
            />
            {confirma && nova !== confirma && (
              <p className="text-danger text-xs">As senhas não coincidem.</p>
            )}
            <button type="submit" disabled={salvando || !podeTrocar} className="btn-primary">
              {salvando ? 'Alterando…' : 'Alterar senha'}
            </button>
          </form>
        </section>

        {/* 2FA */}
        <section>
          <p className="section-label mb-2 px-1">Verificação em duas etapas</p>
          <div className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-sky-400/10 border border-dark-600 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} className="text-sky-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">Autenticação 2FA</p>
              <p className="text-muted text-xs mt-0.5">
                {dados?.twoFactorAtivo ? 'Ativada' : 'Camada extra de segurança no login'}
              </p>
            </div>
            <button
              onClick={aoAlternar2fa}
              disabled={abrindoSetup || !dados}
              role="switch"
              aria-checked={dados?.twoFactorAtivo ?? false}
              aria-label={dados?.twoFactorAtivo ? 'Desativar 2FA' : 'Ativar 2FA'}
              /* Alvo real de 44px com o pill como span interno — mesmo desenho do Toggle de
                 Configurações (pseudo-elemento não conta no rect). [SL-02B] */
              className="relative h-11 w-14 flex items-center justify-center shrink-0 disabled:opacity-50"
            >
              <span
                className={`relative block w-12 h-7 rounded-full transition-colors ${dados?.twoFactorAtivo ? 'bg-success' : 'bg-dark-600'}`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${dados?.twoFactorAtivo ? 'left-6' : 'left-1'}`}
                />
              </span>
            </button>
          </div>
        </section>

        {/* Sessões */}
        <section>
          <p className="section-label mb-2 px-1">Sessões ativas</p>
          <div className="card flex flex-col gap-3">
            {sessoes === null ? (
              <div className="flex items-center gap-2 py-1 text-muted text-sm">
                <Loader2 size={14} className="animate-spin shrink-0" />
                Carregando sessões…
              </div>
            ) : sessoes.length === 0 ? (
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-success shrink-0 animate-pulse-glow" />
                <p className="text-white text-sm font-semibold">Sessão atual</p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-dark-700 -my-1">
                {sessoes.map((s) => (
                  <li key={s.jwtIat} className="flex items-start gap-3 py-2.5">
                    <div
                      className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${s.atual ? 'bg-success animate-pulse-glow' : 'bg-dark-500'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">
                        {s.atual ? (
                          'Este dispositivo'
                        ) : (
                          <Monitor size={13} className="inline mr-1 text-muted" />
                        )}
                        {!s.atual && descreverDispositivo(s.userAgent)}
                      </p>
                      <p className="text-muted text-xs mt-0.5">
                        {formatarIp(s.ip)} · Último acesso:{' '}
                        {new Date(s.ultimaAtividadeEm).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {s.atual && (
                      <span className="text-xs text-success font-medium shrink-0">Atual</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={sairDeTudo}
              disabled={saindo}
              className="btn-danger py-3 disabled:opacity-50"
            >
              <LogOut size={16} />
              {saindo ? 'Encerrando…' : 'Sair de todos os dispositivos'}
            </button>
          </div>
        </section>

        {/* Privacidade do cliente (LGPD) — admin apenas */}
        {isAdmin && (
          <section>
            <p className="section-label mb-2 px-1">Privacidade do cliente (LGPD)</p>
            <div className="card flex flex-col gap-3">
              <p className="text-muted text-xs leading-relaxed">
                Remove os dados pessoais de um cliente (nome, telefone, comentário) dos serviços e
                avaliações da sua empresa — atende ao direito ao esquecimento. Os valores
                financeiros são preservados. Ação irreversível.
              </p>
              <div>
                <label className="kpi-label block mb-2">Telefone do cliente</label>
                <input
                  value={telefoneLgpd}
                  onChange={(e) => setTelefoneLgpd(e.target.value)}
                  className="input"
                  placeholder="5511999998888"
                  inputMode="tel"
                />
              </div>
              <button
                onClick={() => setConfirmarLgpd(true)}
                disabled={telefoneLgpd.trim().length < 8}
                className="btn-danger disabled:opacity-50"
              >
                <UserX size={16} /> Anonimizar dados do cliente
              </button>
            </div>
          </section>
        )}

        {/* Excluir conta (autoexclusão) — exigência da LGPD e da Play Store */}
        <section>
          <p className="section-label mb-2 px-1">Excluir conta</p>
          <div className="card flex flex-col gap-3 border border-danger/30">
            <p className="text-muted text-xs leading-relaxed">
              {isAdmin
                ? 'Exclui permanentemente a sua conta. Se você for o único dono da empresa, TODOS os dados da empresa (técnicos, serviços, estoque, avaliações e usuários) serão apagados em cascata. Esta ação é irreversível.'
                : 'Exclui permanentemente a sua conta de acesso. Esta ação é irreversível.'}
            </p>
            <button
              onClick={() => {
                setSenhaExclusao('');
                setCodigoExclusao('');
                setErroExclusao('');
                setConfirmarExclusao(true);
              }}
              className="btn-danger"
            >
              <Trash2 size={16} /> Excluir minha conta
            </button>
          </div>
        </section>
      </div>

      {/* Modal — ativar 2FA */}
      {setup2fa && (
        <Modal titulo="Ativar 2FA" onClose={() => setSetup2fa(null)}>
          <p className="text-muted text-xs leading-relaxed">
            Escaneie o QR code com seu app autenticador (Google Authenticator, Authy, etc.) e digite
            o código de 6 dígitos para confirmar.
          </p>

          {setup2fa.qrDataUrl && (
            <div className="flex justify-center">
              <img
                src={setup2fa.qrDataUrl}
                alt="QR code 2FA"
                className="w-44 h-44 rounded-lg border border-dark-600 bg-white p-1"
              />
            </div>
          )}

          {setup2fa.secret && (
            <div>
              <label className="kpi-label block mb-2">Ou digite esta chave manualmente</label>
              <button
                type="button"
                onClick={copiarSecret}
                className="w-full flex items-center justify-between gap-2 input font-mono text-sm text-left hover:text-white transition-colors"
              >
                <span className="truncate">{setup2fa.secret}</span>
                <Copy size={16} className="text-muted shrink-0" />
              </button>
            </div>
          )}

          <div>
            <label className="kpi-label block mb-2">Código de verificação</label>
            <CampoCodigo
              valor={codigoAtivar}
              onChange={setCodigoAtivar}
              onEnter={ativar2fa}
              autoFocus
              ariaLabel="Código de verificação"
            />
            {erro2fa && <p className="text-danger text-xs mt-2">{erro2fa}</p>}
          </div>

          <button
            onClick={ativar2fa}
            disabled={ativando || codigoAtivar.length !== 6}
            className="btn-primary"
          >
            {ativando ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {ativando ? 'Verificando…' : 'Confirmar e ativar'}
          </button>
        </Modal>
      )}

      {/* Modal — desativar 2FA */}
      {confirmarDesativar && (
        <Modal titulo="Desativar 2FA" onClose={() => setConfirmarDesativar(false)}>
          <p className="text-muted text-xs leading-relaxed">
            Digite o código atual do seu app autenticador para desativar a verificação em duas
            etapas.
          </p>
          <div>
            <label className="kpi-label block mb-2">Código de verificação</label>
            <CampoCodigo
              valor={codigoDesativar}
              onChange={setCodigoDesativar}
              onEnter={desativar2fa}
              autoFocus
              ariaLabel="Código de verificação"
            />
            {erro2fa && <p className="text-danger text-xs mt-2">{erro2fa}</p>}
          </div>
          <button
            onClick={desativar2fa}
            disabled={desativando || codigoDesativar.length !== 6}
            className="btn-danger"
          >
            {desativando ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
            {desativando ? 'Desativando…' : 'Desativar 2FA'}
          </button>
        </Modal>
      )}

      {/* Modal — confirmar anonimização LGPD */}
      {confirmarLgpd && (
        <Modal titulo="Anonimizar dados" onClose={() => setConfirmarLgpd(false)}>
          <p className="text-muted text-xs leading-relaxed">
            Isso remove permanentemente o nome, telefone e comentários do cliente
            <span className="text-white font-mono"> {telefoneLgpd.trim()} </span>
            de todos os serviços e avaliações da sua empresa. Os valores financeiros são mantidos.
            Esta ação não pode ser desfeita.
          </p>
          <button onClick={anonimizarCliente} disabled={anonimizando} className="btn-danger">
            {anonimizando ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
            {anonimizando ? 'Anonimizando…' : 'Confirmar anonimização'}
          </button>
        </Modal>
      )}

      {/* Modal — confirmar exclusão de conta */}
      {confirmarExclusao && (
        <Modal titulo="Excluir conta" onClose={() => setConfirmarExclusao(false)}>
          <p className="text-muted text-xs leading-relaxed">
            {isAdmin
              ? 'Atenção: se você for o único dono, isso apaga a EMPRESA INTEIRA e todos os seus dados, permanentemente. Confirme com sua senha para continuar.'
              : 'Isso apaga sua conta permanentemente. Confirme com sua senha para continuar.'}
          </p>
          <CampoSenha
            label="Sua senha"
            valor={senhaExclusao}
            onChange={setSenhaExclusao}
            autoComplete="current-password"
          />
          {dados?.twoFactorAtivo && (
            <div>
              <label className="kpi-label block mb-2">Código 2FA</label>
              <CampoCodigo
                valor={codigoExclusao}
                onChange={setCodigoExclusao}
                onEnter={excluirConta}
                ariaLabel="Código 2FA"
              />
            </div>
          )}
          {erroExclusao && <p className="text-danger text-xs">{erroExclusao}</p>}
          <button
            onClick={excluirConta}
            disabled={
              excluindo || !senhaExclusao || (dados?.twoFactorAtivo && codigoExclusao.length !== 6)
            }
            className="btn-danger disabled:opacity-50"
          >
            {excluindo ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {excluindo ? 'Excluindo…' : 'Excluir permanentemente'}
          </button>
        </Modal>
      )}
    </div>
  );
}
