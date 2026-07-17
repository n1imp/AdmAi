import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { KeyRound, User, ArrowRight, Loader2, XCircle } from 'lucide-react';
import api from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { avaliarForcaSenha } from '../lib/senha.js';

const PAPEL_LABEL = { dono: 'Dono', gestor: 'Gestor', funcionario: 'Funcionário' };

export default function ConviteAceitar() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [convite, setConvite] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [form, setForm] = useState({ nome: '', username: '', senha: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api
      .get(`/convite/${token}`)
      .then(({ data }) => {
        setConvite(data);
        setCarregando(false);
      })
      .catch(() => {
        setErro('Convite inválido ou expirado.');
        setCarregando(false);
      });
  }, [token]);

  async function aceitar(e) {
    e.preventDefault();
    const parse = z
      .object({
        nome: z.string().min(2),
        username: z
          .string()
          .min(3)
          .regex(/^[a-zA-Z0-9_]+$/),
        senha: z.string().min(8),
      })
      .safeParse(form);
    if (!parse.success) {
      setErro('Preencha todos os campos corretamente.');
      return;
    }
    const forca = avaliarForcaSenha(form.senha);
    if (!forca.valida) {
      setErro('Senha fraca. Use ao menos 8 caracteres com maiúscula, número e símbolo.');
      return;
    }
    setEnviando(true);
    setErro('');
    try {
      const { data } = await api.post(`/convite/${token}/aceitar`, {
        nome: form.nome.trim(),
        username: form.username.trim(),
        senha: form.senha,
      });
      login(data.token);
      navigate('/', { replace: true });
    } catch (err) {
      setErro(err.response?.data?.erro ?? 'Não foi possível aceitar o convite. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

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

        <div className="card border-dark-600/80 p-6 sm:p-7">
          {carregando ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={28} className="text-accent-300 animate-spin" />
            </div>
          ) : erro && !convite ? (
            <div className="flex flex-col items-center gap-4 text-center py-4">
              <XCircle size={40} className="text-danger" />
              <div>
                <p className="font-display font-bold text-white text-lg uppercase tracking-wide">
                  Convite inválido
                </p>
                <p className="text-muted text-sm mt-1">{erro}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <p className="text-xs text-accent-300 font-mono uppercase tracking-wider mb-1">
                  Você foi convidado por {convite.convidadoPor ?? 'um administrador'}
                </p>
                <p className="font-display font-bold text-white text-xl uppercase tracking-wide">
                  Entrar em {convite.empresa}
                </p>
                <p className="text-muted text-sm mt-0.5">
                  Como{' '}
                  <strong className="text-white">
                    {PAPEL_LABEL[convite.papel] ?? convite.papel}
                  </strong>{' '}
                  · {convite.email}
                </p>
              </div>

              <form onSubmit={aceitar} className="flex flex-col gap-4">
                <Campo label="Seu nome" Icon={User}>
                  <input
                    className="input pl-10"
                    placeholder="João da Silva"
                    value={form.nome}
                    onChange={set('nome')}
                    autoComplete="name"
                    autoFocus
                  />
                </Campo>
                <Campo label="Usuário" Icon={User}>
                  <input
                    className="input pl-10"
                    placeholder="joao_silva"
                    value={form.username}
                    onChange={set('username')}
                    autoComplete="username"
                  />
                </Campo>
                <Campo label="Senha" Icon={KeyRound}>
                  <input
                    type="password"
                    className="input pl-10"
                    placeholder="••••••••"
                    value={form.senha}
                    onChange={set('senha')}
                    autoComplete="new-password"
                  />
                </Campo>
                <p className="text-[11px] text-muted">
                  Mínimo 8 caracteres, com maiúscula, número e símbolo.
                </p>

                {erro && (
                  <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-4 py-3">
                    {erro}
                  </p>
                )}

                <button type="submit" disabled={enviando} className="btn-primary mt-1">
                  {enviando ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  {enviando ? 'Criando conta…' : 'Aceitar convite'}
                </button>
              </form>
            </>
          )}
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
