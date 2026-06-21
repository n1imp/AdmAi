import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, ShieldCheck, ArrowRight, Loader2, LogOut, Check, X } from 'lucide-react';
import api from '../lib/api.js';
import { avaliarForcaSenha } from '../lib/senha.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const REQUISITOS = [
  { chave: 'tamanho', label: 'Pelo menos 8 caracteres' },
  { chave: 'maiuscula', label: 'Uma letra maiúscula' },
  { chave: 'minuscula', label: 'Uma letra minúscula' },
  { chave: 'numero', label: 'Um número' },
  { chave: 'especial', label: 'Um caractere especial' },
];

// Tela focada (sem Layout/Sidebar) de troca de senha forçada: o usuário entrou
// com um PIN provisório e precisa definir a senha definitiva antes de seguir.
export default function TrocarSenha() {
  const navigate = useNavigate();
  const { login, logout } = useAuth();

  const [pinAtual, setPinAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [mostrarPin, setMostrarPin] = useState(false);
  const [mostrarNova, setMostrarNova] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const forca = avaliarForcaSenha(nova);
  const senhasIguais = nova === confirma;
  const podeEnviar = pinAtual.trim() && forca.valida && senhasIguais;

  async function enviar(e) {
    e.preventDefault();
    if (!pinAtual.trim()) { setErro('Informe o PIN atual.'); return; }
    if (nova.length < 8) { setErro('A nova senha precisa ter no mínimo 8 caracteres.'); return; }
    if (!senhasIguais) { setErro('As senhas não coincidem.'); return; }
    if (!forca.valida) { setErro('A nova senha é muito fraca.'); return; }
    setCarregando(true); setErro('');
    try {
      const { data } = await api.patch('/me/senha', { senhaAtual: pinAtual, novaSenha: nova });
      login(data.token); // novo token já sem o flag de senha provisória
      navigate('/', { replace: true });
    } catch (err) {
      const r = err.response;
      setErro(r?.data?.erro
        ? `${r.data.erro}${r.data.requisitos ? ' — ' + Object.values(r.data.requisitos).filter(Boolean).join(', ') : ''}`
        : 'Não foi possível trocar a senha. Tente novamente.');
    } finally { setCarregando(false); }
  }

  function sair() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-10 bg-dark-900 relative">
      <div className="absolute -top-24 right-0 w-80 h-80 rounded-full bg-accent-400/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-[400px] animate-rise relative">
        {/* Marca */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-16 h-16 rounded-xl bg-accent-400/15 border border-accent-400/30 flex items-center justify-center shadow-glow">
            <KeyRound size={30} className="text-accent-300" strokeWidth={2} />
          </div>
          <p className="font-display font-bold text-2xl tracking-wide text-white">
            CHAVEIRO<span className="text-accent-400">BOT</span>
          </p>
        </div>

        <div className="card border-dark-600/80 p-6 sm:p-7">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-lg bg-accent-400/15 border border-accent-400/30 flex items-center justify-center mb-3">
              <ShieldCheck size={24} className="text-accent-300" />
            </div>
            <h1 className="font-display font-bold text-lg text-white uppercase tracking-wide">Defina sua senha</h1>
            <p className="text-muted text-sm mt-1">
              Você entrou com um PIN provisório. Crie uma senha definitiva para continuar.
            </p>
          </div>

          <form onSubmit={enviar} className="flex flex-col gap-4">
            {/* PIN atual */}
            <div>
              <label className="kpi-label block mb-1.5">PIN atual (o que você recebeu)</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type={mostrarPin ? 'text' : 'password'}
                  className="input pl-10 pr-11"
                  placeholder="••••••"
                  value={pinAtual}
                  onChange={(e) => setPinAtual(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
                <button type="button" onClick={() => setMostrarPin(!mostrarPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-accent-300 transition-colors">
                  {mostrarPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Nova senha */}
            <div>
              <label className="kpi-label block mb-1.5">Nova senha</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type={mostrarNova ? 'text' : 'password'}
                  className="input pl-10 pr-11"
                  placeholder="••••••••"
                  value={nova}
                  onChange={(e) => setNova(e.target.value)}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setMostrarNova(!mostrarNova)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-accent-300 transition-colors">
                  {mostrarNova ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-[11px] text-muted mt-1.5">Mínimo 8 caracteres, com maiúscula, número e símbolo.</p>
              {nova && (
                <ul className="flex flex-col gap-1 mt-2">
                  {REQUISITOS.map((r) => (
                    <li key={r.chave} className={`flex items-center gap-1.5 text-xs ${forca.requisitos[r.chave] ? 'text-success' : 'text-muted'}`}>
                      {forca.requisitos[r.chave] ? <Check size={12} /> : <X size={12} />}
                      {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Confirmar */}
            <div>
              <label className="kpi-label block mb-1.5">Confirmar nova senha</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type={mostrarNova ? 'text' : 'password'}
                  className="input pl-10 pr-11"
                  placeholder="••••••••"
                  value={confirma}
                  onChange={(e) => setConfirma(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {confirma && !senhasIguais && <p className="text-danger text-xs mt-1.5">As senhas não coincidem.</p>}
            </div>

            {erro && <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-4 py-3">{erro}</p>}

            <button type="submit" disabled={carregando || !podeEnviar} className="btn-primary mt-1">
              {carregando ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {carregando ? 'Salvando…' : 'Definir senha e entrar'}
            </button>

            <button
              type="button"
              onClick={sair}
              className="flex items-center justify-center gap-1.5 text-sm text-muted hover:text-white transition-colors"
            >
              <LogOut size={14} /> Sair
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
