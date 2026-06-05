import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parsearMensagem, normalizarTelefone } from './parser.js';
import { registrarServico, formatarData, formatarMoeda } from './servico.js';
import { resolverMateriaisDoServico } from './catalogo.js';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Diretório onde as fotos de evidência ficam salvas; servido estaticamente em /uploads.
const UPLOADS_DIR = path.resolve('./uploads');

// libsignal usa console.{error,warn,info} hardcoded — não é afetado pelo pino silent.
// As mensagens abaixo são ruído normal do protocolo Signal durante renegociação de sessão.
const _libsignalNoise = (msg) => typeof msg === 'string' && (
  msg.startsWith('Failed to decrypt') ||
  msg.startsWith('Session error:') ||
  msg.startsWith('Closing open session') ||
  msg.startsWith('Closing session:') ||
  msg.startsWith('Removing old closed session') ||
  msg.startsWith('Decrypted message with closed session') ||
  msg.startsWith('Session already')
);
const _ce = console.error.bind(console);
const _cw = console.warn.bind(console);
const _ci = console.info.bind(console);
console.error = (...a) => { if (!_libsignalNoise(a[0])) _ce(...a); };
console.warn  = (...a) => { if (!_libsignalNoise(a[0])) _cw(...a); };
console.info  = (...a) => { if (!_libsignalNoise(a[0])) _ci(...a); };

let sock = null;
let qrBase64 = null;
let estado = 'desconectado';
let templateEnviado = false;

// ── Multi-tenant (interino, Fase 1) ──────────────────────────────────────────
// O fluxo legado de grupo único opera sobre UMA empresa. Resolvemos a empresa
// dona do grupo configurado (EmpresaWhatsapp.grupoJid == GROUP_JID); na ausência,
// caímos na primeira empresa cadastrada. Na Fase 2, a empresa virá da instância
// Evolution que recebeu o webhook (não mais deste fallback).
let _empresaPadraoIdCache = null;
async function resolverEmpresaPadraoId() {
  if (_empresaPadraoIdCache) return _empresaPadraoIdCache;
  const porGrupo = env.GROUP_JID
    ? await prisma.empresaWhatsapp.findFirst({ where: { grupoJid: env.GROUP_JID }, select: { empresaId: true } })
    : null;
  const empresaId = porGrupo?.empresaId
    ?? (await prisma.empresa.findFirst({ orderBy: { id: 'asc' }, select: { id: true } }))?.id
    ?? null;
  _empresaPadraoIdCache = empresaId;
  return empresaId;
}

const TEMPLATE_SERVICO = `📋 *TEMPLATE DE SERVIÇO*

Para registrar um serviço, copie, preencha e envie:

✅ SERVIÇO CONCLUÍDO
Local: [Casa do cliente | Contrato | Ponto da loja | Outro]
Endereço: [endereço completo ou N/A]
Serviço: [descrição do que foi feito]
Material: [nome e quantidade, ex: Fechadura Tetra x2 | ou Nenhum]
Valor cobrado: R$[valor]

📷 _Anexe a foto do serviço junto com a mensagem._
💡 _O material é buscado no catálogo do app — o valor é calculado automaticamente. Cadastre os produtos no app antes._
_O sistema identifica você pelo número automaticamente._`;

export const getQRBase64 = () => qrBase64;
export const getEstado = () => estado;
export const getSock = () => sock;

export async function iniciarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  logger.info('Iniciando Baileys', { versao: version.join('.') });

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    getMessage: async () => ({ conversation: '' }),
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrBase64 = await qrcode.toDataURL(qr);
      estado = 'aguardando_qr';
      logger.info('QR Code gerado — acesse http://localhost:3000/qr');
    }

    if (connection === 'connecting') estado = 'conectando';

    if (connection === 'open') {
      estado = 'conectado';
      qrBase64 = null;
      logger.info('✅ WhatsApp conectado!');

      if (!templateEnviado && env.GROUP_JID && !env.GROUP_JID.includes('xxxxxx')) {
        templateEnviado = true;
        setTimeout(async () => {
          await enviarMensagem(env.GROUP_JID, TEMPLATE_SERVICO);
          logger.info('Template de serviço enviado ao grupo');
          await varrerMembrosDoGrupo();
        }, 3000);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      estado = 'desconectado';
      qrBase64 = null;

      if (statusCode === DisconnectReason.loggedOut) {
        logger.warn('WhatsApp deslogado. Acesse /qr para reconectar.');
      } else {
        logger.info('Reconectando WhatsApp...', { statusCode });
        setTimeout(() => iniciarWhatsApp(), 3000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const jid = msg.key?.remoteJid ?? '';
      const hasText = !!(msg.message?.conversation || msg.message?.extendedTextMessage?.text);
      if (jid === env.GROUP_JID) {
        logger.info('Mensagem do grupo recebida', {
          fromMe: msg.key?.fromMe,
          temTexto: hasText,
          participante: msg.key?.participant,
          pushName: msg.pushName,
        });

        // Atualiza nome pelo pushName em qualquer mensagem do grupo (não só ✅)
        const senderJid = msg.key?.participant;
        if (senderJid && msg.pushName) {
          const tel = normalizarTelefone(senderJid);
          const empId = await resolverEmpresaPadraoId();
          if (tel && empId) {
            await prisma.tecnico.updateMany({
              where: { empresaId: empId, telefone: tel },
              data: { nome: msg.pushName },
            }).catch(() => {});
          }
        }
      }
      await processarMensagem(msg).catch((e) =>
        logger.error('Erro ao processar mensagem', { erro: e.message })
      );
    }
  });

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (id !== env.GROUP_JID || action !== 'add') return;
    for (const jid of participants) {
      await autoRegistrarParticipante(jid, null, 'novo_membro').catch(() => {});
    }
  });

  // Atualiza nome e telefone real dos técnicos quando Baileys recebe info de contatos
  sock.ev.on('contacts.upsert', async (contacts) => {
    for (const contact of contacts) {
      const jidTelefone = normalizarTelefone(contact.id);
      if (!jidTelefone) continue;

      const updateData = {};
      const nome = contact.notify || contact.name;
      if (nome) updateData.nome = nome;

      // LID contacts podem trazer o número de telefone real em phoneNumber
      if (contact.phoneNumber) {
        const telefoneReal = contact.phoneNumber.replace(/\D/g, '');
        if (telefoneReal && telefoneReal.length <= 13) {
          updateData.telefoneDisplay = telefoneReal;
        }
      }

      if (Object.keys(updateData).length === 0) continue;

      const empId = await resolverEmpresaPadraoId();
      if (!empId) continue;
      await prisma.tecnico.updateMany({
        where: { empresaId: empId, telefone: jidTelefone },
        data: updateData,
      }).catch(() => {});
    }
  });
}

async function processarMensagem(msg) {
  const jid = msg.key?.remoteJid ?? '';
  if (!jid.endsWith('@g.us') || jid !== env.GROUP_JID) return;

  // Tenta extrair texto de todos os tipos de mensagem possíveis.
  // Inclui a legenda (caption) de imagens — o técnico pode mandar a foto de
  // evidência com o template preenchido na legenda.
  const texto = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.ephemeralMessage?.message?.conversation ||
    msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
    msg.message?.ephemeralMessage?.message?.imageMessage?.caption ||
    msg.message?.viewOnceMessage?.message?.conversation ||
    msg.message?.viewOnceMessage?.message?.imageMessage?.caption ||
    ''
  ).trim();

  const ehServico = /servi[çc]o\s+conclu[íi]do/i.test(texto);

  logger.info('processarMensagem', {
    temTexto: !!texto,
    temServico: ehServico,
    textoInicio: texto.slice(0, 60).replace(/\n/g, '↵'),
    tipoMensagem: Object.keys(msg.message || {}).join(','),
    fromMe: msg.key?.fromMe,
    participante: msg.key?.participant,
  });

  if (!texto || !ehServico) return;

  const remetenteJid = msg.key?.participant ?? msg.key?.remoteJid ?? '';
  const telefone = normalizarTelefone(remetenteJid);

  const empresaId = await resolverEmpresaPadraoId();
  if (!empresaId) {
    logger.warn('Nenhuma empresa cadastrada — serviço não registrado', { telefone });
    await enviarMensagem(env.GROUP_JID, '⚠️ Sistema sem empresa configurada. Contate o administrador.');
    return;
  }

  logger.info('Processando serviço', { telefone, remetenteJid, empresaId });

  let tecnico = await prisma.tecnico.findFirst({ where: { empresaId, telefone } });
  if (!tecnico) {
    logger.info('Técnico não cadastrado, auto-registrando', { telefone });
    tecnico = await autoRegistrarParticipante(remetenteJid, msg.pushName, 'mensagem', empresaId);
  }

  if (!tecnico) {
    logger.warn('Não foi possível identificar ou registrar o técnico', { remetenteJid, telefone });
    await enviarMensagem(env.GROUP_JID, '⚠️ Não foi possível identificar o técnico. Entre em contato com o administrador.');
    return;
  }

  logger.info('Técnico identificado', { id: tecnico.id, nome: tecnico.nome });

  const resultado = parsearMensagem(texto);

  logger.info('Resultado do parser', {
    valido: resultado.valido,
    camposFaltando: resultado.camposFaltando ?? [],
    local: resultado.local,
    valorCobrado: resultado.valorCobrado,
  });

  if (!resultado.valido) {
    const campos = resultado.camposFaltando.join(', ');
    await enviarMensagem(env.GROUP_JID,
      `⚠️ Não consegui registrar o serviço.\nCampo ausente: ${campos}\nVerifique o template e reenvie.`
    );
    return;
  }

  // ── Resolução de materiais contra o catálogo ──────────────────────────────
  // O técnico informa apenas nome + quantidade; o valor vem do catálogo (custo).
  // O bot NÃO cria produtos: material fora do catálogo bloqueia o registro.
  const { itens, naoEncontrados, valorMaterialTotal } =
    await resolverMateriaisDoServico(resultado.material, empresaId);

  if (naoEncontrados.length > 0) {
    const lista = naoEncontrados.map((n) => `• ${n}`).join('\n');
    await enviarMensagem(env.GROUP_JID,
      `⚠️ Não registrei o serviço.\n` +
      `Os materiais abaixo não estão no catálogo:\n${lista}\n\n` +
      `Cadastre-os no aplicativo (tela *Materiais*) e reenvie. ` +
      `Confira também se o nome está escrito corretamente.`
    );
    return;
  }

  const valorMaterial = valorMaterialTotal;
  const valorLiquido = resultado.valorCobrado - valorMaterial;
  const comissaoGerada = valorLiquido * (tecnico.comissao / 100);

  // Captura a foto de evidência, se a mensagem trouxer uma imagem anexada.
  const fotoEvidencia = await salvarFotoEvidencia(msg);

  // Descrição textual consolidada dos materiais do catálogo (para Servico.material)
  const materialTexto = itens.length > 0
    ? itens.map((i) => `${i.quantidade}x ${i.nome}`).join(', ')
    : null;

  const servico = await registrarServico({
    empresaId,
    tecnicoId: tecnico.id,
    local: resultado.local,
    endereco: resultado.endereco,
    descricao: resultado.descricao,
    material: materialTexto,
    valorCobrado: resultado.valorCobrado,
    valorMaterial,
    valorLiquido,
    comissaoGerada,
    fotoEvidencia,
    msgOriginal: texto,
    remetenteWpp: telefone,
    // Itens do catálogo: criam vínculo ServicoMaterial + baixa de estoque
    itensCatalogo: itens.map((i) => ({ materialId: i.materialId, quantidade: i.quantidade })),
  });

  const linhasComissao = tecnico.comissao > 0
    ? [`\n🤝 Comissão (${tecnico.comissao}%): ${formatarMoeda(comissaoGerada)}`]
    : [];

  const linhasMateriais = itens.length > 0
    ? itens.map((i) => `   • ${i.quantidade}x ${i.nome} — ${formatarMoeda(i.valorTotal)}`)
    : [];

  const confirmacao = [
    `✅ Serviço registrado com sucesso!`,
    `👷 Técnico: ${tecnico.nome}`,
    `📍 Local: ${resultado.local}`,
    `💰 Cobrado: ${formatarMoeda(resultado.valorCobrado)}`,
    `🔧 Material: ${formatarMoeda(valorMaterial)}`,
    ...linhasMateriais,
    `💵 Líquido: ${formatarMoeda(valorLiquido)}`,
    ...linhasComissao,
    ...(fotoEvidencia ? [`📷 Foto de evidência anexada`] : []),
    `🕐 Registrado em: ${formatarData(servico.criadoEm)}`,
  ].join('\n');

  await enviarMensagem(env.GROUP_JID, confirmacao);

  // Aviso não-bloqueante: líquido negativo (material custou mais que o cobrado).
  if (valorLiquido < 0) {
    await enviarMensagem(env.GROUP_JID,
      `⚠️ Atenção: o custo do material (${formatarMoeda(valorMaterial)}) ficou maior ` +
      `que o valor cobrado (${formatarMoeda(resultado.valorCobrado)}). ` +
      `O líquido ficou negativo. Confira os valores no catálogo.`
    );
  }
}

/**
 * Se a mensagem contiver uma imagem, baixa a mídia e salva em ./uploads,
 * retornando o caminho público (ex.: "/uploads/abc.jpg") para gravar no banco.
 * Retorna null se não houver imagem ou se o download falhar (não bloqueia o registro).
 */
async function salvarFotoEvidencia(msg) {
  const conteudo = msg.message ?? {};
  const imagem =
    conteudo.imageMessage ||
    conteudo.ephemeralMessage?.message?.imageMessage ||
    conteudo.viewOnceMessage?.message?.imageMessage;
  if (!imagem) return null;

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
    await mkdir(UPLOADS_DIR, { recursive: true });
    const ext = (imagem.mimetype?.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
    const nomeArquivo = `${randomUUID()}.${ext}`;
    await writeFile(path.join(UPLOADS_DIR, nomeArquivo), buffer);
    logger.info('Foto de evidência salva', { nomeArquivo, bytes: buffer.length });
    return `/uploads/${nomeArquivo}`;
  } catch (erro) {
    logger.warn('Não foi possível salvar a foto de evidência', { erro: erro.message });
    return null;
  }
}

async function autoRegistrarParticipante(jid, nome, origem, empresaId) {
  const telefone = normalizarTelefone(jid);
  if (!telefone) return null;
  if (!empresaId) {
    empresaId = await resolverEmpresaPadraoId();
    if (!empresaId) return null;
  }

  const fotoPerfil = sock
    ? await sock.profilePictureUrl(jid, 'image').catch(() => null)
    : null;

  // Número real (≤ 13 dígitos) vai para telefoneDisplay; LID fica só no identificador interno
  const telefoneDisplay = telefone.length <= 13 ? telefone : null;
  const nomeEfetivo = nome || telefone;
  const updateData = {};
  if (fotoPerfil) updateData.fotoPerfil = fotoPerfil;
  if (nome) updateData.nome = nome;
  if (telefoneDisplay) updateData.telefoneDisplay = telefoneDisplay;

  // telefone agora é único POR EMPRESA → usa a chave composta empresaId_telefone
  const tecnico = await prisma.tecnico.upsert({
    where: { empresaId_telefone: { empresaId, telefone } },
    create: { empresaId, nome: nomeEfetivo, telefone, telefoneDisplay, fotoPerfil },
    update: updateData,
  });

  logger.info('Técnico auto-registrado', { telefone, nome: tecnico.nome, origem, empresaId });
  return tecnico;
}

async function varrerMembrosDoGrupo() {
  if (!sock || !env.GROUP_JID || env.GROUP_JID.includes('xxxxxx')) return;
  try {
    const { participants } = await sock.groupMetadata(env.GROUP_JID);
    let registrados = 0;
    for (const { id } of participants) {
      const tecnico = await autoRegistrarParticipante(id, null, 'startup').catch(() => null);
      if (tecnico) registrados++;
    }
    logger.info('Varredura de membros concluída', { total: participants.length, registrados });
  } catch (erro) {
    logger.warn('Falha na varredura de membros do grupo', { erro: erro.message });
  }
}

export async function enviarMensagem(jid, texto) {
  if (!sock || estado !== 'conectado') {
    logger.warn('WhatsApp não conectado — mensagem não enviada');
    return;
  }
  try {
    await sock.sendMessage(jid, { text: texto });
    logger.info('Mensagem enviada', { jid });
  } catch (erro) {
    logger.error('Erro ao enviar mensagem', { erro: erro.message });
  }
}
