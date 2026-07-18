import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  KeyRound,
  AtSign,
  Eye,
  EyeOff,
  CheckCircle,
  ArrowRight,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import api from '../lib/api.js';

export default function RecuperarSenha() {
  const [params] = useSearchParams();
  const token = params.get('token');
  // Quando `token` está na URL, estamos na etapa de redefinição; senão, na de pedido.
  return token ? <TelaRedefinir token={token} /> : <TelaRecuperar />;
}

function TelaRecuperar() {
  const [email, setEmail] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e) {
    e.preventDefault();
    if (!email.trim()) {
      setErro('Informe seu e-mail.');
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      await api.post('/auth/recuperar-senha', { email: email.trim() });
      setEnviado(true);
    } catch {
      setErro('Não foi possível enviar. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <ContainerPublico>
      {enviado ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle size={44} className="text-success" />
          <div>
            <p className="font-display font-bold text-white text-lg uppercase tracking-wide">
              Verifique seu e-mail
            </p>
            <p className="text-muted text-sm mt-1">
              Se existe uma conta com esse e-mail, enviamos um link para redefinir a senha.
              Verifique também a caixa de spam.
            </p>
          </div>
          <Link to="/login" className="btn-secondary w-full">
            Voltar ao login
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-5">
            <p className="font-display font-bold text-white text-xl uppercase tracking-wide">
              Recuperar senha
            </p>
            <p className="text-muted text-sm mt-0.5">
              Digite seu e-mail e enviamos um link de redefinição.
            </p>
          </div>

          <form onSubmit={enviar} className="flex flex-col gap-4">
            <div>
              <label className="kpi-label block mb-1.5">E-mail</label>
              <div className="relative">
                <AtSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="email"
                  className="input pl-10"
                  placeholder="voce@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            {erro && (
              <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-4 py-3">
                {erro}
              </p>
            )}

            <button type="submit" disabled={carregando} className="btn-primary mt-1">
              {carregando ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              {carregando ? 'Enviando…' : 'Enviar link'}
            </button>
          </form>

          <Link
            to="/login"
            className="mt-5 flex items-center justify-center gap-1.5 text-sm text-muted hover:text-white transition-colors"
          >
            <ArrowLeft size={14} /> Voltar ao login
          </Link>
        </>
      )}
    </ContainerPublico>
  );
}

function TelaRedefinir({ token }) {
  const [senha, setSenha] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState('');

  async function redefinir(e) {
    e.preventDefault();
    if (senha.length < 8) {
      setErro('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      await api.post('/auth/redefinir-senha', { token, novaSenha: senha });
      setOk(true);
    } catch (err) {
      setErro(err.response?.data?.erro ?? 'Link inválido ou expirado. Solicite um novo.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <ContainerPublico>
      {ok ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle size={44} className="text-success" />
          <div>
            <p className="font-display font-bold text-white text-lg uppercase tracking-wide">
              Senha redefinida!
            </p>
            <p className="text-muted text-sm mt-1">
              Sua senha foi atualizada. Todas as sessões anteriores foram encerradas.
            </p>
          </div>
          <Link to="/login" className="btn-primary w-full">
            Ir para o login
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-5">
            <p className="font-display font-bold text-white text-xl uppercase tracking-wide">
              Nova senha
            </p>
            <p className="text-muted text-sm mt-0.5">
              Escolha uma senha forte com pelo menos 8 caracteres.
            </p>
          </div>

          <form onSubmit={redefinir} className="flex flex-col gap-4">
            <div>
              <label className="kpi-label block mb-1.5">Nova senha</label>
              <div className="relative">
                <KeyRound
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type={mostrar ? 'text' : 'password'}
                  className="input pl-10 pr-11"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setMostrar(!mostrar)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-accent-300 transition-colors"
                >
                  {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-[11px] text-muted mt-1.5">
                Mínimo 8 caracteres, com maiúscula, número e símbolo.
              </p>
            </div>

            {erro && (
              <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-4 py-3">
                {erro}
              </p>
            )}

            <button type="submit" disabled={carregando} className="btn-primary mt-1">
              {carregando ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              {carregando ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </form>
        </>
      )}
    </ContainerPublico>
  );
}

function ContainerPublico({ children }) {
  return (
    <div className="min-h-dvh bg-dark-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-[400px] animate-rise">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center">
            <KeyRound size={18} className="text-accent-300" strokeWidth={2} />
          </div>
          <p className="font-display font-bold text-xl tracking-wide text-white">
            ADM<span className="text-accent-400">AI</span>
          </p>
        </div>
        <div className="card border-dark-600/80 p-6 sm:p-7">{children}</div>
      </div>
    </div>
  );
}
