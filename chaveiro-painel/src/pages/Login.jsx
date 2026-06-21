import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, Building2, User, AtSign, Phone, Loader2, ArrowRight, ShieldCheck, Zap, MessageSquare, ArrowLeft } from 'lucide-react';
import api, { register } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import BotoesSociais from '../components/BotoesSociais.jsx';
import RodapeLegal from '../components/RodapeLegal.jsx';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  // Abre direto na aba de cadastro quando vier da landing (/login?modo=cadastrar).
  const [modo, setModo] = useState(
    () => (new URLSearchParams(window.location.search).get('modo') === 'cadastrar' ? 'cadastrar' : 'entrar')
  ); // 'entrar' | 'cadastrar'
  const [mostrar, setMostrar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // 2FA — quando o login exige verificação em duas etapas.
  const [desafio2fa, setDesafio2fa] = useState(null); // string opaca devolvida pela API
  const [codigo2fa, setCodigo2fa] = useState('');
  const [metodo2fa, setMetodo2fa] = useState('totp'); // 'totp' | 'telefone'

  // Verificação de telefone por OTP logo após o cadastro.
  const [etapaOtp, setEtapaOtp] = useState(false);
  const [tokenSessao, setTokenSessao] = useState(null); // token emitido no cadastro
  const [codigoOtp, setCodigoOtp] = useState('');
  const [info, setInfo] = useState('');

  // Entrar por "Usuário" (dono) ou por "Telefone" (funcionário).
  const [tipoLogin, setTipoLogin] = useState('usuario'); // 'usuario' | 'telefone'
  // Ambiguidade: o mesmo telefone existe em +1 empresa — usuário escolhe qual.
  const [desambiguacao, setDesambiguacao] = useState(null); // [{ usuarioId, empresa }]

  // campos
  const [form, setForm] = useState({
    username: '', password: '', nome: '', nomeEmpresa: '', email: '', telefone: '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function entrar(e) {
    e.preventDefault();
    const ehTelefone = tipoLogin === 'telefone';
    const identificador = ehTelefone ? form.telefone.replace(/\D/g, '') : form.username.trim();
    if (!identificador || !form.password.trim()) {
      setErro(ehTelefone ? 'Preencha telefone e senha.' : 'Preencha usuário e senha.');
      return;
    }
    setCarregando(true); setErro('');
    try {
      const corpo = ehTelefone
        ? { telefone: identificador, password: form.password }
        : { username: identificador, password: form.password };
      const { data } = await api.post('/auth/login', corpo);
      // Login validou identificador/senha — emite token, exige 2FA ou pede para
      // desambiguar a empresa (mesmo telefone em mais de uma conta).
      tratarSessao(data);
    } catch (err) {
      setErro(err.response?.status === 401
        ? err.response.data?.erro ?? (ehTelefone ? 'Telefone ou senha incorretos.' : 'Usuário ou senha incorretos.')
        : 'Não foi possível conectar à API. Verifique se o servidor está rodando.');
    } finally { setCarregando(false); }
  }

  // Desambiguação: usuário escolheu a empresa — refaz o login com o usuarioId.
  async function escolherEmpresa(usuarioId) {
    setCarregando(true); setErro('');
    try {
      const { data } = await api.post('/auth/login', { usuarioId, password: form.password });
      setDesambiguacao(null);
      tratarSessao(data);
    } catch (err) {
      setErro(err.response?.status === 401
        ? err.response.data?.erro ?? 'Não foi possível entrar nesta empresa.'
        : 'Não foi possível conectar à API. Verifique se o servidor está rodando.');
    } finally { setCarregando(false); }
  }

  async function verificar2fa(e) {
    e.preventDefault();
    if (codigo2fa.length !== 6) {
      setErro('Digite o código de 6 dígitos.');
      return;
    }
    setCarregando(true); setErro('');
    try {
      const rota = metodo2fa === 'telefone' ? '/auth/login/2fa-telefone' : '/auth/login/2fa';
      const { data } = await api.post(rota, { desafio: desafio2fa, codigo: codigo2fa });
      login(data.token);
      navigate('/', { replace: true });
    } catch (err) {
      setErro(err.response?.data?.erro ?? 'Código inválido. Tente novamente.');
    } finally { setCarregando(false); }
  }

  function voltarLogin() {
    setDesafio2fa(null);
    setCodigo2fa('');
    setDesambiguacao(null);
    setErro('');
  }

  // Trata a resposta de sessão (login normal OU social): token direto, desafio 2FA
  // ou lista de empresas para desambiguar (mesmo telefone em +1 conta).
  function tratarSessao(data) {
    if (data.desambiguacao) {
      setDesambiguacao(data.desambiguacao);
      setErro('');
      return;
    }
    if (data.twoFactorRequerido) {
      setDesafio2fa(data.desafio);
      setMetodo2fa(data.metodo === 'telefone' ? 'telefone' : 'totp');
      setCodigo2fa('');
      return;
    }
    // Funcionário com PIN provisório: força a troca de senha antes de entrar.
    if (data.senhaProvisoria) {
      login(data.token);
      navigate('/trocar-senha', { replace: true });
      return;
    }
    login(data.token);
    navigate('/', { replace: true });
  }

  async function cadastrar(e) {
    e.preventDefault();
    const { nome, nomeEmpresa, username, email, telefone, password } = form;
    if (!nome.trim() || !nomeEmpresa.trim() || !username.trim() || !email.trim() || !telefone.trim() || !password) {
      setErro('Preencha todos os campos para criar a conta.');
      return;
    }
    setCarregando(true); setErro('');
    try {
      const data = await register({
        nome: nome.trim(), nomeEmpresa: nomeEmpresa.trim(),
        username: username.trim(), email: email.trim(),
        telefone: telefone.trim().replace(/\D/g, ''), senha: password,
      });
      // Guarda o token para autenticar a verificação por OTP, sem ativar a sessão
      // no contexto ainda (senão o painel já navegaria para fora da tela de OTP).
      localStorage.setItem('chaveiro_token', data.token);
      setTokenSessao(data.token);
      setEtapaOtp(true);
      setCodigoOtp('');
      setInfo('Enviamos um código pelo WhatsApp para confirmar seu número.');
    } catch (err) {
      const r = err.response;
      setErro(r?.data?.erro
        ? `${r.data.erro}${r.data.requisitos ? ' — ' + Object.values(r.data.requisitos).filter(Boolean).join(', ') : ''}`
        : 'Não foi possível criar a conta. Verifique os dados e tente novamente.');
    } finally { setCarregando(false); }
  }

  async function verificarOtp(e) {
    e.preventDefault();
    if (codigoOtp.length !== 6) {
      setErro('Digite o código de 6 dígitos.');
      return;
    }
    setCarregando(true); setErro('');
    try {
      await api.post('/me/telefone/otp/verificar', { codigo: codigoOtp });
      login(tokenSessao);
      navigate('/', { replace: true });
    } catch (err) {
      setErro(err.response?.data?.erro ?? 'Código inválido ou expirado.');
    } finally { setCarregando(false); }
  }

  async function reenviarOtp() {
    setErro(''); setInfo('');
    try {
      await api.post('/me/telefone/otp/enviar');
      setInfo('Código reenviado pelo WhatsApp.');
    } catch (err) {
      setErro(err.response?.data?.erro ?? 'Não foi possível reenviar o código.');
    }
  }

  // Conclui o cadastro sem verificar agora (pode verificar depois em Segurança).
  function pularOtp() {
    login(tokenSessao);
    navigate('/', { replace: true });
  }

  // Troca de aba entrar/cadastrar — limpa mensagens de estado.
  function trocarModo(v) {
    setModo(v);
    setErro('');
    setInfo('');
  }

  const ehCadastro = modo === 'cadastrar';

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr] bg-dark-900">
      {/* ── Painel esquerdo (vitrine) — só desktop ───────────────────────── */}
      <aside className="hidden lg:flex flex-col justify-between p-14 relative overflow-hidden border-r border-dark-600">
        {/* atmosfera: grade técnica + halos de acento */}
        <div className="absolute inset-0 bg-grid [background-size:34px_34px] opacity-[0.45]" />
        <div className="absolute -top-40 -left-28 w-[28rem] h-[28rem] rounded-full bg-accent-400/10 blur-3xl" />
        <div className="absolute -bottom-44 -right-24 w-[26rem] h-[26rem] rounded-full bg-accent-500/10 blur-3xl" />
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-accent-400/30 to-transparent" />

        {/* Marca */}
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center shadow-glow">
              <KeyRound size={22} className="text-accent-300" strokeWidth={2} />
            </div>
            <p className="font-display font-bold text-2xl tracking-wide text-white">
              CHAVEIRO<span className="text-accent-400">BOT</span>
            </p>
          </div>
        </div>

        {/* Manifesto */}
        <div className="relative max-w-md animate-rise">
          <p className="section-label mb-5"><span className="w-7 h-px bg-accent-400" /> SISTEMA OPERACIONAL DE CAMPO</p>
          <h2 className="font-display text-6xl font-bold leading-[0.98] text-white uppercase tracking-tight">
            Sua operação<br /><span className="text-accent-400">sob controle</span>
          </h2>
          <p className="text-muted mt-6 leading-relaxed max-w-sm">
            Registro de serviços via WhatsApp, gestão de técnicos, estoque e avaliações de clientes — tudo num painel só.
          </p>

          <div className="mt-10 flex flex-col divide-y divide-dark-600/70 border-y border-dark-600/70">
            {[
              { n: '01', Icon: MessageSquare, t: 'WhatsApp integrado', s: 'Técnicos registram serviços no chat' },
              { n: '02', Icon: Zap, t: 'Tempo real', s: 'Dashboards e comissões automáticos' },
              { n: '03', Icon: ShieldCheck, t: 'Multi-empresa seguro', s: 'Dados isolados por conta' },
            ].map(({ n, Icon, t, s }, i) => (
              <div
                key={t}
                className="group flex items-center gap-4 py-4 animate-rise"
                style={{ animationDelay: `${120 + i * 90}ms` }}
              >
                <span className="font-mono text-xs text-dark-500 w-6 shrink-0 tnum">{n}</span>
                <div className="w-9 h-9 rounded-md bg-dark-800 border border-dark-600 flex items-center justify-center shrink-0 group-hover:border-accent-400/50 transition-colors">
                  <Icon size={17} className="text-accent-300" />
                </div>
                <div>
                  <p className="text-sm text-white font-medium">{t}</p>
                  <p className="text-xs text-muted">{s}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-dark-500 font-mono tracking-wide">v1.0 · painel de controle</p>
      </aside>

      {/* ── Painel direito (formulário) ──────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center px-6 py-10 min-h-dvh lg:min-h-0 relative">
        {/* halo suave de fundo no mobile */}
        <div className="lg:hidden absolute -top-24 right-0 w-80 h-80 rounded-full bg-accent-400/10 blur-3xl pointer-events-none" />

        <div className="w-full max-w-[400px] animate-rise relative">
          {/* Marca (mobile) */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-8">
            <div className="w-16 h-16 rounded-xl bg-accent-400/15 border border-accent-400/30 flex items-center justify-center shadow-glow">
              <KeyRound size={30} className="text-accent-300" strokeWidth={2} />
            </div>
            <p className="font-display font-bold text-2xl tracking-wide text-white">
              CHAVEIRO<span className="text-accent-400">BOT</span>
            </p>
          </div>

          <div className="card border-dark-600/80 p-6 sm:p-7">
            {etapaOtp ? (
              /* ── Verificação do telefone por OTP (logo após o cadastro) ──── */
              <div className="animate-rise">
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-12 h-12 rounded-lg bg-accent-400/15 border border-accent-400/30 flex items-center justify-center mb-3">
                    <MessageSquare size={24} className="text-accent-300" />
                  </div>
                  <p className="font-display font-bold text-lg text-white uppercase tracking-wide">Confirme seu WhatsApp</p>
                  <p className="text-muted text-sm mt-1">Enviamos um código de 6 dígitos pelo WhatsApp do robô.</p>
                </div>

                <form onSubmit={verificarOtp} className="flex flex-col gap-4">
                  <div>
                    <label className="kpi-label block mb-1.5">Código de verificação</label>
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      autoFocus
                      value={codigoOtp}
                      onChange={(e) => setCodigoOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="input text-center text-2xl font-display tracking-[0.4em] font-bold"
                    />
                  </div>

                  {info && !erro && <BannerInfo>{info}</BannerInfo>}
                  {erro && <BannerErro>{erro}</BannerErro>}

                  <button type="submit" disabled={carregando || codigoOtp.length !== 6} className="btn-primary mt-1">
                    {carregando ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    {carregando ? 'Verificando…' : 'Confirmar número'}
                  </button>

                  <div className="flex items-center justify-between text-sm">
                    <button type="button" onClick={reenviarOtp} className="text-accent-300 hover:text-accent-200 transition-colors">
                      Reenviar código
                    </button>
                    <button type="button" onClick={pularOtp} className="text-muted hover:text-white transition-colors">
                      Verificar depois
                    </button>
                  </div>
                </form>
              </div>
            ) : desambiguacao ? (
              /* ── Desambiguação — mesmo telefone em mais de uma empresa ──── */
              <div className="animate-rise">
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-12 h-12 rounded-lg bg-accent-400/15 border border-accent-400/30 flex items-center justify-center mb-3">
                    <Building2 size={24} className="text-accent-300" />
                  </div>
                  <p className="font-display font-bold text-lg text-white uppercase tracking-wide">Escolha a empresa</p>
                  <p className="text-muted text-sm mt-1">Seu telefone está em mais de uma empresa. Selecione em qual deseja entrar.</p>
                </div>

                <div className="flex flex-col gap-2">
                  {desambiguacao.map((d) => (
                    <button
                      key={d.usuarioId}
                      type="button"
                      onClick={() => escolherEmpresa(d.usuarioId)}
                      disabled={carregando}
                      className="w-full flex items-center justify-between gap-3 rounded-lg border border-dark-600 bg-dark-700 px-4 py-3 text-left transition-colors hover:border-accent-400/50 disabled:opacity-50"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Building2 size={18} className="text-accent-300 shrink-0" />
                        <span className="text-white text-sm font-medium truncate">{d.empresa}</span>
                      </span>
                      <ArrowRight size={16} className="text-muted shrink-0" />
                    </button>
                  ))}
                </div>

                {erro && <div className="mt-4"><BannerErro>{erro}</BannerErro></div>}

                <button
                  type="button"
                  onClick={voltarLogin}
                  className="mt-5 w-full flex items-center justify-center gap-1.5 text-sm text-muted hover:text-white transition-colors"
                >
                  <ArrowLeft size={14} /> Voltar
                </button>
              </div>
            ) : desafio2fa ? (
              /* ── Passo 2FA — código do app ou do WhatsApp ───────────────── */
              <div className="animate-rise">
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-12 h-12 rounded-lg bg-accent-400/15 border border-accent-400/30 flex items-center justify-center mb-3">
                    <ShieldCheck size={24} className="text-accent-300" />
                  </div>
                  <p className="font-display font-bold text-lg text-white uppercase tracking-wide">Verificação em duas etapas</p>
                  <p className="text-muted text-sm mt-1">
                    {metodo2fa === 'telefone'
                      ? 'Digite o código de 6 dígitos que enviamos pelo WhatsApp.'
                      : 'Digite o código de 6 dígitos do seu app autenticador.'}
                  </p>
                </div>

                <form onSubmit={verificar2fa} className="flex flex-col gap-4">
                  <div>
                    <label className="kpi-label block mb-1.5">Código de verificação</label>
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      autoFocus
                      value={codigo2fa}
                      onChange={(e) => setCodigo2fa(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="input text-center text-2xl font-display tracking-[0.4em] font-bold"
                    />
                  </div>

                  {erro && <BannerErro>{erro}</BannerErro>}

                  <button type="submit" disabled={carregando || codigo2fa.length !== 6} className="btn-primary mt-1">
                    {carregando ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    {carregando ? 'Verificando…' : 'Verificar'}
                  </button>

                  <button
                    type="button"
                    onClick={voltarLogin}
                    className="flex items-center justify-center gap-1.5 text-sm text-muted hover:text-white transition-colors"
                  >
                    <ArrowLeft size={14} /> Voltar
                  </button>
                </form>
              </div>
            ) : (
              <>
                {/* Cabeçalho do formulário */}
                <div className="mb-5">
                  <h1 className="font-display text-xl font-bold text-white uppercase tracking-wide">
                    {ehCadastro ? 'Criar conta' : 'Bem-vindo de volta'}
                  </h1>
                  <p className="text-sm text-muted mt-0.5">
                    {ehCadastro ? 'Configure sua empresa em segundos.' : 'Acesse o painel da sua operação.'}
                  </p>
                </div>

                {/* Alternador entrar/cadastrar */}
                <div className="flex p-1 bg-dark-900/70 border border-dark-700 rounded-lg mb-5">
                  {[['entrar', 'Entrar'], ['cadastrar', 'Criar conta']].map(([v, lbl]) => (
                    <button
                      key={v}
                      onClick={() => trocarModo(v)}
                      className={`flex-1 py-2 rounded-md text-sm font-display font-semibold uppercase tracking-wider transition-all ${
                        modo === v ? 'bg-accent-400 text-dark-950 shadow-[0_0_18px_-6px_rgba(34,211,238,0.6)]' : 'text-muted hover:text-white'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <form onSubmit={ehCadastro ? cadastrar : entrar} className="flex flex-col gap-4">
                  {ehCadastro && (
                    <>
                      <Campo label="Seu nome" Icon={User}>
                        <input className="input pl-10" placeholder="João da Silva" value={form.nome} onChange={set('nome')} autoComplete="name" />
                      </Campo>
                      <Campo label="Nome da empresa" Icon={Building2}>
                        <input className="input pl-10" placeholder="Chaveiro Express" value={form.nomeEmpresa} onChange={set('nomeEmpresa')} autoComplete="organization" />
                      </Campo>
                      <Campo label="E-mail" Icon={AtSign}>
                        <input type="email" className="input pl-10" placeholder="voce@empresa.com" value={form.email} onChange={set('email')} autoComplete="email" />
                      </Campo>
                      <Campo label="WhatsApp (com DDD)" Icon={Phone}>
                        <input type="tel" inputMode="numeric" className="input pl-10" placeholder="11999990000" value={form.telefone} onChange={set('telefone')} autoComplete="tel" />
                      </Campo>
                    </>
                  )}

                  {ehCadastro ? (
                    <Campo label="Usuário" Icon={User}>
                      <input className="input pl-10" placeholder="seu_usuario" value={form.username} onChange={set('username')} autoComplete="username" />
                    </Campo>
                  ) : (
                    <div>
                      {/* Seletor: entrar por usuário (dono) ou por telefone (funcionário) */}
                      <div className="flex p-1 bg-dark-900/70 border border-dark-700 rounded-lg mb-3">
                        {[['usuario', 'Usuário'], ['telefone', 'Telefone']].map(([v, lbl]) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => { setTipoLogin(v); setErro(''); }}
                            className={`flex-1 py-1.5 rounded-md text-xs font-display font-semibold uppercase tracking-wider transition-all ${
                              tipoLogin === v ? 'bg-accent-400 text-dark-950 shadow-[0_0_18px_-6px_rgba(34,211,238,0.6)]' : 'text-muted hover:text-white'
                            }`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                      {tipoLogin === 'telefone' ? (
                        <Campo label="Telefone" Icon={Phone}>
                          <input type="tel" inputMode="numeric" className="input pl-10" placeholder="11999990000" value={form.telefone} onChange={set('telefone')} autoComplete="tel" autoFocus />
                        </Campo>
                      ) : (
                        <Campo label="Usuário" Icon={User}>
                          <input className="input pl-10" placeholder="seu_usuario" value={form.username} onChange={set('username')} autoComplete="username" autoFocus />
                        </Campo>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="kpi-label block mb-1.5">Senha</label>
                    <div className="relative">
                      <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type={mostrar ? 'text' : 'password'}
                        className="input pl-10 pr-11"
                        placeholder="••••••••"
                        value={form.password}
                        onChange={set('password')}
                        autoComplete={ehCadastro ? 'new-password' : 'current-password'}
                      />
                      <button type="button" onClick={() => setMostrar(!mostrar)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-accent-300 transition-colors">
                        {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {ehCadastro && <p className="text-[11px] text-muted mt-1.5">Mínimo 8 caracteres, com maiúscula, número e símbolo.</p>}
                  </div>

                  {info && !erro && <BannerInfo>{info}</BannerInfo>}
                  {erro && <BannerErro>{erro}</BannerErro>}

                  <button type="submit" disabled={carregando} className="btn-primary mt-1">
                    {carregando ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    {carregando ? 'Aguarde…' : ehCadastro ? 'Criar conta' : 'Entrar'}
                  </button>
                </form>

                {/* Login social (Google / Microsoft / Apple) */}
                <BotoesSociais onResultado={tratarSessao} onErro={setErro} onInfo={setInfo} desabilitado={carregando} />

                <p className="text-center text-xs text-muted mt-6">
                  {ehCadastro
                    ? 'Ao criar a conta, sua empresa será configurada automaticamente.'
                    : 'Acesso restrito · contate o administrador da sua empresa.'}
                </p>
              </>
            )}
          </div>

          <RodapeLegal className="mt-6" />
        </div>
      </div>
    </div>
  );
}

function Campo({ label, Icon, children }) {
  return (
    <div>
      <label className="kpi-label block mb-1.5">{label}</label>
      <div className="relative">
        <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        {children}
      </div>
    </div>
  );
}

function BannerErro({ children }) {
  return <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-4 py-3">{children}</p>;
}

function BannerInfo({ children }) {
  return <p className="text-accent-300 text-sm bg-accent-400/10 border border-accent-400/30 rounded-md px-4 py-3">{children}</p>;
}
