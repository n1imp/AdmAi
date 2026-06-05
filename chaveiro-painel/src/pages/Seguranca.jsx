import { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, ShieldCheck, LogOut, Check, X } from 'lucide-react';
import api from '../lib/api.js';
import { avaliarForcaSenha } from '../lib/senha.js';
import BackHeader from '../components/BackHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

const CORES_FORCA = {
  fraca: { barra: 'bg-danger', texto: 'text-danger', label: 'Fraca', n: 1 },
  media: { barra: 'bg-warning', texto: 'text-warning', label: 'Média', n: 2 },
  forte: { barra: 'bg-success', texto: 'text-success', label: 'Forte', n: 3 },
};

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
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= cfg.n ? cfg.barra : 'bg-dark-600'}`} />
        ))}
      </div>
      <p className={`text-xs font-medium ${cfg.texto} mb-2`}>Senha {cfg.label.toLowerCase()}</p>
      <ul className="flex flex-col gap-1">
        {REQUISITOS.map((r) => (
          <li key={r.chave} className={`flex items-center gap-1.5 text-xs ${requisitos[r.chave] ? 'text-success' : 'text-muted'}`}>
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
  return (
    <div>
      <label className="kpi-label block mb-2">{label}</label>
      <div className="relative">
        <input
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
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
        >
          {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export default function Seguranca() {
  const toast = useToast();
  const { login } = useAuth();
  const [dados, setDados] = useState(null);

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [toggling2fa, setToggling2fa] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const { data } = await api.get('/me');
      setDados(data);
    } catch {
      // silencioso — a tela de senha funciona sem isso
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

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
      setAtual(''); setNova(''); setConfirma('');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao trocar senha', 'error');
    } finally {
      setSalvando(false);
    }
  }

  async function toggle2fa() {
    setToggling2fa(true);
    try {
      const { data } = await api.patch('/me/2fa', { ativo: !dados.twoFactorAtivo });
      setDados(data);
      toast(data.twoFactorAtivo ? '2FA ativado' : '2FA desativado', 'success');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao alterar 2FA', 'error');
    } finally {
      setToggling2fa(false);
    }
  }

  async function sairDeTudo() {
    setSaindo(true);
    try {
      await api.post('/me/logout-all');
      toast('Todas as sessões foram encerradas', 'success');
      // O token atual também foi invalidado — o interceptor de 401 levará ao login
      setTimeout(() => { window.location.href = '/login'; }, 800);
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao encerrar sessões', 'error');
      setSaindo(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Segurança" />

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8 flex flex-col gap-6 lg:max-w-xl">
        {/* Trocar senha */}
        <section>
          <p className="section-label mb-2 px-1">Senha</p>
          <form onSubmit={trocarSenha} className="card flex flex-col gap-4">
            <CampoSenha label="Senha atual" valor={atual} onChange={setAtual} autoComplete="current-password" />
            <div>
              <CampoSenha label="Nova senha" valor={nova} onChange={setNova} autoComplete="new-password" />
              <MedidorForca senha={nova} />
            </div>
            <CampoSenha label="Confirmar nova senha" valor={confirma} onChange={setConfirma} autoComplete="new-password" />
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
              onClick={toggle2fa}
              disabled={toggling2fa || !dados}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${dados?.twoFactorAtivo ? 'bg-success' : 'bg-dark-600'} disabled:opacity-50`}
              aria-label="Alternar 2FA"
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${dados?.twoFactorAtivo ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        </section>

        {/* Sessões */}
        <section>
          <p className="section-label mb-2 px-1">Sessões</p>
          <div className="card flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-success shrink-0 animate-pulse-glow" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm">Sessão atual</p>
                <p className="text-muted text-xs">Este dispositivo</p>
              </div>
            </div>
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
      </div>
    </div>
  );
}
