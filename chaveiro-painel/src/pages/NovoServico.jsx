import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';
import { formatarMoedaInput, moedaParaNumero } from '../lib/moeda.js';
import BackHeader from '../components/BackHeader.jsx';
import MaterialPicker from '../components/MaterialPicker.jsx';
import { useToast } from '../components/Toast.jsx';
import { useFormPersist } from '../hooks/useFormPersist.js';
import { useAnalytics } from '../hooks/useAnalytics.js';

const LOCAIS_OPCOES = ['Casa do cliente', 'Contrato', 'Ponto da loja', 'Outro'];

const FORM_INICIAL = {
  tecnico: '',
  local: 'Casa do cliente',
  endereco: '',
  descricao: '',
  material: '',
  valorCobrado: '',
  valorMaterial: '',
  clienteNome: '',
  clienteTelefone: '',
  materiais: [],
};

export default function NovoServico() {
  const navigate = useNavigate();
  const toast = useToast();
  const { track } = useAnalytics();

  const [tecnicos, setTecnicos] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const [form, setForm, clearForm] = useFormPersist('admai_novo_servico', FORM_INICIAL);

  useEffect(() => {
    track('servico_iniciado');
  }, []);

  useEffect(() => {
    api.get('/tecnicos').then(({ data }) => setTecnicos(data.filter((t) => t.ativo)));
  }, []);

  // Os campos de valor guardam a string mascarada (ex.: "1.234,56"); aqui
  // convertemos para Number tanto para o cálculo do líquido quanto para a API.
  const valorCobradoNum = moedaParaNumero(form.valorCobrado);
  const valorMaterialNum = moedaParaNumero(form.valorMaterial);
  const valorLiquido = valorCobradoNum - valorMaterialNum;

  function atualizar(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  // Aplica a máscara de moeda BRL conforme o usuário digita.
  function atualizarMoeda(campo, valorBruto) {
    setForm((prev) => ({ ...prev, [campo]: formatarMoedaInput(valorBruto) }));
  }

  const materiaisSelecionados = Array.isArray(form.materiais) ? form.materiais : [];

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.tecnico) {
      toast('Selecione o técnico', 'warning');
      return;
    }

    setEnviando(true);
    try {
      // Materiais do catálogo no formato do contrato do backend.
      const materiais = materiaisSelecionados
        .filter((m) => m.materialId && Number(m.quantidade) > 0)
        .map((m) => ({ materialId: Number(m.materialId), quantidade: Number(m.quantidade) }));

      await api.post('/servicos', {
        tecnico: form.tecnico,
        local: form.local,
        endereco: form.endereco || null,
        descricao: form.descricao,
        material: form.material || null,
        valorCobrado: valorCobradoNum,
        valorMaterial: valorMaterialNum,
        clienteNome: form.clienteNome || null,
        clienteTelefone: form.clienteTelefone || null,
        materiais,
      });

      clearForm();
      track('servico_criado');
      toast('Serviço registrado com sucesso!', 'success');
      navigate('/servicos');
    } catch (err) {
      const msg = err.response?.data?.detalhes
        ? 'Verifique os campos e tente novamente'
        : 'Não foi possível salvar o serviço. Verifique sua conexão e tente novamente.';
      toast(msg, 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <BackHeader titulo="Novo serviço" para="/servicos" />
      <p className="px-4 -mt-0.5 mb-2 text-muted text-xs">Cadastro manual</p>

      {/* Formulário */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-4 lg:max-w-2xl">
        {/* Técnico */}
        <div>
          <label className="kpi-label block mb-2">Técnico *</label>
          {tecnicos.length > 0 ? (
            <select
              value={form.tecnico}
              onChange={(e) => atualizar('tecnico', e.target.value)}
              className="input"
              required
            >
              <option value="">Selecione o técnico</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.nome}>
                  {t.nome}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={form.tecnico}
              onChange={(e) => atualizar('tecnico', e.target.value)}
              placeholder="Nome do técnico"
              className="input"
              required
            />
          )}
        </div>

        {/* Local */}
        <div>
          <label className="kpi-label block mb-2">Local *</label>
          <select
            value={form.local}
            onChange={(e) => atualizar('local', e.target.value)}
            className="input"
          >
            {LOCAIS_OPCOES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
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
            placeholder="Endereço completo ou N/A"
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

        {/* Material */}
        <div>
          <label className="kpi-label block mb-2">Material utilizado</label>
          <input
            type="text"
            value={form.material}
            onChange={(e) => atualizar('material', e.target.value)}
            placeholder="Descrição do material ou Nenhum"
            className="input"
          />
        </div>

        {/* Materiais do catálogo (dá baixa no estoque) */}
        <div>
          <label className="kpi-label block mb-2">Materiais do catálogo</label>
          <MaterialPicker
            value={materiaisSelecionados}
            onChange={(materiais) => atualizar('materiais', materiais)}
          />
          <p className="text-[11px] text-muted mt-2">
            Selecione os materiais usados para dar baixa automática no estoque.
          </p>
        </div>

        {/* Cliente atendido (para avaliação pós-serviço) */}
        <div className="card-accent space-y-3">
          <p className="section-label">CLIENTE ATENDIDO</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="kpi-label block mb-1.5">Nome</label>
              <input type="text" value={form.clienteNome}
                onChange={(e) => atualizar('clienteNome', e.target.value)}
                placeholder="Nome do cliente" className="input" />
            </div>
            <div>
              <label className="kpi-label block mb-1.5">Telefone (WhatsApp)</label>
              <input type="tel" value={form.clienteTelefone}
                onChange={(e) => atualizar('clienteTelefone', e.target.value)}
                placeholder="11 99999-0000" className="input" />
            </div>
          </div>
          <p className="text-[11px] text-muted">Usado para enviar a solicitação de avaliação após a conclusão.</p>
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
          {enviando ? 'Salvando...' : 'Salvar Serviço'}
        </button>
      </form>
    </div>
  );
}
