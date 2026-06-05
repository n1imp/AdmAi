import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, Building2, User, AtSign, Loader2, ArrowRight, ShieldCheck, Zap, MessageSquare } from 'lucide-react';
import api from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [modo, setModo] = useState('entrar'); // 'entrar' | 'cadastrar'
  const [mostrar, setMostrar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // campos
  const [form, setForm] = useState({
    username: '', password: '', nome: '', nomeEmpresa: '', email: '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function entrar(e) {
    e.preventDefault();
    if (!form.username.trim() || !form.password.trim()) return;
    setCarregando(true); setErro('');
    try {
      const { data } = await api.post('/auth/login', { username: form.username.trim(), password: form.password });
      login(data.token);
      navigate('/', { replace: true });
    } catch (err) {
      setErro(err.response?.status === 401
        ? err.response.data?.erro ?? 'Usuário ou senha incorretos.'
        : 'Não foi possível conectar à API. Verifique se o servidor está rodando.');
    } finally { setCarregando(false); }
  }

  async function cadastrar(e) {
    e.preventDefault();
    const { nome, nomeEmpresa, username, email, password } = form;
    if (!nome.trim() || !nomeEmpresa.trim() || !username.trim() || !email.trim() || !password) return;
    setCarregando(true); setErro('');
    try {
      const { data } = await api.post('/auth/register', {
        nome: nome.trim(), nomeEmpresa: nomeEmpresa.trim(),
        username: username.trim(), email: email.trim(), senha: password,
      });
      login(data.token);
      navigate('/', { replace: true });
    } catch (err) {
      const r = err.response;
      setErro(r?.data?.erro
        ? `${r.data.erro}${r.data.requisitos ? ' — ' + Object.values(r.data.requisitos).filter(Boolean).join(', ') : ''}`
        : 'Não foi possível criar a conta. Verifique os dados e tente novamente.');
    } finally { setCarregando(false); }
  }

  const ehCadastro = modo === 'cadastrar';

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2 bg-dark-900">
      {/* ── Painel esquerdo (vitrine) — só desktop ───────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden border-r border-dark-600">
        {/* atmosfera: grade técnica + halo */}
        <div className="absolute inset-0 bg-grid [background-size:32px_32px] opacity-[0.5]" />
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-accent-400/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center">
              <KeyRound size={22} className="text-accent-300" strokeWidth={2} />
            </div>
            <p className="font-display font-bold text-2xl tracking-wide text-white">
              CHAVEIRO<span className="text-accent-400">BOT</span>
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="section-label mb-4"><span className="w-6 h-px bg-accent-400" /> SISTEMA OPERACIONAL DE CAMPO</p>
          <h2 className="font-display text-5xl font-bold leading-[1.05] text-white uppercase tracking-tight">
            Sua operação<br /><span className="text-accent-400">sob controle</span>
          </h2>
          <p className="text-muted mt-5 leading-relaxed">
            Registro de serviços via WhatsApp, gestão de técnicos, estoque e avaliações de clientes — tudo num painel só.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3">
            {[
              { Icon: MessageSquare, t: 'WhatsApp integrado', s: 'Técnicos registram serviços no chat' },
              { Icon: Zap, t: 'Tempo real', s: 'Dashboards e comissões automáticos' },
              { Icon: ShieldCheck, t: 'Multi-empresa seguro', s: 'Dados isolados por conta' },
            ].map(({ Icon, t, s }) => (
              <div key={t} className="flex items-center gap-3 card py-3">
                <div className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center shrink-0">
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

        <p className="relative text-xs text-dark-500 font-mono">v1.0 · painel de controle</p>
      </div>

      {/* ── Painel direito (formulário) ──────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center px-6 py-12 min-h-dvh lg:min-h-0">
        <div className="w-full max-w-sm animate-rise">
          {/* Marca (mobile) */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-8">
            <div className="w-16 h-16 rounded-lg bg-accent-400/15 border border-accent-400/30 flex items-center justify-center shadow-glow">
              <KeyRound size={30} className="text-accent-300" strokeWidth={2} />
            </div>
            <p className="font-display font-bold text-2xl tracking-wide text-white">
              CHAVEIRO<span className="text-accent-400">BOT</span>
            </p>
          </div>

          {/* Alternador entrar/cadastrar */}
          <div className="flex p-1 bg-dark-800 border border-dark-600 rounded-lg mb-6">
            {[['entrar', 'Entrar'], ['cadastrar', 'Criar conta']].map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => { setModo(v); setErro(''); }}
                className={`flex-1 py-2 rounded-md text-sm font-display font-semibold uppercase tracking-wider transition-all ${
                  modo === v ? 'bg-accent-400 text-dark-950' : 'text-muted hover:text-white'
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
              </>
            )}

            <Campo label="Usuário" Icon={User}>
              <input className="input pl-10" placeholder="seu_usuario" value={form.username} onChange={set('username')} autoComplete="username" autoFocus={!ehCadastro} />
            </Campo>

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

            {erro && (
              <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-4 py-3">{erro}</p>
            )}

            <button type="submit" disabled={carregando} className="btn-primary mt-1">
              {carregando ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {carregando ? 'Aguarde…' : ehCadastro ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-xs text-muted mt-6">
            {ehCadastro
              ? 'Ao criar a conta, sua empresa será configurada automaticamente.'
              : 'Acesso restrito · contate o administrador da sua empresa.'}
          </p>
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
