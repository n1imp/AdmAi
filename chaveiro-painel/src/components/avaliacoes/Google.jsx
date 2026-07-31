import { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  Wand2,
  Unplug,
  FlaskConical,
  Store,
  ShieldAlert,
} from 'lucide-react';
import api, { formatarData } from '../../lib/api.js';
import { SkeletonLista } from '../Skeleton.jsx';
import EstadoVazio from '../EstadoVazio.jsx';
import ErroBanner from '../ErroBanner.jsx';
import { useToast } from '../Toast.jsx';
import Estrelas from './Estrelas.jsx';

const NOTAS = [
  { value: '', label: 'Todas' },
  { value: '5', label: '5★' },
  { value: '4', label: '4★' },
  { value: '3', label: '3★' },
  { value: '2', label: '2★' },
  { value: '1', label: '1★' },
];

const PERIODOS = [
  { value: '', label: 'Sempre' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

const RESPONDIDA = [
  { value: '', label: 'Todas' },
  { value: 'false', label: 'Sem resposta' },
  { value: 'true', label: 'Respondidas' },
];

// Aba "Google": conexão Business Profile + avaliações reais (ou mock) + IA.
export default function Google() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [carregandoStatus, setCarregandoStatus] = useState(true);
  const [erroStatus, setErroStatus] = useState(null);

  const [placeId, setPlaceId] = useState('');
  const [salvandoPlace, setSalvandoPlace] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [mostrarPlaceManual, setMostrarPlaceManual] = useState(false);

  // Descoberta automática das lojas (locations) após o OAuth + estado de verificação.
  const [locations, setLocations] = useState([]);
  const [carregandoLocations, setCarregandoLocations] = useState(false);
  const [verificacaoPendente, setVerificacaoPendente] = useState(false);
  const [salvandoLoja, setSalvandoLoja] = useState(null); // locationId em salvamento

  const [filtros, setFiltros] = useState({ nota: '', periodo: '', respondida: '' });
  const [reviews, setReviews] = useState([]);
  const [carregandoReviews, setCarregandoReviews] = useState(false);
  const [erroReviews, setErroReviews] = useState(null);

  const buscarStatus = useCallback(async () => {
    setErroStatus(null);
    try {
      const { data } = await api.get('/google/status');
      setStatus(data);
      if (data.placeId) setPlaceId(data.placeId);
    } catch (e) {
      if (e.response?.status === 503) {
        setStatus({ desabilitado: true });
      } else {
        setErroStatus('Não foi possível carregar a integração com o Google.');
      }
    } finally {
      setCarregandoStatus(false);
    }
  }, []);

  useEffect(() => {
    buscarStatus();
  }, [buscarStatus]);

  const conectado = status?.conectado;
  const ehMock = status?.modo === 'mock';
  const podeListar = conectado || ehMock;

  const buscarReviews = useCallback(async () => {
    if (!podeListar) return;
    setErroReviews(null);
    setCarregandoReviews(true);
    try {
      const params = new URLSearchParams();
      if (filtros.nota) params.set('nota', filtros.nota);
      if (filtros.periodo) params.set('periodo', filtros.periodo);
      if (filtros.respondida) params.set('respondida', filtros.respondida);
      const qs = params.toString();
      const { data } = await api.get(`/google/reviews${qs ? `?${qs}` : ''}`);
      setReviews(Array.isArray(data.data) ? data.data : []);
    } catch {
      setErroReviews('Não foi possível carregar as avaliações do Google.');
    } finally {
      setCarregandoReviews(false);
    }
  }, [filtros, podeListar]);

  useEffect(() => {
    if (podeListar) buscarReviews();
  }, [buscarReviews, podeListar]);

  const precisaLoja = status?.precisaSelecionarLoja;

  // Busca as lojas do Google para o dono escolher (auto-descoberta após o OAuth).
  const buscarLocations = useCallback(async () => {
    setCarregandoLocations(true);
    setVerificacaoPendente(false);
    try {
      const { data } = await api.get('/google/locations');
      setLocations(Array.isArray(data.locations) ? data.locations : []);
      setVerificacaoPendente(Boolean(data.verificacaoPendente));
    } catch {
      setLocations([]);
    } finally {
      setCarregandoLocations(false);
    }
  }, []);

  useEffect(() => {
    if (precisaLoja) buscarLocations();
  }, [precisaLoja, buscarLocations]);

  async function selecionarLoja(loc) {
    setSalvandoLoja(loc.locationId);
    try {
      await api.post('/google/location', {
        accountId: loc.accountId,
        locationId: loc.locationId,
        placeId: loc.placeId ?? null,
      });
      toast('Loja conectada!', 'success');
      buscarStatus();
    } catch (e) {
      toast(e.response?.data?.erro ?? 'Erro ao selecionar a loja', 'error');
    } finally {
      setSalvandoLoja(null);
    }
  }

  async function salvarPlaceId() {
    if (!placeId.trim()) {
      toast('Informe o Place ID', 'warning');
      return;
    }
    setSalvandoPlace(true);
    try {
      await api.post('/google/place-id', { placeId: placeId.trim() });
      toast('Place ID salvo', 'success');
      buscarStatus();
    } catch (e) {
      toast(e.response?.data?.erro ?? 'Erro ao salvar Place ID', 'error');
    } finally {
      setSalvandoPlace(false);
    }
  }

  async function conectarGoogle() {
    setConectando(true);
    try {
      const { data } = await api.get('/google/oauth/iniciar');
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast('Integração indisponível no momento', 'warning');
      }
    } catch (e) {
      toast(e.response?.data?.erro ?? 'Não foi possível iniciar a conexão com o Google', 'error');
    } finally {
      setConectando(false);
    }
  }

  async function desconectarGoogle() {
    setDesconectando(true);
    try {
      await api.post('/google/desconectar');
      toast('Conta Google desconectada', 'success');
      setReviews([]);
      buscarStatus();
    } catch {
      toast('Erro ao desconectar', 'error');
    } finally {
      setDesconectando(false);
    }
  }

  function aoResponder(reviewId, respostaTexto, respondidoEm) {
    setReviews((prev) =>
      prev.map((r) =>
        r.reviewId === reviewId ? { ...r, respondida: true, respostaTexto, respondidoEm } : r
      )
    );
  }

  if (carregandoStatus) {
    return (
      <div className="px-4 pt-2">
        <SkeletonLista qtd={3} />
      </div>
    );
  }

  if (status?.desabilitado) {
    return (
      <div className="px-4 pt-2">
        <EstadoVazio
          mensagem="Integração com o Google indisponível"
          sub="A integração com o Google Business está desabilitada neste ambiente."
        />
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-6 space-y-5">
      {erroStatus && <ErroBanner mensagem={erroStatus} onRetry={buscarStatus} />}

      {/* Conexão */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white text-sm font-semibold flex items-center gap-2">
            <MapPin size={15} className="text-accent-300" /> Google Business
          </p>
          {ehMock && (
            <span className="badge bg-warning/10 text-warning border border-warning/20">
              <FlaskConical size={11} /> Modo demonstração
            </span>
          )}
          {conectado && !ehMock && (
            <span className="badge bg-success/10 text-success border border-success/20">
              <CheckCircle2 size={11} /> Conectado
            </span>
          )}
          {verificacaoPendente && !conectado && (
            <span className="badge bg-warning/10 text-warning border border-warning/20">
              <ShieldAlert size={11} /> Em verificação
            </span>
          )}
        </div>

        {conectado ? (
          <div className="flex items-center justify-between">
            <p className="text-muted text-xs">
              {status.conectadoEm
                ? `Conectado em ${formatarData(status.conectadoEm)}`
                : 'Loja do Google vinculada'}
            </p>
            <button
              onClick={desconectarGoogle}
              disabled={desconectando}
              className="text-danger text-xs font-medium flex items-center gap-1 hover:underline disabled:opacity-50"
            >
              {desconectando ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Unplug size={12} />
              )}{' '}
              Desconectar
            </button>
          </div>
        ) : status?.precisaSelecionarLoja ? (
          verificacaoPendente ? (
            <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 space-y-1.5">
              <p className="text-warning text-sm font-semibold flex items-center gap-1.5">
                <ShieldAlert size={14} /> Integração em verificação pelo Google
              </p>
              <p className="text-muted text-xs leading-relaxed">
                Sua conta foi conectada, mas o acesso à API do Google ainda está sendo
                liberado/aprovado. Assim que aprovado, suas lojas aparecerão aqui automaticamente
                para você escolher.
              </p>
              <button
                onClick={buscarLocations}
                disabled={carregandoLocations}
                className="text-accent-300 text-xs font-medium flex items-center gap-1 hover:text-accent-400"
              >
                <RefreshCw size={12} className={carregandoLocations ? 'animate-spin' : ''} />{' '}
                Verificar novamente
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-white text-xs font-semibold flex items-center gap-1.5">
                <Store size={13} className="text-accent-300" /> Selecione a sua loja
              </p>
              {carregandoLocations ? (
                <SkeletonLista qtd={2} />
              ) : locations.length === 0 ? (
                <p className="text-muted text-xs">
                  Nenhuma loja encontrada nesta conta do Google.{' '}
                  <button onClick={buscarLocations} className="text-accent-300 hover:underline">
                    Atualizar
                  </button>
                </p>
              ) : (
                <div className="space-y-2">
                  {locations.map((loc) => (
                    <div
                      key={loc.locationId}
                      className="flex items-center justify-between gap-2 bg-dark-700 border border-dark-600 rounded-lg p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {loc.title || 'Loja'}
                        </p>
                        {loc.endereco && (
                          <p className="text-muted text-xs truncate">{loc.endereco}</p>
                        )}
                      </div>
                      <button
                        onClick={() => selecionarLoja(loc)}
                        disabled={salvandoLoja === loc.locationId}
                        className="btn-primary w-auto px-3 py-1.5 text-xs shrink-0 flex items-center gap-1"
                      >
                        {salvandoLoja === loc.locationId ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          'Usar esta'
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          <button
            onClick={conectarGoogle}
            disabled={conectando}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {conectando ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            {conectando ? 'Abrindo Google…' : 'Conectar com Google'}
          </button>
        )}

        {status?.validateOnly && (
          <p className="text-warning text-xs flex items-center gap-1">
            <FlaskConical size={11} /> Validação apenas: as respostas não são publicadas de fato
            neste ambiente.
          </p>
        )}

        {/* Avançado: informar o Place ID manualmente (fallback ao seletor automático) */}
        {!conectado && (
          <div className="pt-1 border-t border-dark-700">
            <button
              onClick={() => setMostrarPlaceManual((v) => !v)}
              className="text-muted text-xs hover:text-white transition-colors"
            >
              {mostrarPlaceManual ? '− ' : '+ '}Informar o Place ID manualmente (avançado)
            </button>
            {mostrarPlaceManual && (
              <div className="mt-2">
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={placeId}
                    onChange={(e) => setPlaceId(e.target.value)}
                    placeholder="ChIJ..."
                  />
                  <button
                    onClick={salvarPlaceId}
                    disabled={salvandoPlace}
                    className="btn-primary w-auto px-4 flex items-center gap-1.5"
                  >
                    {salvandoPlace ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}
                  </button>
                </div>
                <p className="text-muted text-xs mt-1.5">
                  Encontre em google.com/maps → sua loja → Compartilhar → copie o ID do local.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* IA — resumo agregado */}
      {status?.iaDisponivel && status?.analise && (
        <div className="card space-y-3">
          <p className="text-white text-sm font-semibold flex items-center gap-2">
            <Sparkles size={15} className="text-accent-300" /> Análise por IA
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-success/5 border border-success/20 rounded-lg p-3">
              <p className="text-success text-xs font-semibold flex items-center gap-1.5 mb-1">
                <ThumbsUp size={13} /> O que elogiam mais
              </p>
              <p className="text-muted text-xs leading-relaxed">
                {status.analise.resumoElogios || 'Sem dados ainda.'}
              </p>
            </div>
            <div className="bg-danger/5 border border-danger/20 rounded-lg p-3">
              <p className="text-danger text-xs font-semibold flex items-center gap-1.5 mb-1">
                <ThumbsDown size={13} /> O que aparece negativamente
              </p>
              <p className="text-muted text-xs leading-relaxed">
                {status.analise.resumoCriticas || 'Sem dados ainda.'}
              </p>
            </div>
          </div>
          {status.analise.atualizadoEm && (
            <p className="text-dark-500 text-[11px]">
              Atualizado em {formatarData(status.analise.atualizadoEm)}
            </p>
          )}
        </div>
      )}

      {/* Avaliações */}
      {!podeListar ? (
        <EstadoVazio
          mensagem="Conecte sua conta do Google"
          sub="Após conectar, suas avaliações do Google aparecerão aqui para você responder."
        />
      ) : (
        <div className="space-y-3">
          {/* Filtros */}
          <div className="space-y-2">
            <FiltroLinha
              label="Nota"
              opcoes={NOTAS}
              value={filtros.nota}
              onChange={(v) => setFiltros((f) => ({ ...f, nota: v }))}
            />
            <FiltroLinha
              label="Período"
              opcoes={PERIODOS}
              value={filtros.periodo}
              onChange={(v) => setFiltros((f) => ({ ...f, periodo: v }))}
            />
            <div className="flex items-center justify-between gap-2">
              <FiltroLinha
                label="Status"
                opcoes={RESPONDIDA}
                value={filtros.respondida}
                onChange={(v) => setFiltros((f) => ({ ...f, respondida: v }))}
              />
              <button
                onClick={buscarReviews}
                aria-label="Atualizar"
                className="w-9 h-9 shrink-0 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-muted hover:text-accent-300 transition-colors"
              >
                <RefreshCw size={16} className={carregandoReviews ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {erroReviews && <ErroBanner mensagem={erroReviews} onRetry={buscarReviews} />}

          {carregandoReviews ? (
            <SkeletonLista qtd={4} />
          ) : reviews.length === 0 ? (
            <EstadoVazio
              mensagem="Nenhuma avaliação encontrada"
              sub="Ajuste os filtros ou aguarde a próxima sincronização."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {reviews.map((r) => (
                <ReviewCard
                  key={r.reviewId}
                  review={r}
                  onResponder={aoResponder}
                  validateOnly={status?.validateOnly}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FiltroLinha({ label, opcoes, value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-muted text-[10px] font-display font-semibold uppercase tracking-wide w-14 shrink-0">
        {label}
      </span>
      <div className="flex gap-1.5 flex-wrap">
        {opcoes.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              value === o.value
                ? 'bg-accent-400 text-dark-950'
                : 'bg-dark-700 text-muted border border-dark-600 hover:text-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ review, onResponder, validateOnly }) {
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aberto, setAberto] = useState(false);

  const sugestao = review.analiseJson?.sugestaoResposta;

  async function responder() {
    if (!texto.trim()) {
      toast('Escreva uma resposta', 'warning');
      return;
    }
    setEnviando(true);
    try {
      const { data } = await api.post(`/google/reviews/${review.reviewId}/responder`, {
        texto: texto.trim(),
      });
      onResponder(review.reviewId, texto.trim(), new Date().toISOString());
      toast(
        data?.mensagem ?? (data?.validado ? 'Resposta validada' : 'Resposta publicada'),
        'success'
      );
      setAberto(false);
    } catch (e) {
      toast(e.response?.data?.erro ?? 'Erro ao responder', 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="card animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">
            {review.autorNome || 'Cliente do Google'}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Estrelas nota={review.nota} size={14} />
            <span className="text-muted text-xs tnum">{review.nota}.0</span>
          </div>
        </div>
        {review.respondida && (
          <span className="badge bg-success/10 text-success border border-success/20 shrink-0">
            <CheckCircle2 size={11} /> Respondida
          </span>
        )}
      </div>

      {review.comentario && <p className="mt-2 text-sm text-muted italic">"{review.comentario}"</p>}
      <p className="text-[11px] text-dark-500 mt-2">{formatarData(review.criadoEmGoogle)}</p>

      {review.respondida ? (
        review.respostaTexto && (
          <div className="mt-3 bg-dark-700/60 border border-dark-600 rounded-lg p-3">
            <p className="text-success text-[11px] font-semibold mb-1">Sua resposta</p>
            <p className="text-muted text-xs">{review.respostaTexto}</p>
          </div>
        )
      ) : !aberto ? (
        <button
          onClick={() => {
            setAberto(true);
            // Era `setTexto('')` — o guard exigia `!texto` (já vazio) e então gravava
            // vazio de novo: um no-op. A intenção do botão é justamente preencher o
            // campo com a sugestão da IA.
            if (sugestao && !texto) setTexto(sugestao);
          }}
          className="mt-3 text-accent-300 text-xs font-medium flex items-center gap-1 hover:text-accent-400"
        >
          <Send size={13} /> Responder
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          {sugestao && (
            <button
              onClick={() => setTexto(sugestao)}
              className="text-xs font-medium text-accent-300 flex items-center gap-1.5 hover:text-accent-400"
            >
              <Wand2 size={13} /> Usar sugestão da IA
            </button>
          )}
          <textarea
            className="input w-full min-h-[80px] resize-y"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva uma resposta cordial ao cliente…"
            autoFocus
          />
          {validateOnly && (
            <p className="text-warning text-[11px] flex items-center gap-1">
              <FlaskConical size={10} /> Esta resposta será apenas validada (não publicada).
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={() => setAberto(false)} className="btn-ghost flex-1 py-2">
              Cancelar
            </button>
            <button
              onClick={responder}
              disabled={enviando || !texto.trim()}
              className="btn-primary flex-1 py-2 flex items-center justify-center gap-1.5"
            >
              {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
