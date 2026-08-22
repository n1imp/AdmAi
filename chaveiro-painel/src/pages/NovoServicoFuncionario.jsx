import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, ArrowRight } from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';
import { formatarMoedaInput, moedaParaNumero } from '../lib/moeda.js';
import { useFormPersist } from '../hooks/useFormPersist.js';
import BackHeader from '../components/BackHeader.jsx';
import { Field, Button } from '../components/ui/index.js';
import MaterialPicker from '../components/MaterialPicker.jsx';
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
  materiais: [],
};

// FO3 mobile-first: o registro do funcionário em campo, em etapas curtas com progresso,
// validação inline por etapa e resumo antes de enviar. Contrato de `/servicos` inalterado.
const PASSOS = ['Serviço', 'Valores', 'Revisão'];

export default function NovoServicoFuncionario() {
  const navigate = useNavigate();
  const toast = useToast();

  // Rascunho preservado entre sessões (igual ao NovoServico) — a limpeza (clearForm)
  // só acontece após um envio bem-sucedido.
  const [form, setForm, clearForm] = useFormPersist('admai_novo_servico_func', FORM_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [passo, setPasso] = useState(1);
  const [erros, setErros] = useState({});

  /* O seletor de material só aparece quando a empresa EXIGE aprovação.  [GAP-EST-03]
     Sem aprovação o serviço do funcionário nasce `ativo`, e aí a baixa sairia sem nenhum gestor
     no caminho — por isso o backend recusa com `materiais_nao_permitidos`. Mostrar o campo nesse
     caso ofereceria uma capacidade que seria negada depois de preenchida.
     `null` é o terceiro estado, e é ele que evita o flash: enquanto o contexto não chegou, não se
     desenha nem se esconde. Um `false` inicial faria o campo piscar em toda abertura da tela. */
  const [exigeAprovacao, setExigeAprovacao] = useState(null);

  useEffect(() => {
    let vivo = true;
    api
      .get('/me/permissoes')
      .then(({ data }) => {
        if (vivo) setExigeAprovacao(Boolean(data?.aprovacaoServico));
      })
      /* Falha de contexto esconde o campo. O backend é quem decide de verdade; oferecer o seletor
         "no escuro" trocaria um campo ausente por uma submissão recusada. */
      .catch(() => {
        if (vivo) setExigeAprovacao(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const materiaisSelecionados = Array.isArray(form.materiais) ? form.materiais : [];

  const valorCobradoNum = moedaParaNumero(form.valorCobrado);
  const valorMaterialNum = moedaParaNumero(form.valorMaterial);
  const valorLiquido = valorCobradoNum - valorMaterialNum;

  function atualizar(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    setErros((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  }

  function atualizarMoeda(campo, valorBruto) {
    setForm((prev) => ({ ...prev, [campo]: formatarMoedaInput(valorBruto) }));
    setErros((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  }

  function validarPasso(p) {
    const novos = {};
    if (p === 1 && !form.descricao.trim()) novos.descricao = 'Descreva o serviço realizado.';
    if (p === 2 && valorCobradoNum <= 0) novos.valorCobrado = 'Informe o valor cobrado.';
    setErros(novos);
    const primeiro = Object.keys(novos)[0];
    if (primeiro) {
      requestAnimationFrame(() => document.getElementById(`nsf-${primeiro}`)?.focus());
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
    if (passo < PASSOS.length) {
      avancar();
      return;
    }
    // Revalida os passos com obrigatórios; volta ao primeiro inválido.
    if (!form.descricao.trim()) {
      setPasso(1);
      validarPasso(1);
      return;
    }
    if (valorCobradoNum <= 0) {
      setPasso(2);
      validarPasso(2);
      return;
    }

    setEnviando(true);
    try {
      /* Normaliza a quantidade aqui, e não no componente: o `MaterialPicker` guarda o texto
         digitado (aceita vírgula) para não brigar com o teclado do usuário no meio da edição. */
      const materiais = materiaisSelecionados
        .map((m) => ({
          materialId: m.materialId,
          quantidade: parseFloat(String(m.quantidade).replace(',', '.')),
        }))
        .filter((m) => Number.isFinite(m.quantidade) && m.quantidade > 0);

      const { data } = await api.post('/servicos', {
        local: form.local,
        descricao: form.descricao,
        valorCobrado: valorCobradoNum,
        valorMaterial: valorMaterialNum,
        clienteNome: form.clienteNome || null,
        clienteTelefone: form.clienteTelefone || null,
        endereco: form.endereco || null,
        /* Só vai a chave quando há o que mandar E o regime permite. Mandar `[]` numa empresa sem
           aprovação é inofensivo hoje (o backend só recusa lista não vazia), mas depender disso
           seria depender de um detalhe do outro lado. */
        ...(exigeAprovacao && materiais.length > 0 ? { materiais } : {}),
      });

      clearForm();
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

  const resumo = [
    ['Local', form.local],
    ['Endereço', form.endereco || '—'],
    ['Descrição', form.descricao || '—'],
    ['Valor cobrado', formatarMoeda(valorCobradoNum)],
    ['Valor material', formatarMoeda(valorMaterialNum)],
    ['Valor líquido', formatarMoeda(valorLiquido)],
    ['Cliente', form.clienteNome || '—'],
  ];

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Registrar serviço" para="/meus-servicos" />

      <div className="flex-1 overflow-y-auto px-4 pb-6 lg:max-w-2xl">
        <ol className="flex gap-2 mb-5" aria-label="Progresso do registro">
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

        {/* noValidate: validação por etapa é custom (mensagem inline + foco, FO3). */}
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-4 border-0 m-0 p-0 min-w-0">
            <legend className="sr-only">
              Etapa {passo} de {PASSOS.length}: {PASSOS[passo - 1]}
            </legend>

            {passo === 1 && (
              <>
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
                  placeholder="Endereço do atendimento (opcional)"
                />

                <Field
                  as="textarea"
                  id="nsf-descricao"
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
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id="nsf-valorCobrado"
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

                {exigeAprovacao === true && (
                  <div className="panel-field">
                    <span className="panel-field__label">Materiais do catálogo</span>
                    {/* `fonte` aponta para a leitura mínima: o funcionário não tem `estoque:ver`,
                        e não precisa — id, nome e unidade bastam para escolher. */}
                    <MaterialPicker
                      fonte="/me/materiais-servico"
                      value={materiaisSelecionados}
                      onChange={(materiais) => atualizar('materiais', materiais)}
                    />
                    <p className="panel-field__hint">
                      Informe o que foi usado. A baixa no estoque acontece quando o gestor aprovar.
                    </p>
                  </div>
                )}

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
                    Opcional — usado para enviar a solicitação de avaliação.
                  </p>
                </div>
              </>
            )}

            {passo === 3 && (
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
                  Confira antes de registrar. Serviços podem exigir aprovação do gestor.
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
                <Save size={16} /> Registrar serviço
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
