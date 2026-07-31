import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, ArrowRight } from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';
import { formatarMoedaInput, moedaParaNumero } from '../lib/moeda.js';
import BackHeader from '../components/BackHeader.jsx';
import MaterialPicker from '../components/MaterialPicker.jsx';
import { Field, Button } from '../components/ui/index.js';
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

// FO3: formulário complexo em etapas curtas, com progresso visível, validação por etapa,
// dados preservados ao voltar (persistência via useFormPersist) e resumo antes de concluir.
const PASSOS = ['Contexto', 'Materiais', 'Valores', 'Revisão'];

export default function NovoServico() {
  const navigate = useNavigate();
  const toast = useToast();
  const { track } = useAnalytics();

  const [tecnicos, setTecnicos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [passo, setPasso] = useState(1);
  const [erros, setErros] = useState({});

  const [form, setForm, clearForm] = useFormPersist('admai_novo_servico', FORM_INICIAL);

  useEffect(() => {
    track('servico_iniciado');
  }, []);

  useEffect(() => {
    api.get('/tecnicos').then(({ data }) => setTecnicos(data.filter((t) => t.ativo)));
  }, []);

  // Os campos de valor guardam a string mascarada (ex.: "1.234,56"); aqui convertemos
  // para Number tanto para o cálculo do líquido quanto para a API.
  const valorCobradoNum = moedaParaNumero(form.valorCobrado);
  const valorMaterialNum = moedaParaNumero(form.valorMaterial);
  const valorLiquido = valorCobradoNum - valorMaterialNum;
  const materiaisSelecionados = Array.isArray(form.materiais) ? form.materiais : [];

  function atualizar(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    setErros((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  }

  function atualizarMoeda(campo, valorBruto) {
    setForm((prev) => ({ ...prev, [campo]: formatarMoedaInput(valorBruto) }));
    setErros((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  }

  // Valida os campos obrigatórios da etapa; foca e anuncia o primeiro inválido.
  function validarPasso(p) {
    const novos = {};
    if (p === 1) {
      if (!form.tecnico) novos.tecnico = 'Selecione o técnico.';
      if (!form.descricao.trim()) novos.descricao = 'Descreva o serviço.';
    }
    if (p === 3 && valorCobradoNum <= 0) {
      novos.valorCobrado = 'Informe o valor cobrado.';
    }
    setErros(novos);
    const primeiro = Object.keys(novos)[0];
    if (primeiro) {
      requestAnimationFrame(() => document.getElementById(`ns-${primeiro}`)?.focus());
      return false;
    }
    return true;
  }

  function avancar() {
    if (validarPasso(passo)) setPasso((p) => Math.min(PASSOS.length, p + 1));
  }

  function voltar() {
    setErros({});
    setPasso((p) => Math.max(1, p - 1));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // Enter em etapas intermediárias avança; só a última conclui.
    if (passo < PASSOS.length) {
      avancar();
      return;
    }
    if (!validarPasso(1)) {
      setPasso(1);
      return;
    }

    // Material selecionado sem quantidade válida era silenciosamente REMOVIDO do POST:
    // o serviço era criado, o toast dizia sucesso, e o estoque nunca era baixado — a
    // divergência só aparecia num inventário. Melhor barrar e dizer o que falta.
    const incompletos = materiaisSelecionados.filter(
      (m) => !m.materialId || !(Number(String(m.quantidade).replace(',', '.')) > 0)
    );
    if (incompletos.length > 0) {
      const nomes = incompletos
        .map((m) => m.nome)
        .filter(Boolean)
        .join(', ');
      toast(
        nomes
          ? `Informe a quantidade de: ${nomes}`
          : 'Informe a quantidade dos materiais selecionados',
        'error'
      );
      setPasso(1);
      return;
    }

    setEnviando(true);
    try {
      const materiais = materiaisSelecionados.map((m) => ({
        materialId: Number(m.materialId),
        quantidade: Number(String(m.quantidade).replace(',', '.')),
      }));

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

  const resumo = [
    ['Técnico', form.tecnico || '—'],
    ['Local', form.local],
    ['Endereço', form.endereco || '—'],
    ['Descrição', form.descricao || '—'],
    [
      'Materiais do catálogo',
      materiaisSelecionados.length ? `${materiaisSelecionados.length} item(ns)` : 'Nenhum',
    ],
    ['Valor cobrado', formatarMoeda(valorCobradoNum)],
    ['Valor material', formatarMoeda(valorMaterialNum)],
    ['Valor líquido', formatarMoeda(valorLiquido)],
    ['Cliente', form.clienteNome || '—'],
  ];

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Novo serviço" para="/servicos" />

      <div className="flex-1 overflow-y-auto px-4 pb-6 lg:max-w-2xl">
        {/* Stepper — progresso e etapa atual */}
        <ol className="flex gap-2 mb-5" aria-label="Progresso do cadastro">
          {PASSOS.map((titulo, i) => {
            const n = i + 1;
            const estado = n === passo ? 'atual' : n < passo ? 'concluido' : 'futuro';
            return (
              <li
                key={titulo}
                aria-current={n === passo ? 'step' : undefined}
                className={`flex-1 flex flex-col gap-1 rounded-md px-2 py-2 border text-center ${
                  estado === 'atual'
                    ? 'border-accent-400/50 bg-accent-400/10 text-accent-300'
                    : estado === 'concluido'
                      ? 'border-dark-600 text-success'
                      : 'border-dark-600 text-muted'
                }`}
              >
                <span className="font-display font-bold text-sm tnum">{n}</span>
                <span className="text-[11px]">{titulo}</span>
              </li>
            );
          })}
        </ol>

        {/* noValidate: a validação por etapa é custom (mensagem inline + foco, FO3), então
            desligamos o balão nativo que bloquearia o submit antes de validarPasso rodar. */}
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-4 border-0 m-0 p-0 min-w-0">
            <legend className="sr-only">
              Etapa {passo} de {PASSOS.length}: {PASSOS[passo - 1]}
            </legend>

            {passo === 1 && (
              <>
                {tecnicos.length > 0 ? (
                  <Field
                    as="select"
                    id="ns-tecnico"
                    label="Técnico"
                    required
                    value={form.tecnico}
                    onChange={(e) => atualizar('tecnico', e.target.value)}
                    error={erros.tecnico}
                    announceError
                  >
                    <option value="">Selecione o técnico</option>
                    {tecnicos.map((t) => (
                      <option key={t.id} value={t.nome}>
                        {t.nome}
                      </option>
                    ))}
                  </Field>
                ) : (
                  <Field
                    id="ns-tecnico"
                    label="Técnico"
                    required
                    value={form.tecnico}
                    onChange={(e) => atualizar('tecnico', e.target.value)}
                    placeholder="Nome do técnico"
                    error={erros.tecnico}
                    announceError
                  />
                )}

                <Field
                  as="select"
                  label="Local"
                  value={form.local}
                  onChange={(e) => atualizar('local', e.target.value)}
                >
                  {LOCAIS_OPCOES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Field>

                <Field
                  label="Endereço"
                  value={form.endereco}
                  onChange={(e) => atualizar('endereco', e.target.value)}
                  placeholder="Endereço completo ou N/A"
                />

                <Field
                  as="textarea"
                  id="ns-descricao"
                  label="Descrição do serviço"
                  required
                  rows={3}
                  value={form.descricao}
                  onChange={(e) => atualizar('descricao', e.target.value)}
                  placeholder="Descreva o serviço realizado"
                  controlClassName="resize-none"
                  error={erros.descricao}
                  announceError
                />
              </>
            )}

            {passo === 2 && (
              <>
                <Field
                  label="Material utilizado"
                  value={form.material}
                  onChange={(e) => atualizar('material', e.target.value)}
                  placeholder="Descrição do material ou Nenhum"
                  hint="Texto livre. Use o catálogo abaixo para dar baixa no estoque."
                />
                <div className="panel-field">
                  <span className="panel-field__label">Materiais do catálogo</span>
                  <MaterialPicker
                    value={materiaisSelecionados}
                    onChange={(materiais) => atualizar('materiais', materiais)}
                  />
                  <p className="panel-field__hint">
                    Selecione os materiais usados para dar baixa automática no estoque.
                  </p>
                </div>
              </>
            )}

            {passo === 3 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id="ns-valorCobrado"
                    label="Valor cobrado (R$)"
                    required
                    inputMode="numeric"
                    value={form.valorCobrado}
                    onChange={(e) => atualizarMoeda('valorCobrado', e.target.value)}
                    placeholder="0,00"
                    controlClassName="tnum"
                    error={erros.valorCobrado}
                    announceError
                  />
                  <Field
                    label="Valor material (R$)"
                    inputMode="numeric"
                    value={form.valorMaterial}
                    onChange={(e) => atualizarMoeda('valorMaterial', e.target.value)}
                    placeholder="0,00"
                    controlClassName="tnum"
                  />
                </div>

                <div className="bg-accent-400/10 border border-accent-400/30 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="kpi-label text-accent-300">Valor Líquido</p>
                    <p className="text-xs text-muted mt-0.5">Cobrado − Material</p>
                  </div>
                  <p className="font-display text-3xl font-bold text-accent-300 tnum">
                    {formatarMoeda(valorLiquido)}
                  </p>
                </div>

                <div className="card-accent space-y-3">
                  <p className="section-label">CLIENTE ATENDIDO</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field
                      label="Nome"
                      value={form.clienteNome}
                      onChange={(e) => atualizar('clienteNome', e.target.value)}
                      placeholder="Nome do cliente"
                    />
                    <Field
                      label="Telefone (WhatsApp)"
                      type="tel"
                      value={form.clienteTelefone}
                      onChange={(e) => atualizar('clienteTelefone', e.target.value)}
                      placeholder="11 99999-0000"
                    />
                  </div>
                  <p className="text-[11px] text-muted">
                    Usado para enviar a solicitação de avaliação após a conclusão.
                  </p>
                </div>
              </>
            )}

            {passo === 4 && (
              <div className="panel-surface p-1">
                <p className="section-label px-3 pt-3 pb-1">RESUMO DO SERVIÇO</p>
                <dl className="divide-y divide-dark-600">
                  {resumo.map(([rotulo, valor]) => (
                    <div key={rotulo} className="flex justify-between gap-4 px-3 py-2.5">
                      <dt className="text-muted text-sm">{rotulo}</dt>
                      <dd className="text-white text-sm text-right min-w-0 truncate">{valor}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[11px] text-muted px-3 py-2">
                  Confira os dados antes de registrar o serviço.
                </p>
              </div>
            )}
          </fieldset>

          <div className="flex gap-3">
            {passo > 1 && (
              <Button type="button" variant="secondary" onClick={voltar} className="flex-1">
                <ArrowLeft size={16} /> Voltar
              </Button>
            )}
            {passo < PASSOS.length ? (
              <Button type="submit" className="flex-1">
                Continuar <ArrowRight size={16} />
              </Button>
            ) : (
              <Button type="submit" loading={enviando} loadingLabel="Salvando" className="flex-1">
                <Save size={16} /> Salvar serviço
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
