import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Zap, CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import api from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function MagicLink() {
  const [params] = useSearchParams();
  const token = params.get('token');
  return token ? <TelaVerificar token={token} /> : <TelaSolicitar />;
}

function TelaSolicitar() {
  const [email, setEmail] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  async function solicitar(e) {
    e.preventDefault();
    if (!email.trim()) {
      setErro('Informe seu e-mail.');
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      await api.post('/auth/magic-link', { email: email.trim() });
      setEnviado(true);
    } catch {
      setErro('Não foi possível enviar o link. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-dark-900 px-4">
      <div className="w-full max-w-sm">
        {enviado ? (
          <div className="card p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle size={40} className="text-success" />
            <p className="font-display font-bold text-lg text-white">Verifique seu e-mail</p>
            <p className="text-muted text-sm">
              Enviamos um link de acesso para <strong className="text-white">{email}</strong>.
              Válido por 15 minutos.
            </p>
            <a
              href="/login"
              className="text-xs text-accent-300 hover:text-accent-200 transition-colors flex items-center gap-1"
            >
              <ArrowLeft size={12} /> Voltar ao login
            </a>
          </div>
        ) : (
          <div className="card p-8 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center">
                <Zap size={20} className="text-accent-300" />
              </div>
              <div>
                <p className="font-display font-bold text-white">Entrar sem senha</p>
                <p className="text-muted text-xs">Receba um link de acesso no seu e-mail.</p>
              </div>
            </div>

            <form onSubmit={solicitar} className="flex flex-col gap-4">
              <div>
                <label htmlFor="magic-email" className="kpi-label block mb-1.5">
                  E-mail
                </label>
                <input
                  id="magic-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="voce@empresa.com"
                  autoFocus
                  autoComplete="email"
                />
              </div>
              {erro && <p className="text-danger text-sm">{erro}</p>}
              <button type="submit" disabled={carregando} className="btn-primary">
                {carregando ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                {carregando ? 'Enviando…' : 'Enviar link'}
              </button>
            </form>

            <a
              href="/login"
              className="text-xs text-center text-muted hover:text-white transition-colors flex items-center justify-center gap-1"
            >
              <ArrowLeft size={12} /> Voltar ao login com senha
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function TelaVerificar({ token }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [estado, setEstado] = useState('verificando');

  useEffect(() => {
    api
      .get(`/auth/magic-link/verificar?token=${encodeURIComponent(token)}`)
      .then(({ data }) => {
        login(data.token);
        navigate('/', { replace: true });
      })
      .catch(() => setEstado('erro'));
  }, [token, login, navigate]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-dark-900 px-4">
      <div className="card p-8 w-full max-w-xs flex flex-col items-center gap-4 text-center">
        {estado === 'verificando' ? (
          <>
            <Loader2 size={40} className="text-accent-300 animate-spin" />
            <p className="text-muted text-sm">Verificando link…</p>
          </>
        ) : (
          <>
            <XCircle size={40} className="text-danger" />
            <p className="font-display font-bold text-white">Link inválido ou expirado</p>
            <p className="text-muted text-sm">Solicite um novo link de acesso.</p>
            <a href="/magic-link" className="btn-primary mt-1 text-sm">
              Solicitar novo link
            </a>
          </>
        )}
      </div>
    </div>
  );
}
