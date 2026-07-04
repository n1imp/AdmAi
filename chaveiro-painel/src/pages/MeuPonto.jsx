import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Fingerprint, LogIn, Coffee, Utensils, LogOut,
  MapPin, Camera, Check, Loader2,
} from 'lucide-react';
import api from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { SkeletonLista } from '../components/Skeleton.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import CapturaSelfie from '../components/CapturaSelfie.jsx';
import { useToast } from '../components/Toast.jsx';

// Ordem fixa das 4 etapas do dia + metadados de exibição (rótulo curto e ícone).
const ETAPAS = [
  { tipo: 'entrada', rotulo: 'Entrada', icon: LogIn },
  { tipo: 'almoco_saida', rotulo: 'Saída para o almoço', icon: Coffee },
  { tipo: 'almoco_volta', rotulo: 'Volta do almoço', icon: Utensils },
  { tipo: 'saida', rotulo: 'Saída', icon: LogOut },
];

// Formata um ISO como HH:MM no fuso de São Paulo. Travessão quando ausente.
function formatarHora(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

// Mapeia o estado do dia (campos entradaEm/almocoSaidaEm/...) para a hora de cada etapa.
function horaDaEtapa(dia, tipo) {
  if (!dia) return null;
  const mapa = {
    entrada: dia.entradaEm,
    almoco_saida: dia.almocoSaidaEm,
    almoco_volta: dia.almocoVoltaEm,
    saida: dia.saidaEm,
  };
  return mapa[tipo] ?? null;
}

// Captura best-effort da geolocalização. Resolve sempre (nunca rejeita): devolve
// as coordenadas quando concedidas ou null quando negadas/indisponíveis/timeout.
function obterLocalizacao() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, precisao: coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

export default function MeuPonto() {
  const toast = useToast();
  const [dia, setDia] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [capturando, setCapturando] = useState(false); // modal de selfie aberto
  const [enviando, setEnviando] = useState(false);
  const [mostrarAviso, setMostrarAviso] = useState(false); // consentimento LGPD (1ª vez)

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const { data } = await api.get('/ponto/hoje');
      setDia(data);
    } catch (err) {
      setErro(err.response?.data?.erro ?? 'Não foi possível carregar o ponto de hoje.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  // Abre o capturador de selfie (a batida só ocorre depois de confirmar a foto).
  // Transparência LGPD: na 1ª batida no aparelho, mostra o aviso de coleta de
  // selfie + localização (finalidade: comprovação de jornada/anti-fraude) antes
  // de capturar. Depois de aceito, vai direto à captura (aviso fixo no rodapé).
  function iniciarBatida() {
    if (dia?.completo || enviando) return;
    let aceito = false;
    try { aceito = localStorage.getItem('ponto_aviso_lgpd') === '1'; } catch { /* storage off */ }
    if (!aceito) { setMostrarAviso(true); return; }
    setCapturando(true);
  }

  // Aceite do aviso de coleta: registra no aparelho e segue para a captura.
  function aceitarAviso() {
    try { localStorage.setItem('ponto_aviso_lgpd', '1'); } catch { /* storage off */ }
    setMostrarAviso(false);
    setCapturando(true);
  }

  // Recebe a selfie (data URL), coleta geo best-effort e envia a batida.
  async function bater(selfie) {
    setCapturando(false);
    setEnviando(true);
    const geo = await obterLocalizacao();
    if (!geo) toast('Sem localização — registrando sem GPS', 'warning');
    try {
      const { data } = await api.post('/ponto/bater', {
        lat: geo?.lat,
        lng: geo?.lng,
        precisao: geo?.precisao,
        selfie,
      });
      setDia(data);
      if (data.jaCompleto) {
        toast('Ponto de hoje já estava concluído', 'warning');
      } else {
        toast(`✓ ${data.rotulo} registrada`, 'success');
      }
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Não foi possível registrar o ponto.', 'error');
    } finally {
      setEnviando(false);
    }
  }

  const completo = dia?.completo;
  const proxima = dia?.proximaBatida;

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Meu ponto" />

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">
        {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

        {carregando ? (
          <SkeletonLista qtd={4} />
        ) : dia ? (
          <div className="flex flex-col gap-5 lg:max-w-xl">
            {/* ── Cartão: ponto de hoje (timeline das 4 etapas) ─────────────── */}
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center shrink-0">
                  <Clock size={22} className="text-accent-300" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="kpi-label">Ponto de hoje</p>
                  <p className="font-display text-lg font-bold text-white leading-tight">
                    {completo ? 'Dia concluído' : proxima ? `Próximo: ${dia.proximaBatidaRotulo}` : 'Sem batidas'}
                  </p>
                </div>
              </div>

              {/* Timeline das etapas */}
              <ol className="relative flex flex-col gap-1">
                {ETAPAS.map((etapa) => {
                  const hora = horaDaEtapa(dia, etapa.tipo);
                  const batida = Boolean(hora);
                  const ehProxima = !completo && proxima === etapa.tipo;
                  const Icone = etapa.icon;
                  return (
                    <li
                      key={etapa.tipo}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                        ehProxima ? 'bg-accent-400/10 border border-accent-400/30' : 'border border-transparent'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                          batida
                            ? 'bg-success/15 border-success/30 text-success'
                            : ehProxima
                              ? 'bg-accent-400/15 border-accent-400/40 text-accent-300'
                              : 'bg-dark-700 border-dark-600 text-dark-500'
                        }`}
                      >
                        {batida ? <Check size={15} /> : <Icone size={15} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${batida || ehProxima ? 'text-white' : 'text-muted'}`}>
                          {etapa.rotulo}
                        </p>
                        {ehProxima && <p className="text-[11px] text-accent-300">Próxima batida</p>}
                      </div>
                      <span
                        className={`font-display font-bold tnum text-sm ${
                          batida ? 'text-white' : ehProxima ? 'text-accent-300' : 'text-dark-500'
                        }`}
                      >
                        {formatarHora(hora)}
                      </span>
                    </li>
                  );
                })}
                {/* Linha vertical conectando os passos */}
                <span className="absolute left-[27px] top-7 bottom-7 w-px bg-dark-600 -z-10" />
              </ol>
            </div>

            {/* ── Botão grande de bater ponto ───────────────────────────────── */}
            <button
              onClick={iniciarBatida}
              disabled={completo || enviando}
              className="btn-primary py-4 text-base disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {enviando ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Registrando…
                </>
              ) : completo ? (
                <>
                  <Check size={18} /> Ponto de hoje concluído ✓
                </>
              ) : (
                <>
                  <Fingerprint size={18} /> Bater ponto — {dia.proximaBatidaRotulo}
                </>
              )}
            </button>
            <p className="text-muted text-xs -mt-2 text-center">
              Ao bater, capturamos uma selfie e sua localização para comprovar a jornada.{' '}
              <a href="/privacidade" className="underline hover:text-white">Política de Privacidade</a>.
            </p>

            {/* ── Histórico do dia ──────────────────────────────────────────── */}
            {dia.batidas?.length > 0 && (
              <div>
                <p className="kpi-label mb-2">Batidas de hoje</p>
                <ul className="flex flex-col gap-2">
                  {dia.batidas.map((b, i) => (
                    <li
                      key={`${b.tipo}-${i}`}
                      className="flex items-center gap-3 rounded-lg border border-dark-600 bg-dark-800 px-3 py-2.5"
                    >
                      <div className="w-8 h-8 rounded-full bg-success/15 border border-success/30 flex items-center justify-center shrink-0 text-success">
                        <Check size={15} />
                      </div>
                      <span className="flex-1 text-sm text-white font-medium truncate">{b.rotulo}</span>
                      <div className="flex items-center gap-2 text-muted shrink-0">
                        {(b.lat != null && b.lng != null) && (
                          <MapPin size={14} className="text-accent-300" aria-label="Com localização" title="Com localização" />
                        )}
                        {b.temSelfie && (
                          <Camera size={14} className="text-accent-300" aria-label="Com selfie" title="Com selfie" />
                        )}
                        <span className="font-display font-bold tnum text-sm text-white">{formatarHora(b.em)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Aviso de coleta (consentimento LGPD) — exibido antes da 1ª captura */}
      {mostrarAviso && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="card p-5 w-full max-w-sm flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center shrink-0">
                <Camera size={20} className="text-accent-300" strokeWidth={1.8} />
              </div>
              <h2 className="font-display text-lg font-bold text-white leading-tight">
                Coleta de selfie e localização
              </h2>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              Para comprovar sua jornada e prevenir fraudes, ao bater o ponto registramos uma{' '}
              <span className="text-white">selfie</span> e sua{' '}
              <span className="text-white">localização (GPS)</span> no momento da batida. Esses
              dados ficam guardados pelo prazo da nossa política e depois são descartados.
            </p>
            <p className="text-xs text-muted">
              Saiba mais na{' '}
              <a href="/privacidade" className="underline text-accent-300 hover:text-white">
                Política de Privacidade
              </a>
              .
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setMostrarAviso(false)}
                className="btn-ghost flex-1 py-2.5"
              >
                Agora não
              </button>
              <button onClick={aceitarAviso} className="btn-primary flex-1 py-2.5">
                <Check size={16} /> Entendi, continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de captura de selfie */}
      <CapturaSelfie
        aberto={capturando}
        onConfirmar={bater}
        onCancelar={() => setCapturando(false)}
      />
    </div>
  );
}
