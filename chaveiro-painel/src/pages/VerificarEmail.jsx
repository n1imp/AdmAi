import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, KeyRound } from 'lucide-react';
import api from '../lib/api.js';

export default function VerificarEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [estado, setEstado] = useState('verificando'); // 'verificando' | 'ok' | 'erro'

  useEffect(() => {
    if (!token) { setEstado('erro'); return; }
    api.get(`/auth/email/verificar?token=${encodeURIComponent(token)}`)
      .then(() => setEstado('ok'))
      .catch(() => setEstado('erro'));
  }, [token]);

  return (
    <div className="min-h-dvh bg-dark-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center animate-rise">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-10 h-10 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center">
            <KeyRound size={20} className="text-accent-300" strokeWidth={2} />
          </div>
          <p className="font-display font-bold text-xl tracking-wide text-white">
            ADM<span className="text-accent-400">AI</span>
          </p>
        </div>

        <div className="card p-8 flex flex-col items-center gap-5">
          {estado === 'verificando' && (
            <>
              <Loader2 size={40} className="text-accent-300 animate-spin" />
              <p className="text-muted text-sm">Verificando seu e-mail…</p>
            </>
          )}

          {estado === 'ok' && (
            <>
              <CheckCircle size={44} className="text-success" />
              <div>
                <p className="font-display font-bold text-white text-lg uppercase tracking-wide">E-mail verificado!</p>
                <p className="text-muted text-sm mt-1">Sua conta está ativa. Aproveite o AdmAi.</p>
              </div>
              <Link to="/" className="btn-primary w-full">Ir para o painel</Link>
            </>
          )}

          {estado === 'erro' && (
            <>
              <XCircle size={44} className="text-danger" />
              <div>
                <p className="font-display font-bold text-white text-lg uppercase tracking-wide">Link inválido</p>
                <p className="text-muted text-sm mt-1">
                  O link expirou ou já foi usado. Solicite um novo link de verificação no painel em Configurações → Segurança.
                </p>
              </div>
              <Link to="/" className="btn-secondary w-full">Ir para o painel</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
