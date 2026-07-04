import { useState, useEffect } from 'react';
import { Loader2, Save, Link as LinkIcon, Clock, MessageSquareText, Power } from 'lucide-react';
import api from '../../lib/api.js';
import { SkeletonLista } from '../Skeleton.jsx';
import ErroBanner from '../ErroBanner.jsx';
import { useToast } from '../Toast.jsx';

const TEMPLATE_PADRAO =
  'Olá {nome}! Obrigado por confiar no nosso serviço. Que tal nos avaliar? {link}';

// Aba "Solicitação": configura o pedido automático de avaliação via WhatsApp.
export default function Solicitacao() {
  const toast = useToast();
  const [config, setConfig] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function buscar() {
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.get('/avaliacoes/config');
      setConfig({
        reviewAtivo: data.reviewAtivo ?? true,
        reviewTemplate: data.reviewTemplate ?? '',
        reviewDelayHoras: data.reviewDelayHoras ?? 2,
        reviewLink: data.reviewLink ?? '',
      });
    } catch {
      setErro('Não foi possível carregar a configuração.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { buscar(); }, []);

  async function salvar() {
    setSalvando(true);
    try {
      const payload = {
        reviewAtivo: Boolean(config.reviewAtivo),
        reviewTemplate: config.reviewTemplate || '',
        reviewDelayHoras: Number(config.reviewDelayHoras) || 0,
        reviewLink: config.reviewLink || '',
      };
      const { data } = await api.patch('/avaliacoes/config', payload);
      setConfig({
        reviewAtivo: data.reviewAtivo ?? payload.reviewAtivo,
        reviewTemplate: data.reviewTemplate ?? payload.reviewTemplate,
        reviewDelayHoras: data.reviewDelayHoras ?? payload.reviewDelayHoras,
        reviewLink: data.reviewLink ?? payload.reviewLink,
      });
      toast('Configuração salva', 'success');
    } catch (e) {
      toast(e.response?.data?.erro ?? 'Erro ao salvar', 'error');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <div className="px-4 pt-2"><SkeletonLista qtd={3} /></div>;
  if (erro) return <div className="px-4 pt-2"><ErroBanner mensagem={erro} onRetry={buscar} /></div>;
  if (!config) return null;

  function set(campo, valor) {
    setConfig((c) => ({ ...c, [campo]: valor }));
  }

  return (
    <div className="px-4 pt-2 pb-6 space-y-4 lg:max-w-2xl">
      {/* Toggle ativar */}
      <div className="card flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold flex items-center gap-2">
            <Power size={15} className="text-accent-300" /> Solicitação automática
          </p>
          <p className="text-muted text-xs mt-1">Pedir avaliação ao cliente via WhatsApp após o serviço.</p>
        </div>
        <button
          role="switch"
          aria-checked={config.reviewAtivo}
          onClick={() => set('reviewAtivo', !config.reviewAtivo)}
          className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ml-3 ${config.reviewAtivo ? 'bg-accent-400' : 'bg-dark-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${config.reviewAtivo ? 'translate-x-6' : ''}`} />
        </button>
      </div>

      <div className={`card space-y-4 transition-opacity ${config.reviewAtivo ? '' : 'opacity-60'}`}>
        <div>
          <label className="kpi-label block mb-1.5 flex items-center gap-1">
            <MessageSquareText size={11} /> Mensagem enviada
          </label>
          <textarea
            className="input w-full min-h-[100px] resize-y"
            value={config.reviewTemplate}
            onChange={(e) => set('reviewTemplate', e.target.value)}
            placeholder={TEMPLATE_PADRAO}
            disabled={!config.reviewAtivo}
          />
          <p className="text-muted text-xs mt-1.5">
            Use <code className="text-accent-300">{'{nome}'}</code> para o nome do cliente e{' '}
            <code className="text-accent-300">{'{link}'}</code> para o link de avaliação.
          </p>
          {!config.reviewTemplate && (
            <button onClick={() => set('reviewTemplate', TEMPLATE_PADRAO)}
              className="text-accent-300 text-xs font-medium mt-1.5 hover:underline">
              Usar mensagem padrão
            </button>
          )}
        </div>

        <div>
          <label className="kpi-label block mb-1.5 flex items-center gap-1">
            <Clock size={11} /> Atraso para enviar (horas)
          </label>
          <input
            type="number" min="0" max="168"
            className="input w-full"
            value={config.reviewDelayHoras}
            onChange={(e) => set('reviewDelayHoras', e.target.value)}
            disabled={!config.reviewAtivo}
          />
        </div>

        <div>
          <label className="kpi-label block mb-1.5 flex items-center gap-1">
            <LinkIcon size={11} /> Link de avaliação
          </label>
          <input
            type="url"
            className="input w-full"
            placeholder="https://g.page/sua-empresa/review"
            value={config.reviewLink}
            onChange={(e) => set('reviewLink', e.target.value)}
            disabled={!config.reviewAtivo}
          />
          <p className="text-muted text-xs mt-1.5">Substitui o <code className="text-accent-300">{'{link}'}</code> na mensagem.</p>
        </div>
      </div>

      <button onClick={salvar} disabled={salvando} className="btn-primary w-full flex items-center justify-center gap-2">
        {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {salvando ? 'Salvando…' : 'Salvar configuração'}
      </button>
    </div>
  );
}
