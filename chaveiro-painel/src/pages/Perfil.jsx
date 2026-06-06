import { useState, useEffect, useCallback } from 'react';
import { User, Mail, Phone, CheckCircle2, AlertCircle, AtSign } from 'lucide-react';
import api from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { SkeletonLista } from '../components/Skeleton.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';

function SeloVerificacao({ verificado, preenchido }) {
  if (!preenchido) return null;
  return verificado ? (
    <span className="badge bg-success/10 text-success border border-success/20 text-[10px]">
      <CheckCircle2 size={11} /> confirmado
    </span>
  ) : (
    <span className="badge bg-dark-700 text-muted border border-dark-600 text-[10px]">
      <AlertCircle size={11} /> não confirmado
    </span>
  );
}

export default function Perfil() {
  const toast = useToast();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const { data } = await api.get('/me');
      setDados(data);
      setNome(data.nome ?? '');
      setEmail(data.email ?? '');
      setTelefone(data.telefone ?? '');
    } catch {
      setErro('Não foi possível carregar o perfil.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  const alterado =
    dados && (nome !== (dados.nome ?? '') || email !== (dados.email ?? '') || telefone !== (dados.telefone ?? ''));

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim() || nome.trim().length < 2) {
      toast('Nome deve ter ao menos 2 caracteres', 'error');
      return;
    }
    setSalvando(true);
    try {
      const { data } = await api.patch('/me', {
        nome: nome.trim(),
        email: email.trim(),
        telefone: telefone.trim(),
      });
      setDados(data);
      toast('Perfil atualizado', 'success');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao salvar', 'error');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Perfil" />

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">
        {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

        {carregando ? (
          <SkeletonLista qtd={3} />
        ) : dados ? (
          <form onSubmit={salvar} className="flex flex-col gap-5 lg:max-w-xl">
            {/* Avatar + identidade */}
            <div className="flex items-center gap-4 mb-1">
              <div className="w-16 h-16 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center shrink-0">
                <User size={30} className="text-accent-300" strokeWidth={1.6} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-lg font-bold text-white truncate">{dados.nome}</p>
                <p className="text-muted text-sm flex items-center gap-1">
                  <AtSign size={13} /> {dados.username}
                  {dados.admin && (
                    <span className="badge bg-indigo-400/15 text-indigo-300 border-indigo-400/20 text-[9px] ml-1">admin</span>
                  )}
                </p>
              </div>
            </div>

            <div>
              <label className="kpi-label block mb-2">Nome</label>
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="kpi-label flex items-center gap-1.5"><Mail size={13} /> E-mail</label>
                <SeloVerificacao verificado={dados.emailVerificado} preenchido={!!dados.email} />
              </div>
              <input
                className="input" type="email" inputMode="email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="kpi-label flex items-center gap-1.5"><Phone size={13} /> Telefone</label>
                <SeloVerificacao verificado={dados.telefoneVerificado} preenchido={!!dados.telefone} />
              </div>
              <input
                className="input" type="tel" inputMode="tel" autoComplete="tel"
                value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="+55 (11) 99999-9999"
              />
            </div>

            <p className="text-muted text-xs -mt-1">
              E-mail e telefone são usados apenas para contato e identificação da conta.
            </p>

            <button type="submit" disabled={salvando || !alterado} className="btn-primary mt-1">
              {salvando ? 'Salvando…' : alterado ? 'Salvar alterações' : 'Tudo salvo'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
