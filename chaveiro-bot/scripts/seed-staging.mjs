#!/usr/bin/env node
// =============================================================================
// seed-staging.mjs — fixtures SINTÉTICAS do STAGING (multi-tenant A/B).
// [STG-APP-STAGING-01 · D1 thread 01a038e5]
//
// POR QUE UM SEEDER SEPARADO DO seed-demo.mjs
//   O seed-demo é deliberadamente LOCAL-ONLY (loopback + banco *_dev/_test) e esse
//   guard NÃO pode ser enfraquecido. Staging é um banco REMOTO específico — então o
//   guard aqui é o INVERSO, igualmente fail-closed: só opera se a DATABASE_URL
//   estiver VINCULADA POSITIVAMENTE ao admai-staging (ref extraído estruturalmente),
//   e nega o ref de produção SEMPRE. Qualquer outra forma/host/ref aborta.
//
// O QUE SEMEIA (mínimo para STG-E2E-* + STG-TENANT-NEGATIVE)
//   Empresa A (stg-fix-empresa-a): dono.a.stg / gestor.a.stg / func.a.stg (+Técnica
//     vinculada), assinatura trial, 2 materiais, serviços ativo + PENDENTE com
//     material e estoque INTACTO (a aprovação acontece NO produto), ponto de ontem.
//   Empresa B (stg-fix-empresa-b): dono.b.stg + 1 técnico + 1 serviço ativo —
//     o ALVO do tenant-negative (A não pode ler/mutar B).
//
//   SEED_STATE != RUNTIME_ACCEPTANCE: o pendente existe para ser aprovado na tela.
//
// RE-RUN SAFETY: idempotência por RECONSTRUÇÃO (remove os DOIS tenants pelo slug
//   determinístico e recria). Cleanup: --reset remove só os tenants fixture.
//
// Uso (credenciais via env; NUNCA impressas/versionadas):
//   node --env-file=.env.staging scripts/seed-staging.mjs --check
//   ALLOW_STAGING_SEED=true SEED_STAGING_SENHA=... node --env-file=.env.staging scripts/seed-staging.mjs --seed
//   ALLOW_STAGING_SEED=true node --env-file=.env.staging scripts/seed-staging.mjs --reset
// =============================================================================
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

export const REF_STAGING = 'qsuufuulxfkkeasgxhcv';
export const REF_PRODUCAO = 'disljhkypaxpyzvbooge';
export const SLUG_A = 'stg-fix-empresa-a';
export const SLUG_B = 'stg-fix-empresa-b';

function abortar(msg, code = 1) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(code);
}
const ok = (m) => console.log(`✅ ${m}`);
const info = (m) => console.log(`   ${m}`);

/**
 * Elegibilidade STAGING-ONLY, por VÍNCULO POSITIVO (espelha o guard de boot do app):
 * pooler `postgres.<ref>` ou direta `db.<ref>.supabase.co`, ref TEM de ser o do
 * admai-staging; ref de produção é negado ANTES (defesa em profundidade); loopback,
 * ref arbitrário ou forma desconhecida ⇒ inelegível. Nunca loga a URL (credencial).
 */
export function ambienteElegivelStaging(databaseUrl) {
  if (!databaseUrl) return { elegivel: false, motivo: 'DATABASE_URL ausente' };
  if (databaseUrl.includes(REF_PRODUCAO)) {
    return { elegivel: false, motivo: 'DATABASE_URL contém o ref de PRODUÇÃO' };
  }
  let u;
  try {
    u = new URL(databaseUrl);
  } catch {
    return { elegivel: false, motivo: 'DATABASE_URL não é uma URL válida' };
  }
  const refUser = u.username.startsWith('postgres.') ? u.username.slice('postgres.'.length) : null;
  const m = u.hostname.match(/^db\.([a-z0-9]{16,})\.supabase\.co$/);
  const ref = refUser ?? (m ? m[1] : null);
  if (ref !== REF_STAGING) {
    return {
      elegivel: false,
      motivo: `conexão não vinculada ao admai-staging (${REF_STAGING}) — vínculo positivo obrigatório`,
    };
  }
  return { elegivel: true, motivo: null, ref };
}

/* Cliente preguiçoso (mesma lição do seed-demo: import não abre conexão). */
let _prisma = null;
const db = () =>
  (_prisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }));

const modo = process.argv.find((a) => ['--check', '--seed', '--reset'].includes(a)) || '--check';

/** Remove UM tenant fixture inteiro (ordem de dependência do seed-demo, escopo por slug). */
async function removerTenant(slug) {
  const e = await db().empresa.findUnique({ where: { slug } });
  if (!e) return false;
  const p = db();
  const emp = { empresaId: e.id };
  const usuarios = (await p.usuario.findMany({ where: emp, select: { id: true } })).map(
    (u) => u.id
  );
  const tecnicos = (await p.tecnico.findMany({ where: emp, select: { id: true } })).map(
    (t) => t.id
  );
  const servicos = (await p.servico.findMany({ where: emp, select: { id: true } })).map(
    (s) => s.id
  );
  const materiais = (await p.material.findMany({ where: emp, select: { id: true } })).map(
    (m) => m.id
  );
  const registros = (await p.registroPonto.findMany({ where: emp, select: { id: true } })).map(
    (r) => r.id
  );

  await p.batidaPonto.deleteMany({ where: { registroId: { in: registros } } });
  await p.registroPonto.deleteMany({ where: emp });
  await p.movimentacaoEstoque.deleteMany({ where: { materialId: { in: materiais } } });
  await p.servicoMaterial.deleteMany({ where: { servicoId: { in: servicos } } });
  await p.avaliacao.deleteMany({ where: emp });
  await p.servico.deleteMany({ where: emp });
  await p.material.deleteMany({ where: emp });
  await p.documentoTecnico.deleteMany({ where: { tecnicoId: { in: tecnicos } } });
  await p.notificacao.deleteMany({ where: { usuarioId: { in: usuarios } } });
  await p.refreshToken.deleteMany({ where: { usuarioId: { in: usuarios } } });
  await p.sessaoUsuario.deleteMany({ where: { usuarioId: { in: usuarios } } });
  await p.codigoRecuperacaoTotp.deleteMany({ where: { usuarioId: { in: usuarios } } });
  await p.tecnico.deleteMany({ where: emp });
  await p.usuario.deleteMany({ where: emp });
  await p.assinatura.deleteMany({ where: emp });
  await p.conviteUsuario.deleteMany({ where: emp });
  await p.empresaWhatsapp.deleteMany({ where: emp });
  await p.sessaoConversa.deleteMany({ where: emp });
  await p.empresa.delete({ where: { id: e.id } });
  return true;
}

async function semear(senha) {
  await removerTenant(SLUG_A);
  await removerTenant(SLUG_B);

  const hash = await bcrypt.hash(senha, 10);
  const agora = new Date();
  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

  const criarTenant = async ({ slug, nome, aprovacao }) => {
    const empresa = await db().empresa.create({
      data: { nome, slug, aprovacaoServico: aprovacao },
    });
    // Sem trial ativa o paywall (402) fecha o produto inteiro — mesma lição do seed-demo.
    await db().assinatura.create({
      data: {
        empresaId: empresa.id,
        status: 'trialing',
        trialFimEm: new Date(agora.getTime() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    return empresa;
  };
  const criarUsuario = (empresaId, nome, username, papel, admin = false) =>
    db().usuario.create({
      data: {
        empresaId,
        nome,
        username,
        email: `${username}@staging-fixture.local`,
        senhaHash: hash,
        papel,
        admin,
        ativo: true,
        emailVerificado: true,
      },
    });

  // ── Empresa A (jornadas OWNER/MANAGER/EMPLOYEE) ────────────────────────────
  const a = await criarTenant({ slug: SLUG_A, nome: 'STG Fixture — Empresa A', aprovacao: true });
  await criarUsuario(a.id, 'Dono A Staging', 'dono.a.stg', 'dono', true);
  await criarUsuario(a.id, 'Gestor A Staging', 'gestor.a.stg', 'gestor');
  const func = await criarUsuario(a.id, 'Func A Staging', 'func.a.stg', 'funcionario');

  const tecnicaA = await db().tecnico.create({
    data: {
      empresaId: a.id,
      nome: 'Func A Staging',
      telefone: '5511930000001',
      telefoneDisplay: '5511930000001',
      comissao: 20,
      ativo: true,
      usuarioId: func.id,
      modalidade: 'clt',
    },
  });

  const fechaduraA = await db().material.create({
    data: {
      empresaId: a.id,
      nome: 'STG Fechadura A',
      unidade: 'un',
      precoUnit: 45,
      precoVenda: 120,
      estoqueMinimo: 3,
      quantidadeAtual: 10,
    },
  });
  const cilindroA = await db().material.create({
    data: {
      empresaId: a.id,
      nome: 'STG Cilindro A',
      unidade: 'un',
      precoUnit: 18,
      precoVenda: 60,
      estoqueMinimo: 5,
      quantidadeAtual: 4,
    },
  });

  const servico = (empresaId, dados) =>
    db().servico.create({
      data: {
        empresaId,
        local: dados.local,
        descricao: dados.descricao,
        valorCobrado: dados.valorCobrado,
        valorMaterial: dados.valorMaterial ?? 0,
        valorLiquido: dados.valorCobrado - (dados.valorMaterial ?? 0),
        comissaoGerada: dados.comissao ?? 0,
        status: dados.status,
        tecnicoId: dados.tecnicoId,
        clienteNome: dados.clienteNome,
        clienteTelefone: dados.clienteTelefone,
        msgOriginal: 'CADASTRO_FIXTURE_STAGING', // origem legível no banco
        remetenteWpp: 'seed-staging',
        criadoEm: dados.criadoEm ?? agora,
        aprovadoEm: dados.aprovadoEm ?? null,
        ...(dados.materiais ? { materiais: { create: dados.materiais } } : {}),
      },
    });

  // Histórico (financeiro/leitura) — ativo, com material já consumido.
  const ativoA = await servico(a.id, {
    local: 'STG — Rua Alfa, 100',
    descricao: 'Troca de fechadura (fixture staging)',
    valorCobrado: 380,
    valorMaterial: 120,
    comissao: 52,
    status: 'ativo',
    tecnicoId: tecnicaA.id,
    clienteNome: 'Cliente Fixture A1',
    clienteTelefone: '5511940000001',
    criadoEm: ontem,
    aprovadoEm: ontem,
    materiais: [{ materialId: fechaduraA.id, quantidade: 1 }],
  });
  await db().movimentacaoEstoque.create({
    data: {
      materialId: fechaduraA.id,
      tipo: 'saida',
      quantidade: 1,
      saldoApos: 10,
      origem: 'servico',
      servicoId: ativoA.id,
      observacao: 'FIXTURE STAGING: consumo histórico',
    },
  });

  // O caso que NÃO pode nascer pronto: PENDENTE com material e estoque INTACTO —
  // a aprovação (write real + baixa + comissão) acontece NO produto, na jornada MANAGER.
  await servico(a.id, {
    local: 'STG — Travessa Beta, 12',
    descricao: 'Instalação de cilindro — AGUARDA APROVAÇÃO (fixture staging)',
    valorCobrado: 260,
    valorMaterial: 60,
    comissao: 40,
    status: 'pendente',
    tecnicoId: tecnicaA.id,
    clienteNome: 'Cliente Fixture A2',
    clienteTelefone: '5511940000002',
    materiais: [{ materialId: cilindroA.id, quantidade: 1 }],
  });

  // Ponto de ontem fechado (relatório/EMPLOYEE read; a batida de HOJE é jornada real).
  const dia = new Date(Date.UTC(ontem.getUTCFullYear(), ontem.getUTCMonth(), ontem.getUTCDate()));
  const em = (h, m) => new Date(dia.getTime() + (h * 60 + m) * 60 * 1000);
  const registro = await db().registroPonto.create({
    data: {
      empresaId: a.id,
      tecnicoId: tecnicaA.id,
      data: dia,
      entradaEm: em(8, 0),
      almocoSaidaEm: em(12, 0),
      almocoVoltaEm: em(13, 0),
      saidaEm: em(17, 30),
      totalMinutos: 510,
      horaExtraMinutos: 30,
    },
  });
  for (const [tipo, h, m] of [
    ['entrada', 8, 0],
    ['almoco_saida', 12, 0],
    ['almoco_volta', 13, 0],
    ['saida', 17, 30],
  ]) {
    await db().batidaPonto.create({ data: { registroId: registro.id, tipo, em: em(h, m) } });
  }

  // ── Empresa B (alvo do TENANT-NEGATIVE: A não lê/muta B) ───────────────────
  const b = await criarTenant({ slug: SLUG_B, nome: 'STG Fixture — Empresa B', aprovacao: false });
  await criarUsuario(b.id, 'Dono B Staging', 'dono.b.stg', 'dono', true);
  const tecnicoB = await db().tecnico.create({
    data: {
      empresaId: b.id,
      nome: 'Técnico B Staging',
      telefone: '5511930000002',
      telefoneDisplay: '5511930000002',
      comissao: 15,
      ativo: true,
    },
  });
  await servico(b.id, {
    local: 'STG — Av. Gama, 900',
    descricao: 'Serviço do tenant B (alvo do negative)',
    valorCobrado: 200,
    comissao: 30,
    status: 'ativo',
    tecnicoId: tecnicoB.id,
    clienteNome: 'Cliente Fixture B1',
    clienteTelefone: '5511940000003',
    criadoEm: ontem,
    aprovadoEm: ontem,
  });

  return { a, b };
}

async function principal() {
  const eleg = ambienteElegivelStaging(process.env.DATABASE_URL);

  if (modo === '--check') {
    console.log('AdmAi — seed STAGING (fixtures A/B)  [STG-APP-STAGING-01]');
    info(`ambiente elegível : ${eleg.elegivel ? `sim (ref ${eleg.ref})` : `NÃO — ${eleg.motivo}`}`);
    if (eleg.elegivel) {
      const ea = await db().empresa.findUnique({ where: { slug: SLUG_A } });
      const eb = await db().empresa.findUnique({ where: { slug: SLUG_B } });
      info(`tenant A (${SLUG_A}): ${ea ? `presente (id ${ea.id})` : 'ausente'}`);
      info(`tenant B (${SLUG_B}): ${eb ? `presente (id ${eb.id})` : 'ausente'}`);
    }
    info(
      'contas: dono.a.stg · gestor.a.stg · func.a.stg · dono.b.stg (senha em SEED_STAGING_SENHA)'
    );
    return 0;
  }

  // Intenção explícita + alvo provado — os dois, independentes (mesma regra do seed-demo).
  if (process.env.ALLOW_STAGING_SEED !== 'true') {
    abortar(
      `${modo} escreve no admai-staging e exige intenção explícita.\n` +
        '   Rode com:  ALLOW_STAGING_SEED=true node --env-file=.env.staging scripts/seed-staging.mjs ' +
        modo
    );
  }
  if (!eleg.elegivel) {
    abortar(`Recusando ${modo}: ${eleg.motivo}.\n   Nenhum dado foi escrito.`);
  }

  if (modo === '--reset') {
    const rA = await removerTenant(SLUG_A);
    const rB = await removerTenant(SLUG_B);
    ok(
      `fixtures removidas — A: ${rA ? 'removida' : 'ausente'} · B: ${rB ? 'removida' : 'ausente'}`
    );
    return 0;
  }

  const senha = process.env.SEED_STAGING_SENHA;
  if (!senha || senha.length < 8) {
    abortar(
      'Defina SEED_STAGING_SENHA (mínimo 8 caracteres) — sintética, nunca impressa/versionada.'
    );
  }

  const { a, b } = await semear(senha);
  ok(`fixtures staging semeadas (A id ${a.id} · B id ${b.id})`);
  info('contas: dono.a.stg · gestor.a.stg · func.a.stg (Empresa A) · dono.b.stg (Empresa B)');
  info('SEED_STATE != RUNTIME_ACCEPTANCE — o PENDENTE da Empresa A é aprovado NO produto.');
  return 0;
}

/* Só executa como script; importado (pelos testes) apenas exporta. */
if (process.argv[1] && process.argv[1].endsWith('seed-staging.mjs')) {
  principal()
    .then((c) =>
      db()
        .$disconnect()
        .then(() => process.exit(c))
    )
    .catch(async (e) => {
      await db().$disconnect();
      abortar(`falhou: ${e.message}`);
    });
}
