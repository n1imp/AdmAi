import { useEffect, useState } from 'react';
import api, { formatarMoeda } from '../../lib/api.js';
import { formatarMoedaInput, moedaParaNumero } from '../../lib/moeda.js';
import MaterialPicker from '../../components/MaterialPicker.jsx';
import { Field, Button } from '../../components/ui/index.js';
import { useToast } from '../../components/Toast.jsx';
import { useFormPersist } from '../../hooks/useFormPersist.js';
import { useAnalytics } from '../../hooks/useAnalytics.js';
import { useCriarServico, classificarErro } from './servicosApi.js';
import { schemaServicoGestao, schemaServicoCampo, errosPorCampo } from './servicoSchema.js';

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

/**
 * Formulário ÚNICO de Serviço — SINGLE-PAGE POR SEÇÕES (DECISOR 01a04bfb §iii; os wizards
 * de 4/3 etapas foram removidos: poucos obrigatórios não justificam navegação por etapas, e
 * o resumo financeiro AO VIVO substitui a etapa de "Revisão"). Seções são fieldsets com
 * legenda — nada de cards ornamentais. Zod composto por seção (seam Catálogo/Orçamento).
 *
 * variante:
 *  - 'gestao' (D/G): técnico obrigatório (regra de negócio do backend) + catálogo
 *  - 'campo'  (F): técnico deriva da sessão; catálogo condicionado ao regime da empresa
 *    (`aprovacaoServico` — sem regime, o backend recusa `materiais_nao_permitidos`)
 *
 * Preservado da superfície anterior: rascunho por useFormPersist (limpo SÓ após 201), foco
 * no primeiro erro, moeda mascarada, guarda de materiais sem quantidade, analytics.
 */
export default function ServicoForm({ variante = 'gestao', chavePersist, onSucesso }) {
  const gestao = variante === 'gestao';
  const toast = useToast();
  const { track } = useAnalytics();
  const criar = useCriarServico();

  const [form, setForm, clearForm] = useFormPersist(
    chavePersist ?? (gestao ? 'admai_novo_servico' : 'admai_novo_servico_func'),
    FORM_INICIAL
  );
  const [erros, setErros] = useState({});

  const [tecnicos, setTecnicos] = useState([]);
  const [erroTecnicos, setErroTecnicos] = useState(false);
  useEffect(() => {
    if (!gestao) return undefined;
    let vivo = true;
    api
      .get('/tecnicos')
      .then(({ data }) => vivo && setTecnicos(data.filter((t) => t.ativo)))
      .catch(() => vivo && setErroTecnicos(true));
    return () => {
      vivo = false;
    };
  }, [gestao]);

  /* Regime de materiais do funcionário: sem aprovação configurada o catálogo não aparece
     (oferecer campo que o backend recusa é dead-end). `null` = contexto ainda não chegou —
     não desenha nem esconde (sem flash; preservado da superfície anterior). */
  const [permiteCatalogo, setPermiteCatalogo] = useState(gestao ? true : null);
  useEffect(() => {
    if (gestao) return undefined;
    let vivo = true;
    api
      .get('/me/permissoes')
      .then(({ data }) => vivo && setPermiteCatalogo(Boolean(data?.aprovacaoServico)))
      /* Falha de contexto ESCONDE o campo: o backend decide de verdade; oferecer o seletor
         "no escuro" trocaria campo ausente por submissão recusada. */
      .catch(() => vivo && setPermiteCatalogo(false));
    return () => {
      vivo = false;
    };
  }, [gestao]);

  const valorCobradoNum = moedaParaNumero(form.valorCobrado);
  const valorMaterialNum = moedaParaNumero(form.valorMaterial);
  const valorLiquido = valorCobradoNum - valorMaterialNum;
  const materiaisSelecionados = Array.isArray(form.materiais) ? form.materiais : [];

  function atualizar(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    setErros((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  }
  const atualizarMoeda = (campo, bruto) => atualizar(campo, formatarMoedaInput(bruto));

  async function handleSubmit(e) {
    e.preventDefault();
    if (criar.isPending) return; // bloqueio de duplo submit

    /* Guarda preservada: material selecionado sem quantidade era REMOVIDO em silêncio e o
       estoque nunca baixava. Barrar e dizer o que falta. */
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
      return;
    }

    const candidato = {
      ...(gestao ? { tecnico: form.tecnico } : {}),
      local: form.local,
      endereco: form.endereco,
      descricao: form.descricao,
      material: form.material,
      clienteNome: form.clienteNome,
      clienteTelefone: form.clienteTelefone,
      materiais: materiaisSelecionados,
      valorCobrado: valorCobradoNum,
      valorMaterial: valorMaterialNum,
    };
    const schema = gestao ? schemaServicoGestao : schemaServicoCampo;
    const resultado = schema.safeParse(candidato);
    const novosErros = errosPorCampo(resultado);
    setErros(novosErros);
    const primeiro = Object.keys(novosErros)[0];
    if (primeiro) {
      requestAnimationFrame(() => document.getElementById(`sf-${primeiro}`)?.focus());
      return;
    }

    try {
      const corpo = {
        ...resultado.data,
        endereco: resultado.data.endereco || null,
        material: resultado.data.material || null,
        clienteNome: resultado.data.clienteNome || null,
        clienteTelefone: resultado.data.clienteTelefone || null,
      };
      if (!permiteCatalogo || corpo.materiais.length === 0) delete corpo.materiais;
      const resposta = await criar.mutateAsync(corpo);
      /* 201 LITERAL do contrato de criação (DECISOR §iii; Revisor 01a04c56): qualquer outro
         2xx não prova que o serviço existe — rascunho fica e nada de sucesso fingido. */
      if (resposta?.status !== 201) {
        toast('Não foi possível confirmar o registro. Tente novamente.', 'error');
        return;
      }
      clearForm();
      track('servico_criado');
      toast('Serviço registrado com sucesso!', 'success');
      onSucesso?.();
    } catch (err) {
      toast(classificarErro(err).mensagem, 'error');
    }
  }

  const secaoTitulo = (t) => (
    <legend style={{ font: 'var(--adm-section-title)', padding: 0, marginBottom: 8 }}>{t}</legend>
  );
  const fieldsetStyle = {
    border: 0,
    margin: 0,
    padding: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="adm-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--adm-s6)',
        background: 'transparent',
      }}
    >
      <fieldset style={fieldsetStyle}>
        {secaoTitulo('Contexto')}
        {gestao &&
          (tecnicos.length > 0 ? (
            <Field
              as="select"
              id="sf-tecnico"
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
              id="sf-tecnico"
              label="Técnico"
              required
              value={form.tecnico}
              onChange={(e) => atualizar('tecnico', e.target.value)}
              placeholder="Nome do técnico"
              error={erros.tecnico}
              announceError
            />
          ))}
        {gestao && erroTecnicos && (
          <p role="alert" className="text-danger text-xs -mt-2">
            Não foi possível carregar a lista de técnicos — o nome digitado aqui pode não
            corresponder a um cadastro. Recarregue a página.
          </p>
        )}
        <Field
          as="select"
          id="sf-local"
          label="Local"
          value={form.local}
          onChange={(e) => atualizar('local', e.target.value)}
          error={erros.local}
          announceError
        >
          {LOCAIS_OPCOES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Field>
      </fieldset>

      <fieldset style={fieldsetStyle}>
        {secaoTitulo('Atendimento')}
        <Field
          as="textarea"
          id="sf-descricao"
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
        <Field
          label="Endereço"
          value={form.endereco}
          onChange={(e) => atualizar('endereco', e.target.value)}
          placeholder="Endereço completo ou N/A"
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label="Cliente"
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
      </fieldset>

      <fieldset style={fieldsetStyle}>
        {secaoTitulo('Materiais')}
        <Field
          label="Material utilizado"
          value={form.material}
          onChange={(e) => atualizar('material', e.target.value)}
          placeholder="Descrição do material ou Nenhum"
          hint={
            permiteCatalogo
              ? 'Texto livre. Use o catálogo abaixo para dar baixa no estoque.'
              : 'Texto livre.'
          }
        />
        {permiteCatalogo && (
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
        )}
      </fieldset>

      <fieldset style={fieldsetStyle}>
        {secaoTitulo('Valores')}
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="sf-valorCobrado"
            label="Valor cobrado (R$)"
            required
            inputMode="decimal"
            value={form.valorCobrado}
            onChange={(e) => atualizarMoeda('valorCobrado', e.target.value)}
            placeholder="0,00"
            controlClassName="tnum"
            error={erros.valorCobrado}
            announceError
          />
          <Field
            label="Valor material (R$)"
            inputMode="decimal"
            value={form.valorMaterial}
            onChange={(e) => atualizarMoeda('valorMaterial', e.target.value)}
            placeholder="0,00"
            controlClassName="tnum"
          />
        </div>
        {/* Resumo financeiro AO VIVO — substitui a etapa de "Revisão" do wizard removido. */}
        <div
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--adm-border)',
            borderRadius: 'var(--adm-r2)',
            background: 'var(--adm-surface)',
            padding: '12px 16px',
          }}
        >
          <div>
            <p style={{ font: 'var(--adm-label)', color: 'var(--adm-text-muted)' }}>
              Valor líquido
            </p>
            <p style={{ font: 'var(--adm-caption)', color: 'var(--adm-text-faint)' }}>
              Cobrado − Material
            </p>
          </div>
          <p
            className="num"
            style={{ font: '600 24px/1.2 var(--adm-font)', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatarMoeda(valorLiquido)}
          </p>
        </div>
      </fieldset>

      <Button type="submit" loading={criar.isPending} loadingLabel="Registrando">
        Registrar serviço
      </Button>
    </form>
  );
}
