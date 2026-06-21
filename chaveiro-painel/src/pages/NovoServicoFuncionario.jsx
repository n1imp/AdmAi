import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';
import { formatarMoedaInput, moedaParaNumero } from '../lib/moeda.js';
import BackHeader from '../components/BackHeader.jsx';
import { useToast } from '../components/Toast.jsx';

const LOCAIS_OPCOES = ['Casa do cliente', 'Contrato', 'Ponto da loja', 'Outro'];

const FORM_INICIAL = {
  local: 'Casa do cliente',
  endereco: '',
  descricao: '',
  valorCobrado: '',
  valorMaterial: '',
  clienteNome: '',
  clienteTelefone: '',
};

export default function NovoServicoFuncionario() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(FORM_INICIAL);
  const [enviando, setEnviando] = useState(false);

  // Os campos de valor guardam a string mascarada (ex.: "1.234,56").
  const valorCobradoNum = moedaParaNumero(form.valorCobrado);
  const valorMaterialNum = moedaParaNumero(form.valorMaterial);
  const valorLiquido = valorCobradoNum - valorMaterialNum;

  function atualizar(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function atualizarMoeda(campo, valorBruto) {
    setForm((prev) => ({ ...prev, [campo]: formatarMoedaInput(valorBruto) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.descricao.trim()) {
      toast('Descreva o serviço realizado', 'warning');
      return;
    }
    if (valorCobradoNum <= 0) {
      toast('Informe o valor cobrado', 'warning');
      return;
    }

    setEnviando(true);
    try {
      const { data } = await api.post('/servicos', {
        local: form.local,
        descricao: form.descricao,
        valorCobrado: valorCobradoNum,
        valorMaterial: valorMaterialNum,
        clienteNome: form.clienteNome || null,
        clienteTelefone: form.clienteTelefone || null,
        endereco: form.endereco || null,
      });

      if (data?.status === 'pendente') {
        toast('Enviado para aprovação do gestor', 'success');
      } else {
        toast('Serviço registrado', 'success');
      }
      navigate('/meus-servicos');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Não foi possível salvar o serviço.', 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Registrar serviço" para="/meus-servicos" />
      <p className="px-4 -mt-0.5 mb-2 text-muted text-xs">Lance o atendimento que você realizou</p>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-4 lg:max-w-2xl">
        {/* Local */}
        <div>
          <label className="kpi-label block mb-2">Local *</label>
          <select
            value={form.local}
            onChange={(e) => atualizar('local', e.target.value)}
            className="input"
          >
            {LOCAIS_OPCOES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Endereço */}
        <div>
          <label className="kpi-label block mb-2">Endereço</label>
          <input
            type="text"
            value={form.endereco}
            onChange={(e) => atualizar('endereco', e.target.value)}
            placeholder="Endereço do atendimento (opcional)"
            className="input"
          />
        </div>

        {/* Descrição */}
        <div>
          <label className="kpi-label block mb-2">Descrição do serviço *</label>
          <textarea
            value={form.descricao}
            onChange={(e) => atualizar('descricao', e.target.value)}
            placeholder="Descreva o serviço realizado"
            className="input resize-none"
            rows={3}
            required
          />
        </div>

        {/* Cliente atendido */}
        <div className="card-accent space-y-3">
          <p className="section-label">CLIENTE ATENDIDO</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="kpi-label block mb-1.5">Nome</label>
              <input
                type="text"
                value={form.clienteNome}
                onChange={(e) => atualizar('clienteNome', e.target.value)}
                placeholder="Nome do cliente"
                className="input"
              />
            </div>
            <div>
              <label className="kpi-label block mb-1.5">Telefone (WhatsApp)</label>
              <input
                type="tel"
                value={form.clienteTelefone}
                onChange={(e) => atualizar('clienteTelefone', e.target.value)}
                placeholder="11 99999-0000"
                className="input"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted">Opcional — usado para enviar a solicitação de avaliação.</p>
        </div>

        {/* Valores */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="kpi-label block mb-2">Valor cobrado (R$) *</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.valorCobrado}
              onChange={(e) => atualizarMoeda('valorCobrado', e.target.value)}
              placeholder="0,00"
              className="input tnum"
              required
            />
          </div>
          <div>
            <label className="kpi-label block mb-2">Valor material (R$)</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.valorMaterial}
              onChange={(e) => atualizarMoeda('valorMaterial', e.target.value)}
              placeholder="0,00"
              className="input tnum"
            />
          </div>
        </div>

        {/* Valor líquido calculado */}
        <div className="bg-accent-400/10 border border-accent-400/30 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="kpi-label text-accent-300">Valor Líquido</p>
            <p className="text-xs text-muted mt-0.5">Cobrado − Material</p>
          </div>
          <p className="font-display text-3xl font-bold text-accent-300 tnum">
            {formatarMoeda(valorLiquido)}
          </p>
        </div>

        <button type="submit" disabled={enviando} className="btn-primary flex items-center justify-center gap-2">
          <Save size={18} />
          {enviando ? 'Salvando...' : 'Registrar serviço'}
        </button>
      </form>
    </div>
  );
}
