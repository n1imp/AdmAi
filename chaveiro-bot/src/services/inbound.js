import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { normalizarTelefone } from './parser.js';
import {
  processarMensagemPrivada, carregarSessao, ehGatilho, ehGatilhoPonto,
  iniciarRegistro, iniciarSelecaoEmpresa, tratarSelecaoEmpresa,
} from './conversa.js';
import { resolverRemetente } from './identidade.js';
import { registrarPonto } from './ponto.js';
import { resolverMateriaisDoServico } from './catalogo.js';
import { registrarServico, formatarData, formatarMoeda } from './servico.js';
import { enviarMensagem } from './whatsapp/gateway.js';
import { agendarAvaliacao, tentarCapturarResposta } from './avaliacao.js';

const UPLOADS_DIR = path.resolve('./uploads');

/**
 * Roteia um evento MESSAGES_UPSERT do robô de NÚMERO ÚNICO para o fluxo correto.
 *
 * Não recebe empresaId: a empresa é descoberta pelo TELEFONE do remetente.
 * Precedência:
 *   1) sessão ativa por jid (continuação de registro OU desambiguação em curso);
 *   2) sem sessão → captura GLOBAL de avaliação (cliente respondendo a nota);
 *   3) resolução do remetente em vínculos de técnico:
 *        0 → "não cadastrado" só no gatilho 'serviço'; senão silêncio;
 *        1 → inicia o registro direto;
 *       >1 → desambiguação (menu de empresas), apenas no gatilho.
 *
 * Só trata mensagens recebidas (fromMe=false) de chat PRIVADO (@s.whatsapp.net).
 *
 * @param {object} evento  Evento já validado (shape Evolution v2)
 */
export async function rotearMensagemInbound(evento) {
  // Robô do WhatsApp é uma FEATURE FUTURA: enquanto WHATSAPP_HABILITADO !== 'true', o
  // bot fica inerte (o webhook ainda responde 200, mas nenhum evento é processado).
  // Toda a estrutura (Evolution, conversa, ponto/serviço via chat) segue pronta para
  // religar só virando a flag.
  if (env.WHATSAPP_HABILITADO !== 'true') return { tratado: false, ignorado: 'whatsapp_desabilitado' };

  const msg = extrairMensagem(evento);
  if (!msg) return { tratado: false };

  // Ignora mensagens nossas e mensagens de grupo (registro é só no privado)
  if (msg.fromMe) return { tratado: false };
  if (msg.remoteJid.endsWith('@g.us')) return { tratado: false };
  if (!msg.remoteJid.endsWith('@s.whatsapp.net')) return { tratado: false };

  const jid = msg.remoteJid;
  const telefone = normalizarTelefone(jid);
  const responder = (texto) => enviarMensagem(jid, texto);

  // Foto: se a mensagem trouxe imagem em base64, salva e gera URL pública
  const imagemUrl = msg.imagemBase64 ? await salvarFotoBase64(msg.imagemBase64, msg.mimetype) : null;

  // 1) Há uma sessão ativa por este telefone? Continua o fluxo dela.
  const sessao = await carregarSessao(jid);
  if (sessao?.fluxo === 'selecao_empresa') {
    return tratarSelecaoEmpresa({ jid, texto: msg.texto, sessao, responder });
  }
  if (sessao?.fluxo === 'registro_servico') {
    const concluir = (empresaId, tecnicoId, dados) =>
      concluirRegistro(empresaId, jid, tecnicoId, dados, responder);
    return processarMensagemPrivada({ jid, texto: msg.texto, imagemUrl, responder, concluir });
  }

  // 2) Sem sessão → captura GLOBAL de avaliação (o número do robô é único).
  const captura = await tentarCapturarResposta(telefone, msg.texto);
  if (captura.capturado) {
    if (captura.resposta) await responder(captura.resposta);
    return { tratado: true };
  }

  // 2.5) PONTO eletrônico: técnico cadastrado mandando "Ponto" → avança a máquina do dia.
  if (ehGatilhoPonto(msg.texto)) {
    const vinculosPonto = await resolverRemetente(telefone);
    if (vinculosPonto.length === 0) {
      await responder('Número não reconhecido. Fale com o administrador.');
      return { tratado: true };
    }
    // Ponto é por pessoa; se o telefone está em N empresas, usa a 1ª (determinístico).
    const v = vinculosPonto[0];
    const { resposta } = await registrarPonto({
      empresaId: v.empresaId, tecnicoId: v.tecnicoId, agora: new Date(),
    });
    await responder(resposta);
    return { tratado: true };
  }

  // 3) Resolve o remetente em vínculos de técnico (por telefone, tolerante ao 9º dígito).
  const vinculos = await resolverRemetente(telefone);
  const gatilho = ehGatilho(msg.texto);

  if (vinculos.length === 0) {
    // Decisão de produto: só orienta no gatilho 'serviço'; senão fica em silêncio
    // (reduz o risco de ban do número único por responder a desconhecidos).
    if (gatilho) {
      await responder(
        `⚠️ Seu número ainda não está cadastrado.\n` +
        `Crie sua conta no painel ou peça ao administrador para cadastrá-lo como técnico.`
      );
      return { tratado: true };
    }
    return { tratado: false };
  }

  // Início de registro/desambiguação só acontece no gatilho.
  if (!gatilho) return { tratado: false };

  if (vinculos.length === 1) {
    const v = vinculos[0];
    return iniciarRegistro({
      jid, empresaId: v.empresaId,
      tecnico: { id: v.tecnicoId, nome: v.tecnicoNome }, responder,
    });
  }

  return iniciarSelecaoEmpresa({ jid, vinculos, responder });
}

/**
 * Registra o serviço a partir dos dados coletados na conversa, resolve materiais
 * no catálogo, posta o resumo no grupo da empresa e confirma ao técnico.
 *
 * Carrega o técnico por id (a empresa/técnico vêm da sessão resolvida por telefone).
 */
async function concluirRegistro(empresaId, jidTecnico, tecnicoId, dados, responder) {
  const tecnico = await prisma.tecnico.findUnique({ where: { id: tecnicoId } });
  if (!tecnico) {
    await responder(`⚠️ Não encontrei seu cadastro de técnico. Peça ao administrador para verificar.`);
    throw new Error('técnico não encontrado ao concluir registro');
  }
  // Resolve materiais no catálogo (mesma regra do fluxo de grupo)
  let itens = [], naoEncontrados = [], valorMaterial = 0;
  if (dados.material) {
    const r = await resolverMateriaisDoServico(dados.material, empresaId);
    itens = r.itens; naoEncontrados = r.naoEncontrados; valorMaterial = r.valorMaterialTotal;
  }
  if (naoEncontrados.length > 0) {
    const lista = naoEncontrados.map((n) => `• ${n}`).join('\n');
    await responder(
      `⚠️ Não registrei o serviço.\nMateriais fora do catálogo:\n${lista}\n\n` +
      `Cadastre-os no app (tela *Materiais*) e mande *serviço* de novo.`
    );
    throw new Error('material fora do catálogo');
  }

  const valorCobrado = Number(dados.valorCobrado);
  const valorLiquido = valorCobrado - valorMaterial;
  const comissaoGerada = valorLiquido * ((tecnico?.comissao ?? 0) / 100);
  const materialTexto = itens.length > 0 ? itens.map((i) => `${i.quantidade}x ${i.nome}`).join(', ') : null;

  const servico = await registrarServico({
    empresaId,
    tecnicoId: tecnico.id,
    local: dados.local,
    endereco: dados.endereco ?? null,
    descricao: dados.descricao,
    material: materialTexto,
    valorCobrado,
    valorMaterial,
    valorLiquido,
    comissaoGerada,
    fotoEvidencia: dados.foto ?? null,
    clienteNome: dados.clienteNome ?? null,
    clienteTelefone: dados.clienteTelefone ?? null,
    msgOriginal: 'REGISTRO_PRIVADO',
    remetenteWpp: normalizarTelefone(jidTecnico),
    itensCatalogo: itens.map((i) => ({ materialId: i.materialId, quantidade: i.quantidade })),
  });

  // Agenda a solicitação de avaliação ao cliente (após reviewDelayHoras da empresa)
  if (dados.clienteTelefone) {
    await agendarAvaliacao({
      empresaId,
      servicoId: servico.id,
      clienteTelefone: dados.clienteTelefone,
      clienteNome: dados.clienteNome ?? null,
    }).catch((e) => logger.warn('Falha ao agendar avaliação', { erro: e.message }));
  }

  // Confirma ao técnico no privado
  await responder(
    `✅ Serviço registrado com sucesso!\n` +
    `💵 Líquido: ${formatarMoeda(valorLiquido)}` +
    (tecnico?.comissao > 0 ? `\n🤝 Sua comissão: ${formatarMoeda(comissaoGerada)}` : '') +
    `\n\nA avaliação será enviada ao cliente automaticamente. Obrigado!`
  );

  // Posta o resumo no grupo escolhido pela empresa (se configurado)
  const cfg = await prisma.empresaWhatsapp.findUnique({
    where: { empresaId }, select: { grupoJid: true },
  });
  if (cfg?.grupoJid) {
    const resumo = montarResumoGrupo({ tecnico, dados, valorCobrado, valorMaterial, valorLiquido, comissaoGerada, itens, servico });
    await enviarMensagem(cfg.grupoJid, resumo).catch((e) =>
      logger.warn('Falha ao postar resumo no grupo', { empresaId, erro: e.message })
    );
  } else {
    logger.info('Sem grupo configurado — resumo não postado', { empresaId });
  }

  logger.info('Serviço registrado via conversa privada', { empresaId, servicoId: servico.id, tecnicoId: tecnico.id });
  return servico;
}

function montarResumoGrupo({ tecnico, dados, valorCobrado, valorMaterial, valorLiquido, comissaoGerada, itens, servico }) {
  const linhasMateriais = itens.length > 0
    ? itens.map((i) => `   • ${i.quantidade}x ${i.nome} — ${formatarMoeda(i.valorTotal)}`)
    : [];
  return [
    `✅ *SERVIÇO CONCLUÍDO*`,
    `👷 Técnico: ${tecnico.nome}`,
    `📍 Local: ${dados.local}`,
    dados.endereco ? `🏠 Endereço: ${dados.endereco}` : null,
    `🔧 ${dados.descricao}`,
    `🙋 Cliente: ${dados.clienteNome}`,
    `💰 Cobrado: ${formatarMoeda(valorCobrado)}`,
    `🔧 Material: ${formatarMoeda(valorMaterial)}`,
    ...linhasMateriais,
    `💵 Líquido: ${formatarMoeda(valorLiquido)}`,
    tecnico.comissao > 0 ? `🤝 Comissão (${tecnico.comissao}%): ${formatarMoeda(comissaoGerada)}` : null,
    dados.foto ? `📷 Foto de evidência anexada` : null,
    `🕐 ${formatarData(servico.criadoEm)}`,
  ].filter(Boolean).join('\n');
}

// ── Extração do payload Evolution v2 ──────────────────────────────────────────
function extrairMensagem(evento) {
  // Evolution envia data como objeto único ou array de mensagens
  const data = evento?.data;
  const item = Array.isArray(data) ? data[0] : data;
  if (!item?.key) return null;

  const message = item.message ?? {};
  const texto = (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    ''
  ).trim();

  const img = message.imageMessage;
  // Com base64:true, a Evolution inclui o conteúdo em base64 no próprio item
  const imagemBase64 = img ? (item.message?.base64 || item.base64 || null) : null;

  return {
    remoteJid: item.key.remoteJid ?? '',
    fromMe: !!item.key.fromMe,
    texto,
    imagemBase64,
    mimetype: img?.mimetype ?? 'image/jpeg',
  };
}

async function salvarFotoBase64(base64, mimetype) {
  try {
    const buffer = Buffer.from(base64, 'base64');
    await mkdir(UPLOADS_DIR, { recursive: true });
    const ext = (mimetype?.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
    const nomeArquivo = `${randomUUID()}.${ext}`;
    await writeFile(path.join(UPLOADS_DIR, nomeArquivo), buffer);
    return `/uploads/${nomeArquivo}`;
  } catch (erro) {
    logger.warn('Falha ao salvar foto inbound', { erro: erro.message });
    return null;
  }
}
