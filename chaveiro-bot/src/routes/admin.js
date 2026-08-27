import { Router } from 'express';
import { lockUsuario } from '../services/auth.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { resolverPreferencias } from '../services/notificacao.js';
import {
  permissoesEfetivas,
  sanitizarPermissoes,
  limitarPermissoesAoAtor,
  presetDoPapel,
  podeAtribuirPapel,
  podeGerenciarUsuario,
  PAPEIS,
  MODULOS,
  ACOES_POR_MODULO,
  CAPACIDADES_PROPRIO,
} from '../services/permissoes.js';
import { avaliarForcaSenha } from '../services/senha.js';
import { variantesTelefone } from '../services/parser.js';
import { requireAuth, adminOnly, requirePermissao, senhaProvisoria } from '../middlewares/auth.js';
import { registrar as registrarAudit } from '../services/auditoria.js';
import { enviarEmailConvite } from '../services/email.js';
import { logger, redigirSensiveis } from '../utils/logger.js';

const router = Router();
router.use(requireAuth);
router.use(senhaProvisoria);

const SELECT_USUARIO = {
  id: true,
  nome: true,
  username: true,
  telefone: true,
  admin: true,
  papel: true,
  permissoes: true,
  senhaProvisoria: true,
  ativo: true,
  tecnico: { select: { id: true } },
  criadoEm: true,
};

router.get('/me/notificacoes', async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { notificacoes: true },
    });
    res.json(resolverPreferencias(usuario?.notificacoes));
  } catch (erro) {
    logger.error('Erro GET /me/notificacoes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/me/notificacoes', async (req, res) => {
  try {
    const schema = z.object({
      estoque_baixo: z.boolean().optional(),
      resumo: z.boolean().optional(),
      novo_servico: z.boolean().optional(),
      meta: z.boolean().optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const atual = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { notificacoes: true },
    });
    const novas = { ...resolverPreferencias(atual?.notificacoes), ...parse.data };
    await prisma.usuario.update({ where: { id: req.user.id }, data: { notificacoes: novas } });
    res.json(novas);
  } catch (erro) {
    logger.error('Erro PATCH /me/notificacoes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/notificacoes', async (req, res) => {
  try {
    const apenasNaoLidas = req.query.naoLidas === 'true';
    const where = { usuarioId: req.user.id };
    if (apenasNaoLidas) where.lida = false;
    const avisos = await prisma.notificacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 50,
    });
    res.json(avisos);
  } catch (erro) {
    logger.error('Erro GET /notificacoes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/notificacoes/nao-lidas', async (req, res) => {
  try {
    const total = await prisma.notificacao.count({
      where: { usuarioId: req.user.id, lida: false },
    });
    res.json({ total });
  } catch (erro) {
    logger.error('Erro GET /notificacoes/nao-lidas', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/notificacoes/:id/lida', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const result = await prisma.notificacao.updateMany({
      where: { id, usuarioId: req.user.id },
      data: { lida: true },
    });
    if (result.count === 0) return res.status(404).json({ erro: 'Notificação não encontrada' });
    res.json({ mensagem: 'Marcada como lida' });
  } catch (erro) {
    logger.error('Erro PATCH /notificacoes/:id/lida', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/notificacoes/ler-todas', async (req, res) => {
  try {
    await prisma.notificacao.updateMany({
      where: { usuarioId: req.user.id, lida: false },
      data: { lida: true },
    });
    res.json({ mensagem: 'Todas marcadas como lidas' });
  } catch (erro) {
    logger.error('Erro POST /notificacoes/ler-todas', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.delete('/notificacoes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const result = await prisma.notificacao.deleteMany({ where: { id, usuarioId: req.user.id } });
    if (result.count === 0) return res.status(404).json({ erro: 'Notificação não encontrada' });
    res.json({ mensagem: 'Removida' });
  } catch (erro) {
    logger.error('Erro DELETE /notificacoes/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/config/empresa', requirePermissao('configuracao', 'ver'), async (req, res) => {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.user.empresaId },
      select: { nome: true, aprovacaoServico: true },
    });
    res.json({ nome: empresa?.nome ?? null, aprovacaoServico: empresa?.aprovacaoServico ?? false });
  } catch (erro) {
    logger.error('Erro GET /config/empresa', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/config/empresa', requirePermissao('configuracao', 'editar'), async (req, res) => {
  try {
    const parse = z.object({ aprovacaoServico: z.boolean().optional() }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const empresa = await prisma.empresa.update({
      where: { id: req.user.empresaId },
      data: parse.data,
      select: { nome: true, aprovacaoServico: true },
    });
    res.json(empresa);
  } catch (erro) {
    logger.error('Erro PATCH /config/empresa', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/permissoes/catalogo', requirePermissao('usuarios', 'ver'), (req, res) => {
  res.json({
    papeis: PAPEIS,
    modulos: MODULOS,
    acoesPorModulo: ACOES_POR_MODULO,
    capacidadesProprio: CAPACIDADES_PROPRIO,
    presets: Object.fromEntries(PAPEIS.map((p) => [p, presetDoPapel(p)])),
  });
});

router.get('/usuarios', requirePermissao('usuarios', 'ver'), async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { empresaId: req.user.empresaId },
      select: SELECT_USUARIO,
      orderBy: { criadoEm: 'asc' },
    });
    res.json(usuarios.map((u) => ({ ...u, permissoesEfetivas: permissoesEfetivas(u) })));
  } catch (erro) {
    logger.error('Erro GET /usuarios', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/usuarios', requirePermissao('usuarios', 'editar'), async (req, res) => {
  try {
    const schema = z.object({
      nome: z.string().min(2),
      username: z
        .string()
        .min(3)
        .regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e _'),
      senha: z.string().min(6),
      papel: z.enum(PAPEIS).default('gestor'),
      permissoes: z.any().optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success)
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const { nome, username, senha, papel } = parse.data;
    // F1-BYPASS / EV-060: o teto de autoridade bloqueava só atribuir papel 'dono' — um
    // ator com usuarios.editar (concedido via override, não é o preset padrão de nenhum
    // papel) podia criar um PAR (mesmo papel que o seu, ex.: gestor cria gestor).
    // podeAtribuirPapel já fecha isso (só papel ESTRITAMENTE abaixo do ator); dono/admin
    // seguem sem teto, preservando "dono cria outro dono" (regressão testada).
    if (req.user.papel !== 'dono' && !req.user.admin && !podeAtribuirPapel(req.user, papel)) {
      return res.status(403).json({ erro: 'Sem permissão para criar usuário com este papel' });
    }
    const senhaHash = await bcrypt.hash(senha, 12);
    const usuario = await prisma.usuario.create({
      data: {
        nome,
        username,
        senhaHash,
        papel,
        admin: papel === 'dono',
        permissoes: limitarPermissoesAoAtor(req.user, sanitizarPermissoes(parse.data.permissoes)),
        empresaId: req.user.empresaId,
      },
      select: SELECT_USUARIO,
    });
    logger.info('user_created', { adminId: req.user.id, novoUserId: usuario.id, papel });
    registrarAudit({
      empresaId: req.user.empresaId,
      usuarioId: req.user.id,
      acao: 'usuario.criado',
      entidade: 'Usuario',
      entidadeId: usuario.id,
      depois: { nome: usuario.nome, papel: usuario.papel },
      ip: req.ip,
    }).catch(() => {});
    res.status(201).json({ ...usuario, permissoesEfetivas: permissoesEfetivas(usuario) });
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'Username já em uso' });
    logger.error('Erro POST /usuarios', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/usuarios/:id', requirePermissao('usuarios', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const schema = z.object({
      nome: z.string().min(2).optional(),
      ativo: z.boolean().optional(),
      papel: z.enum(PAPEIS).optional(),
      permissoes: z.any().optional(),
      senha: z.string().min(6).optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    if (parse.data.senha && !avaliarForcaSenha(parse.data.senha).valida) {
      return res
        .status(400)
        .json({ erro: 'Senha fraca: use ao menos 8 caracteres com letras, números e símbolos.' });
    }
    if (id === req.user.id) {
      if (parse.data.papel && parse.data.papel !== req.user.papel)
        return res.status(400).json({ erro: 'Você não pode alterar o próprio papel' });
      if (parse.data.ativo === false)
        return res.status(400).json({ erro: 'Você não pode desativar a própria conta' });
    }
    // EV-060: o teto de "papel === dono" cobria só a troca de papel — nada impedia um
    // ator com usuarios.editar de editar (ativo, senha, permissoes) QUALQUER usuário da
    // empresa, incluindo o dono. precisaGuardarAlvo cobre o PATCH inteiro sobre terceiros,
    // não só a troca de papel; dono/admin seguem sem teto (preserva comportamento atual).
    const precisaGuardarAlvo = id !== req.user.id && req.user.papel !== 'dono' && !req.user.admin;
    const { senha, permissoes, papel, ...resto } = parse.data;
    const auditarRbac = papel !== undefined || permissoes !== undefined;
    const antes =
      auditarRbac || precisaGuardarAlvo
        ? await prisma.usuario.findFirst({
            where: { id, empresaId: req.user.empresaId },
            select: { id: true, papel: true, admin: true, permissoes: true },
          })
        : null;
    if (precisaGuardarAlvo) {
      // Alvo inexistente (ou de outra empresa, já escopado acima) → 404 aqui mesmo, antes
      // que podeGerenciarUsuario(ator, null) decida (ela retorna false, o que viraria um
      // 403 indevido em vez do 404 correto — preserva o anti-IDOR cross-tenant existente).
      if (!antes) return res.status(404).json({ erro: 'Usuário não encontrado' });
      if (!podeGerenciarUsuario(req.user, antes)) {
        return res.status(403).json({ erro: 'Sem permissão para gerenciar este usuário' });
      }
    }
    if (papel !== undefined && req.user.papel !== 'dono' && !req.user.admin) {
      if (!podeAtribuirPapel(req.user, papel)) {
        return res.status(403).json({ erro: 'Sem permissão para atribuir este papel' });
      }
    }
    const data = { ...resto };
    if (papel !== undefined) {
      data.papel = papel;
      data.admin = papel === 'dono';
    }
    if (permissoes !== undefined)
      data.permissoes = limitarPermissoesAoAtor(req.user, sanitizarPermissoes(permissoes));
    if (senha) {
      data.senhaHash = await bcrypt.hash(senha, 12);
    }
    const r = await prisma.$transaction(async (tx) => {
      /* [Gate 6 R4/R5] Lock serializa com a troca da propria senha / rotacao concorrente. O corte
         e gravado DEPOIS do lock — senao um JWT concorrente com iatMs posterior a um corte velho
         sobreviveria. */
      await lockUsuario(tx, id);
      if (senha) {
        const agora = new Date();
        data.senhaAlteradaEm = agora;
        data.tokenValidoApos = agora;
      }
      const res = await tx.usuario.updateMany({
        /* [SEC-HB-03] Quando o guard decidiu com `antes.papel` (ator sem autoridade plena), a
         mutação exige que o papel AINDA seja aquele — promoção concorrente na janela
         leitura→escrita vira count=0 (404), nunca decisão sobre nível velho (CWE-367).
         Dono/admin não passam pelo guard de nível (antes pode ser null) e não precisam de
         âncora: têm autoridade sobre qualquer papel. */
        where: {
          id,
          empresaId: req.user.empresaId,
          ...(precisaGuardarAlvo && antes ? { papel: antes.papel } : {}),
        },
        data,
      });
      if (res.count === 1 && senha) {
        await tx.refreshToken.deleteMany({ where: { usuarioId: id } });
      }
      return res;
    });
    if (r.count === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: SELECT_USUARIO });
    if (parse.data.ativo === false) {
      logger.info('user_deactivated', { adminId: req.user.id, userId: id });
      registrarAudit({
        empresaId: req.user.empresaId,
        usuarioId: req.user.id,
        acao: 'usuario.desativado',
        entidade: 'Usuario',
        entidadeId: id,
        ip: req.ip,
      }).catch(() => {});
    }
    if (auditarRbac && antes) {
      logger.info('permissao_alterada', {
        adminId: req.user.id,
        userId: id,
        papelAntes: antes.papel,
        papelDepois: usuario.papel,
        permissoesMudaram:
          permissoes !== undefined &&
          JSON.stringify(antes.permissoes ?? null) !== JSON.stringify(usuario.permissoes ?? null),
      });
      registrarAudit({
        empresaId: req.user.empresaId,
        usuarioId: req.user.id,
        acao: 'usuario.permissoes_alteradas',
        entidade: 'Usuario',
        entidadeId: id,
        antes: { papel: antes.papel, permissoes: antes.permissoes },
        depois: { papel: usuario.papel, permissoes: usuario.permissoes },
        ip: req.ip,
      }).catch(() => {});
    }
    res.json({ ...usuario, permissoesEfetivas: permissoesEfetivas(usuario) });
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    logger.error('Erro PATCH /usuarios/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.delete('/usuarios/:id', requirePermissao('usuarios', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    if (id === req.user.id)
      return res.status(400).json({ erro: 'Não é possível remover o próprio usuário' });
    const alvoDel = await prisma.usuario.findFirst({
      where: { id, empresaId: req.user.empresaId },
      select: { nome: true, papel: true, admin: true },
    });
    if (!alvoDel) return res.status(404).json({ erro: 'Usuário não encontrado' });
    // EV-060: esta rota não tinha NENHUM teto de hierarquia — um ator com
    // usuarios.editar podia deletar qualquer usuário da empresa, incluindo o dono.
    if (req.user.papel !== 'dono' && !req.user.admin && !podeGerenciarUsuario(req.user, alvoDel)) {
      return res.status(403).json({ erro: 'Sem permissão para remover este usuário' });
    }
    /* [SEC-HB-03] Mesma âncora de nível do PATCH: só apaga se o papel ainda é o que o guard viu. */
    const r = await prisma.usuario.deleteMany({
      where: { id, empresaId: req.user.empresaId, papel: alvoDel.papel },
    });
    if (r.count === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    registrarAudit({
      empresaId: req.user.empresaId,
      usuarioId: req.user.id,
      acao: 'usuario.excluido',
      entidade: 'Usuario',
      entidadeId: id,
      antes: alvoDel,
      ip: req.ip,
    }).catch(() => {});
    res.json({ mensagem: 'Usuário removido' });
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    logger.error('Erro DELETE /usuarios/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/usuarios/convidar', requirePermissao('usuarios', 'editar'), async (req, res) => {
  const parse = z
    .object({ email: z.string().email(), papel: z.enum(PAPEIS).default('funcionario') })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  // F1-BYPASS / EV-060: o convite decide o papel do futuro usuário no momento da
  // CRIAÇÃO do convite — quem aceita não é o ator da escalação, então o teto de
  // autoridade precisa valer aqui, não em /convite/:token/aceitar. podeAtribuirPapel
  // fecha também o caso de um gestor convidar outro gestor (par), não só 'dono'.
  if (
    req.user.papel !== 'dono' &&
    !req.user.admin &&
    !podeAtribuirPapel(req.user, parse.data.papel)
  ) {
    return res.status(403).json({ erro: 'Sem permissão para convidar com este papel' });
  }
  try {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiraEm = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await prisma.conviteUsuario.create({
      data: {
        empresaId: req.user.empresaId,
        email: parse.data.email,
        papel: parse.data.papel,
        tokenHash,
        nomeConvidadoPor: req.user.nome,
        expiraEm,
      },
    });
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.user.empresaId },
      select: { nome: true },
    });
    enviarEmailConvite(parse.data.email, empresa?.nome ?? 'AdmAi', parse.data.papel, token).catch(
      () => {}
    );
    registrarAudit({
      empresaId: req.user.empresaId,
      usuarioId: req.user.id,
      acao: 'convite.enviado',
      entidade: 'ConviteUsuario',
      depois: { email: parse.data.email, papel: parse.data.papel },
      ip: req.ip,
    }).catch(() => {});
    res.json({ enviado: true });
  } catch (erro) {
    logger.error('Erro POST /usuarios/convidar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── AUDITORIA CONSULTÁVEL (USER GATE D3 · DECISOR AUD2-P3, thread 01a04465) ──
// A trilha (services/auditoria.js → AuditLog) era gravada mas invisível ao produto.
// Leitura adminOnly (least privilege: o conteúdo é administração de usuários/permissões/
// LGPD — matéria do dono; `configuracao.ver` é extensível a não-donos e foi rejeitada).
// Saída por ALLOWLIST POR AÇÃO com default fechado: `antes/depois` são Json livres e um
// call site futuro poderia gravar algo sensível — ação desconhecida NÃO expõe detalhes.
// `redigirSensiveis` entra como segunda linha de defesa, nunca como a única.

const auditoriaQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.coerce.number().int().positive().optional(),
});

/** Matriz de permissões reduzida às chaves CONHECIDAS do catálogo (booleans). */
function matrizConhecida(permissoes) {
  if (!permissoes || typeof permissoes !== 'object') return null;
  const saida = {};
  for (const modulo of MODULOS) {
    const acoes = permissoes[modulo];
    if (!acoes || typeof acoes !== 'object') continue;
    const linha = {};
    for (const acao of ACOES_POR_MODULO[modulo] ?? []) {
      if (typeof acoes[acao] === 'boolean') linha[acao] = acoes[acao];
    }
    if (Object.keys(linha).length) saida[modulo] = linha;
  }
  const proprio = permissoes.proprio;
  if (proprio && typeof proprio === 'object') {
    const linha = {};
    for (const cap of CAPACIDADES_PROPRIO) {
      if (typeof proprio[cap] === 'boolean') linha[cap] = proprio[cap];
    }
    if (Object.keys(linha).length) saida.proprio = linha;
  }
  return Object.keys(saida).length ? saida : null;
}

/** Allowlist de `antes/depois` por ação. Default FECHADO: ação fora da lista → null. */
export function detalhesAuditoria(acao, antes, depois) {
  const str = (v) => (typeof v === 'string' ? v : null);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const bool = (v) => (typeof v === 'boolean' ? v : null);
  switch (acao) {
    case 'usuario.criado':
      return { antes: null, depois: depois ? { nome: str(depois.nome), papel: str(depois.papel) } : null };
    case 'usuario.permissoes_alteradas': {
      const lado = (v) =>
        v ? { papel: str(v.papel), permissoes: matrizConhecida(v.permissoes) } : null;
      return { antes: lado(antes), depois: lado(depois) };
    }
    case 'usuario.excluido':
      return {
        antes: antes ? { nome: str(antes.nome), papel: str(antes.papel), admin: bool(antes.admin) } : null,
        depois: null,
      };
    case 'convite.enviado':
      return { antes: null, depois: depois ? { email: str(depois.email), papel: str(depois.papel) } : null };
    case 'lgpd.cliente_anonimizado':
      return {
        antes: null,
        depois: depois
          ? {
              servicosAnonimizados: num(depois.servicosAnonimizados),
              avaliacoesAnonimizadas: num(depois.avaliacoesAnonimizadas),
            }
          : null,
      };
    case 'conta.excluida':
      return {
        antes: null,
        depois: depois ? { escopo: str(depois.escopo), usuariosAfetados: num(depois.usuariosAfetados) } : null,
      };
    default:
      return { antes: null, depois: null };
  }
}

/** DTO por registro — allowlist top-level explícita, nunca spread do registro Prisma. */
export function dtoAuditoria(reg, autoresPorId) {
  const det = redigirSensiveis(detalhesAuditoria(reg.acao, reg.antes, reg.depois));
  return {
    id: reg.id,
    criadoEm: reg.criadoEm,
    acao: reg.acao,
    entidade: reg.entidade ?? null,
    entidadeId: reg.entidadeId ?? null,
    ip: reg.ip ?? null,
    autorNome: (reg.usuarioId != null && autoresPorId.get(reg.usuarioId)) || null,
    antes: det.antes,
    depois: det.depois,
  };
}

/** Keyset por (criadoEm, id) DESC — a tupla da ordenação, nunca só o id. */
export function whereKeyset(cursorReg) {
  if (!cursorReg) return {};
  return {
    OR: [
      { criadoEm: { lt: cursorReg.criadoEm } },
      { criadoEm: cursorReg.criadoEm, id: { lt: cursorReg.id } },
    ],
  };
}

router.get('/auditoria', adminOnly, async (req, res) => {
  const parse = auditoriaQuerySchema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ erro: 'Parâmetros inválidos' });
  const { take, cursor } = parse.data;
  try {
    let cursorReg = null;
    if (cursor !== undefined) {
      // Resolvido DENTRO do tenant (req.db escopa AuditLog): cursor de outra empresa ou
      // inexistente é 400 opaco — não revela existência.
      cursorReg = await req.db.auditLog.findFirst({
        where: { id: cursor },
        select: { id: true, criadoEm: true },
      });
      if (!cursorReg) return res.status(400).json({ erro: 'Cursor inválido' });
    }
    const registros = await req.db.auditLog.findMany({
      where: whereKeyset(cursorReg),
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const pagina = registros.slice(0, take);
    const ids = [...new Set(pagina.map((r) => r.usuarioId).filter((v) => v != null))];
    const autores = ids.length
      ? await prisma.usuario.findMany({
          where: { empresaId: req.user.empresaId, id: { in: ids } },
          select: { id: true, nome: true },
        })
      : [];
    const autoresPorId = new Map(autores.map((a) => [a.id, a.nome]));
    res.json({
      itens: pagina.map((r) => dtoAuditoria(r, autoresPorId)),
      proximoCursor: registros.length > take ? pagina[pagina.length - 1].id : null,
    });
  } catch (erro) {
    logger.error('Erro GET /auditoria', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/lgpd/anonimizar-cliente', adminOnly, async (req, res) => {
  try {
    const parse = z
      .object({ telefone: z.string().trim().min(8, 'Telefone inválido') })
      .safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Informe o telefone do cliente.' });
    // O banco guarda o telefone canônico ('55DDDNUMERO'), então comparar só com o texto
    // cru e com os dígitos não casava nada: o endpoint respondia ok:true / 0 registros
    // para um pedido de apagamento LGPD, dando aparência de sucesso sem apagar nada.
    // `variantesTelefone` cobre as formas com e sem o 9º dígito, como o resto do código.
    const bruto = parse.data.telefone;
    const digitos = bruto.replace(/\D/g, '');
    const formas = [...new Set([bruto, digitos, ...variantesTelefone(bruto)].filter(Boolean))];
    const alvo = { clienteTelefone: { in: formas } };
    const [servicos, avaliacoes] = await Promise.all([
      req.db.servico.updateMany({
        where: alvo,
        data: { clienteNome: null, clienteTelefone: null },
      }),
      req.db.avaliacao.updateMany({
        where: alvo,
        data: { clienteNome: null, clienteTelefone: '', comentario: null },
      }),
    ]);
    logger.info('lgpd_anonimizar_cliente', {
      empresaId: req.user.empresaId,
      servicos: servicos.count,
      avaliacoes: avaliacoes.count,
    });

    /* [GAP-AUD-01] O pedido de anonimizacao e uma operacao sobre dado pessoal, e a LGPD exige
       DEMONSTRAR o atendimento ao titular. Demonstrar exige registro.

       O telefone NAO entra no registro. Ele e justamente o dado que se acabou de remover das
       tabelas; guarda-lo aqui faria a trilha preservar o que a operacao existe para apagar. O que
       se registra e o efeito: quem pediu, quando, e quantas linhas foram afetadas — suficiente para
       provar o atendimento sem reconstituir o titular. */
    await registrarAudit({
      empresaId: req.user.empresaId,
      usuarioId: req.user.id,
      acao: 'lgpd.cliente_anonimizado',
      entidade: 'Cliente',
      depois: { servicosAnonimizados: servicos.count, avaliacoesAnonimizadas: avaliacoes.count },
      ip: req.ip,
    });
    res.json({
      ok: true,
      servicosAnonimizados: servicos.count,
      avaliacoesAnonimizadas: avaliacoes.count,
    });
  } catch (erro) {
    logger.error('Erro POST /lgpd/anonimizar-cliente', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

export default router;
