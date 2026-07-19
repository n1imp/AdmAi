import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Upload,
  Download,
  Trash2,
  File as FileIcon,
  ShieldCheck,
  Loader,
} from 'lucide-react';
import api, { formatarData } from '../lib/api.js';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import FeedbackState from '../components/ui/FeedbackState.jsx';
import { useToast } from '../components/Toast.jsx';

// F9/M4: documentos do próprio funcionário (contrato, RG, CNH…) em bucket privado.
// Atrás da flag DOCUMENTOS_ENABLED (o endpoint responde 404 → a tela mostra "indisponível").
// RBAC: capacidade proprio.documentos (a rota já valida; aqui é só UX).
const MAX_BYTES = 5 * 1024 * 1024;
const MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const TIPOS = [
  { value: 'contrato', label: 'Contrato' },
  { value: 'rg', label: 'RG' },
  { value: 'cpf', label: 'CPF' },
  { value: 'cnh', label: 'CNH' },
  { value: 'comprovante', label: 'Comprovante' },
  { value: 'outro', label: 'Outro' },
];
const ROTULO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));

function formatarTamanho(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function lerComoDataURI(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

export default function Documentos() {
  const toast = useToast();
  const [docs, setDocs] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [disponivel, setDisponivel] = useState(true);
  const [tipo, setTipo] = useState('contrato');
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [baixandoId, setBaixandoId] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [removendoId, setRemovendoId] = useState(null);

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const { data } = await api.get('/me/documentos');
      setDocs(Array.isArray(data?.documentos) ? data.documentos : []);
      setDisponivel(true);
    } catch (e) {
      // 404 (flag off) / 403 (sem capacidade) → recurso indisponível (degrada limpo).
      if (e.response?.status === 404 || e.response?.status === 403) setDisponivel(false);
      else setErro('Não foi possível carregar seus documentos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    buscar();
  }, [buscar]);

  function escolher(e) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return setArquivo(null);
    if (!MIMES.includes(f.type)) {
      toast('Use um arquivo PDF, JPEG ou PNG', 'warning');
      e.target.value = '';
      return setArquivo(null);
    }
    if (f.size > MAX_BYTES) {
      toast('Arquivo maior que 5 MB', 'warning');
      e.target.value = '';
      return setArquivo(null);
    }
    setArquivo(f);
  }

  async function enviar(e) {
    e.preventDefault();
    if (!arquivo || enviando) return;
    setEnviando(true);
    try {
      const dataUri = await lerComoDataURI(arquivo);
      const { data } = await api.post('/me/documentos', {
        tipo,
        nome: arquivo.name,
        arquivo: dataUri,
      });
      setDocs((prev) => [data.documento, ...prev]);
      setArquivo(null);
      setTipo('contrato');
      toast('Documento enviado', 'success');
    } catch (err) {
      toast(err.response?.data?.erro || 'Não foi possível enviar o documento', 'error');
    } finally {
      setEnviando(false);
    }
  }

  async function baixar(doc) {
    if (baixandoId) return;
    setBaixandoId(doc.id);
    try {
      // O endpoint responde 302 → URL assinada (prod) OU serve o arquivo (dev). O axios segue
      // o redirect; num redirect cross-origin o navegador remove o header Authorization, então
      // o token não vaza para o storage. Blob → download local.
      const res = await api.get(`/me/documentos/${doc.id}/arquivo`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nome || 'documento';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('Não foi possível baixar o documento', 'error');
    } finally {
      setBaixandoId(null);
    }
  }

  async function remover(id) {
    if (removendoId) return;
    setRemovendoId(id);
    try {
      await api.delete(`/me/documentos/${id}`);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast('Documento removido', 'success');
    } catch {
      toast('Não foi possível remover o documento', 'error');
    } finally {
      setRemovendoId(null);
      setConfirmando(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <p className="section-label mb-1">
          <span className="w-5 h-px bg-accent-400" /> DOCUMENTOS
        </p>
        <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">
          Meus documentos
        </h1>
        <p className="text-muted text-xs mt-0.5 flex items-center gap-1">
          <ShieldCheck size={12} className="text-success" /> Armazenados em local privado e seguro.
        </p>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      {carregando ? (
        <div className="px-4 pt-2">
          <SkeletonLista qtd={3} />
        </div>
      ) : !disponivel ? (
        <div className="px-4 pt-2">
          <FeedbackState
            state="empty"
            icon={<FileText size={28} />}
            title="Documentos indisponíveis"
            description="Este recurso ainda não foi ativado para a sua empresa."
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pt-1 pb-6 flex flex-col gap-4">
          {/* Envio */}
          <form onSubmit={enviar} className="card flex flex-col gap-3">
            <p className="kpi-label">Enviar novo documento</p>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                aria-label="Tipo do documento"
                className="input py-2 text-sm"
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center justify-center gap-2 h-10 rounded-md bg-dark-700 border border-dark-600 text-muted text-sm cursor-pointer hover:text-white hover:border-dark-500 transition-colors px-3 truncate">
                <FileIcon size={15} className="shrink-0" />
                <span className="truncate">{arquivo ? arquivo.name : 'Escolher arquivo'}</span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={escolher}
                  className="sr-only"
                />
              </label>
            </div>
            <p className="text-muted text-[11px]">PDF, JPEG ou PNG · até 5 MB.</p>
            <button
              type="submit"
              disabled={!arquivo || enviando}
              className="inline-flex items-center justify-center gap-2 h-10 rounded-md bg-accent-400 text-dark-950 font-display font-semibold uppercase tracking-wider text-sm hover:bg-accent-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enviando ? (
                <>
                  <Loader size={16} className="animate-spin" /> Enviando…
                </>
              ) : (
                <>
                  <Upload size={16} /> Enviar documento
                </>
              )}
            </button>
          </form>

          {/* Lista */}
          {docs.length === 0 ? (
            <EstadoVazio
              mensagem="Nenhum documento enviado"
              sub="Envie seu contrato, RG ou CNH usando o formulário acima."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {docs.map((d) => (
                <div key={d.id} className="card flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-accent-400/10 border border-accent-400/20 flex items-center justify-center text-accent-300 shrink-0">
                    <FileText size={20} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge bg-dark-700 text-muted border border-dark-600">
                        {ROTULO_TIPO[d.tipo] ?? d.tipo}
                      </span>
                      <span className="text-muted text-[11px] tnum">
                        {formatarTamanho(d.tamanho)}
                      </span>
                    </div>
                    <p className="text-white text-sm font-medium truncate mt-1">{d.nome}</p>
                    <p className="text-muted text-[11px] mt-0.5">{formatarData(d.criadoEm)}</p>
                  </div>
                  {confirmando === d.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => remover(d.id)}
                        disabled={removendoId === d.id}
                        className="h-8 px-3 rounded-md bg-danger text-white text-xs font-semibold uppercase tracking-wide disabled:opacity-60"
                      >
                        Remover
                      </button>
                      <button
                        onClick={() => setConfirmando(null)}
                        className="h-8 px-3 rounded-md bg-dark-700 border border-dark-600 text-muted text-xs"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => baixar(d)}
                        disabled={baixandoId === d.id}
                        aria-label={`Baixar ${d.nome}`}
                        className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-muted hover:text-accent-300 hover:border-dark-500 transition-colors disabled:opacity-60"
                      >
                        {baixandoId === d.id ? (
                          <Loader size={16} className="animate-spin" />
                        ) : (
                          <Download size={16} />
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmando(d.id)}
                        aria-label={`Remover ${d.nome}`}
                        className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-muted hover:text-danger hover:border-danger/40 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
