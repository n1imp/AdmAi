import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { converterValor } from './parser.js';

/**
 * Máquina de estados da conversa privada de registro de serviço.
 *
 * Fluxo: o técnico manda "serviço" no privado do robô → o bot pergunta um campo
 * por vez, valida cada resposta, e ao final confirma e registra o serviço,
 * postando o resumo no grupo da empresa.
 *
 * Comandos globais (em qualquer passo):
 *   - "cancelar" → encerra a sessão sem registrar
 *   - "voltar"   → retorna ao passo anterior
 *
 * Estado persistido em SessaoConversa (sobrevive a restart / escala horizontal).
 * A sessão expira após INATIVIDADE_MIN minutos sem interação.
 */

const INATIVIDADE_MIN = 30;
const GATILHO = /^\s*servi[çc]o\s*$/i;
const GATILHO_PONTO = /^\s*ponto\s*$/i;

/** Detecta o gatilho do ponto eletrônico ("ponto", case-insensitive). */
export function ehGatilhoPonto(texto) {
  return GATILHO_PONTO.test(texto ?? '');
}

/**
 * Normaliza um telefone brasileiro para o formato que a Evolution aceita ao
 * enviar mensagens: "55" + DDD (2) + número (8 ou 9 dígitos).
 * Aceita entradas com DDD (10/11 dígitos) ou já com o 55 (12/13 dígitos).
 * @returns {string|null} número normalizado ou null se inválido
 */
export function normalizarTelefoneBR(txt) {
  const d = String(txt ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return '55' + d; // DDD + número
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d; // já com 55
  return null;
}

// Opções de "Local" como menu numerado.
const LOCAIS = ['Casa do cliente', 'Contrato', 'Ponto da loja', 'Outro'];

// ── Definição dos passos ──────────────────────────────────────────────────────
// Cada passo: id, pergunta(dados), validar(texto) → { ok, valor?, erro? }, campo.
const PASSOS = [
  {
    id: 'local',
    pergunta: () =>
      `📍 *Qual o local do serviço?*\nResponda com o número:\n` +
      LOCAIS.map((l, i) => `${i + 1}. ${l}`).join('\n'),
    validar: (txt) => {
      const n = parseInt(txt.trim());
      if (n >= 1 && n <= LOCAIS.length) return { ok: true, valor: LOCAIS[n - 1] };
      // aceita também o nome digitado
      const achado = LOCAIS.find((l) => l.toLowerCase() === txt.trim().toLowerCase());
      if (achado) return { ok: true, valor: achado };
      return { ok: false, erro: `Escolha um número de 1 a ${LOCAIS.length}.` };
    },
  },
  {
    id: 'endereco',
    pergunta: () => `🏠 *Qual o endereço?*\n(ou digite "N/A" se não se aplica)`,
    validar: (txt) => {
      const t = txt.trim();
      return { ok: true, valor: t.toUpperCase() === 'N/A' ? null : t };
    },
  },
  {
    id: 'descricao',
    pergunta: () => `🔧 *O que foi feito?*\nDescreva o serviço.`,
    validar: (txt) => {
      const t = txt.trim();
      if (t.length < 3) return { ok: false, erro: 'Descreva com um pouco mais de detalhe.' };
      return { ok: true, valor: t };
    },
  },
  {
    id: 'material',
    pergunta: () =>
      `🧰 *Usou algum material?*\nInforme nome e quantidade (ex.: "Fechadura Tetra x2").\n` +
      `Digite "Nenhum" se não usou.`,
    validar: (txt) => {
      const t = txt.trim();
      return { ok: true, valor: t.toLowerCase() === 'nenhum' ? null : t };
    },
  },
  {
    id: 'valorCobrado',
    pergunta: () => `💰 *Quanto foi cobrado do cliente?*\nEx.: 150 ou 150,00`,
    validar: (txt) => {
      const v = converterValor(txt);
      if (v <= 0) return { ok: false, erro: 'Informe um valor maior que zero (ex.: 150).' };
      return { ok: true, valor: v };
    },
  },
  {
    id: 'clienteNome',
    pergunta: () => `🙋 *Qual o nome do cliente atendido?*`,
    validar: (txt) => {
      const t = txt.trim();
      if (t.length < 2) return { ok: false, erro: 'Informe o nome do cliente.' };
      return { ok: true, valor: t };
    },
  },
  {
    id: 'clienteTelefone',
    pergunta: () =>
      `📱 *Qual o telefone do cliente?*\n` + `(com DDD — usaremos para pedir a avaliação depois)`,
    validar: (txt) => {
      const tel = normalizarTelefoneBR(txt);
      if (!tel) {
        return { ok: false, erro: 'Telefone inválido. Envie com DDD, ex.: 11999990000.' };
      }
      return { ok: true, valor: tel };
    },
  },
  {
    id: 'foto',
    pergunta: () => `📷 *Envie a foto do serviço* (evidência).\nOu digite "pular" se não tiver.`,
    aceitaImagem: true,
    validar: (txt, imagemUrl) => {
      if (imagemUrl) return { ok: true, valor: imagemUrl };
      if (txt && txt.trim().toLowerCase() === 'pular') return { ok: true, valor: null };
      return { ok: false, erro: 'Envie uma foto ou digite "pular".' };
    },
  },
  {
    id: 'confirmar',
    pergunta: (d) => montarResumoConfirmacao(d),
    validar: (txt) => {
      const t = txt.trim().toLowerCase();
      if (['sim', 's', 'confirmar', 'ok', 'confirmo'].includes(t))
        return { ok: true, valor: 'sim' };
      if (['nao', 'não', 'n', 'cancelar'].includes(t)) return { ok: true, valor: 'nao' };
      return { ok: false, erro: 'Responda *sim* para confirmar ou *não* para cancelar.' };
    },
  },
];

const IDX = Object.fromEntries(PASSOS.map((p, i) => [p.id, i]));

function montarResumoConfirmacao(d) {
  const linhas = [
    `📋 *Confira o serviço:*`,
    `📍 Local: ${d.local}`,
    d.endereco ? `🏠 Endereço: ${d.endereco}` : null,
    `🔧 Serviço: ${d.descricao}`,
    d.material ? `🧰 Material: ${d.material}` : `🧰 Material: Nenhum`,
    `💰 Cobrado: R$ ${Number(d.valorCobrado).toFixed(2).replace('.', ',')}`,
    `🙋 Cliente: ${d.clienteNome}`,
    `📱 Telefone: ${d.clienteTelefone}`,
    d.foto ? `📷 Foto: anexada` : `📷 Foto: nenhuma`,
    ``,
    `Está tudo certo? Responda *sim* para registrar ou *não* para cancelar.`,
  ].filter(Boolean);
  return linhas.join('\n');
}

/** Detecta se o texto é o gatilho de início de fluxo ("serviço"). */
export function ehGatilho(texto) {
  return GATILHO.test(texto ?? '');
}

/**
 * Carrega a sessão ativa (não expirada) de um JID.
 *
 * Modelo de número único: a sessão é chaveada SÓ por `jid` (uma conversa ativa por
 * telefone). A `empresaId` resolvida fica gravada na própria sessão.
 */
export async function carregarSessao(jid) {
  const s = await prisma.sessaoConversa.findUnique({ where: { jid } });
  if (!s) return null;
  const limite = Date.now() - INATIVIDADE_MIN * 60_000;
  if (new Date(s.atualizadoEm).getTime() < limite) {
    await prisma.sessaoConversa.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  return s;
}

async function salvarSessao(
  jid,
  { empresaId = null, tecnicoId = null, fluxo = 'registro_servico', estadoAtual, dadosParciais }
) {
  return prisma.sessaoConversa.upsert({
    where: { jid },
    create: { jid, empresaId, tecnicoId, fluxo, estadoAtual, dadosParciais },
    update: { empresaId, tecnicoId, fluxo, estadoAtual, dadosParciais },
  });
}

async function encerrarSessao(jid) {
  await prisma.sessaoConversa.deleteMany({ where: { jid } }).catch(() => {});
}

function montarMenuEmpresas(candidatos) {
  return (
    `🏢 Seu número está cadastrado em mais de uma empresa.\n` +
    `Para qual deseja registrar o serviço?\n\n` +
    candidatos.map((c, i) => `${i + 1}. ${c.empresaNome}`).join('\n') +
    `\n\nResponda com o número. Ou digite *cancelar* para sair.`
  );
}

/**
 * Inicia o fluxo de registro para uma empresa+técnico JÁ resolvidos (1 vínculo ou
 * após a desambiguação). Grava a sessão e envia a saudação + 1ª pergunta.
 *
 * @param {{jid:string, empresaId:number, tecnico:{id:number,nome:string},
 *   responder:(t:string)=>Promise}} args
 */
export async function iniciarRegistro({ jid, empresaId, tecnico, responder }) {
  const primeiro = PASSOS[0];
  await salvarSessao(jid, {
    empresaId,
    tecnicoId: tecnico.id,
    fluxo: 'registro_servico',
    estadoAtual: primeiro.id,
    dadosParciais: {},
  });
  await responder(
    `👋 Olá, ${tecnico.nome}! Vamos registrar um serviço.\n` +
      `A qualquer momento digite *cancelar* para sair.\n\n` +
      primeiro.pergunta({})
  );
  return { tratado: true };
}

/**
 * Inicia a DESAMBIGUAÇÃO quando o remetente tem ≥2 empresas. Grava a sessão no
 * fluxo `selecao_empresa` (empresaId nulo) com os candidatos e envia o menu numerado.
 *
 * @param {{jid:string, vinculos:Array<{empresaId:number,empresaNome:string,
 *   tecnicoId:number,tecnicoNome:string}>, responder:(t:string)=>Promise}} args
 */
export async function iniciarSelecaoEmpresa({ jid, vinculos, responder }) {
  const candidatos = vinculos.map((v) => ({
    empresaId: v.empresaId,
    empresaNome: v.empresaNome,
    tecnicoId: v.tecnicoId,
    tecnicoNome: v.tecnicoNome,
  }));
  await salvarSessao(jid, {
    empresaId: null,
    tecnicoId: null,
    fluxo: 'selecao_empresa',
    estadoAtual: 'aguardando_escolha',
    dadosParciais: { candidatos },
  });
  await responder(montarMenuEmpresas(candidatos));
  return { tratado: true };
}

/**
 * Processa a resposta do passo de desambiguação (sessão `selecao_empresa`). Um número
 * válido seleciona a empresa e arranca o registro; inválido repete o menu.
 *
 * @param {{jid:string, texto:string, sessao:object, responder:(t:string)=>Promise}} args
 */
export async function tratarSelecaoEmpresa({ jid, texto, sessao, responder }) {
  const txt = (texto ?? '').trim();
  const candidatos = sessao.dadosParciais?.candidatos ?? [];
  if (txt.toLowerCase() === 'cancelar') {
    await encerrarSessao(jid);
    await responder(`❌ Cancelado. Quando quiser, mande *serviço* para começar de novo.`);
    return { tratado: true };
  }
  const n = parseInt(txt, 10);
  if (!Number.isInteger(n) || n < 1 || n > candidatos.length) {
    await responder(
      `⚠️ Escolha um número de 1 a ${candidatos.length}.\n\n${montarMenuEmpresas(candidatos)}`
    );
    return { tratado: true };
  }
  const escolha = candidatos[n - 1];
  return iniciarRegistro({
    jid,
    empresaId: escolha.empresaId,
    tecnico: { id: escolha.tecnicoId, nome: escolha.tecnicoNome },
    responder,
  });
}

/**
 * Processa UMA mensagem inbound no privado para uma sessão de registro JÁ existente.
 *
 * O INÍCIO do fluxo (resolução de empresa/técnico e desambiguação) é decidido pelo
 * inbound.js — esta função só dá andamento à máquina de estados (cancelar/voltar/
 * validar/confirmar) usando a empresaId e o técnico gravados na sessão.
 *
 * @param {object} ctx
 * @param {string} ctx.jid               JID do remetente
 * @param {string} ctx.texto             Texto da mensagem (pode ser '')
 * @param {string|null} ctx.imagemUrl    URL da foto já salva (se a msg trouxe imagem)
 * @param {(texto:string)=>Promise} ctx.responder   Envia resposta ao remetente
 * @param {(empresaId:number, tecnicoId:number, dados:object)=>Promise} ctx.concluir
 *        Registra o serviço com a empresa/técnico da sessão e os dados coletados.
 * @returns {Promise<{tratado:boolean}>}  tratado=true se a mensagem pertenceu ao fluxo
 */
export async function processarMensagemPrivada(ctx) {
  const { jid, texto = '', imagemUrl = null, responder, concluir } = ctx;
  const txt = (texto ?? '').trim();
  const sessao = await carregarSessao(jid);
  // Sem sessão de registro ativa → o inbound trata início/desambiguação/avaliação.
  if (!sessao || sessao.fluxo !== 'registro_servico') return { tratado: false };

  // ── Comandos globais ──────────────────────────────────────────────────────
  const cmd = txt.toLowerCase();
  if (cmd === 'cancelar') {
    await encerrarSessao(jid);
    await responder(`❌ Registro cancelado. Quando quiser, mande *serviço* para começar de novo.`);
    return { tratado: true };
  }

  const dados = sessao.dadosParciais ?? {};
  let idxAtual = IDX[sessao.estadoAtual] ?? 0;
  const passoAtual = PASSOS[idxAtual];
  const base = {
    empresaId: sessao.empresaId,
    tecnicoId: sessao.tecnicoId,
    fluxo: 'registro_servico',
  };

  if (cmd === 'voltar') {
    if (idxAtual === 0) {
      await responder(`Você já está no primeiro passo.\n\n${passoAtual.pergunta(dados)}`);
      return { tratado: true };
    }
    const anterior = PASSOS[idxAtual - 1];
    delete dados[anterior.id];
    await salvarSessao(jid, { ...base, estadoAtual: anterior.id, dadosParciais: dados });
    await responder(`↩️ Voltando.\n\n${anterior.pergunta(dados)}`);
    return { tratado: true };
  }

  // ── Validação da resposta do passo atual ──────────────────────────────────
  const resultado = passoAtual.validar(txt, imagemUrl);
  if (!resultado.ok) {
    await responder(`⚠️ ${resultado.erro}\n\n${passoAtual.pergunta(dados)}`);
    return { tratado: true };
  }

  // Passo de confirmação
  if (passoAtual.id === 'confirmar') {
    if (resultado.valor === 'nao') {
      await encerrarSessao(jid);
      await responder(`❌ Registro cancelado.`);
      return { tratado: true };
    }
    // Confirmado → registra
    try {
      await concluir(sessao.empresaId, sessao.tecnicoId, dados);
      await encerrarSessao(jid);
    } catch (e) {
      logger.error('Falha ao concluir registro via conversa', { erro: e.message });
      await responder(`⚠️ Não consegui registrar o serviço agora. Tente novamente em instantes.`);
    }
    return { tratado: true };
  }

  // Demais passos: salva valor e avança
  dados[passoAtual.id] = resultado.valor;
  const proximo = PASSOS[idxAtual + 1];
  await salvarSessao(jid, { ...base, estadoAtual: proximo.id, dadosParciais: dados });
  await responder(proximo.pergunta(dados));
  return { tratado: true };
}

// Exporta utilidades para testes
export const _internal = { PASSOS, LOCAIS, montarResumoConfirmacao };
