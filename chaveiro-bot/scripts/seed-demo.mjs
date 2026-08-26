#!/usr/bin/env node
// =============================================================================
// seed-demo.mjs — dataset DEMO determinístico para observar o AdmAi em runtime.
//
// POR QUE EXISTE
//   O produto pode estar inteiramente correto e mesmo assim ser inobservável. Foi o que
//   aconteceu: com 1 usuário (dono), 0 técnicos, 0 materiais e 0 serviços, toda tela mostra
//   R$ 0,00, o fluxo do funcionário é inalcançável, e features implementadas e testadas
//   parecem ausentes. `CODE_EXISTS != USER_VISIBLE`.
//
//   Este script cria o ESTADO INICIAL mínimo para que cada capacidade possa ser observada.
//
// A REGRA QUE GOVERNA ESTE ARQUIVO
//   `SEED_STATE != RUNTIME_ACCEPTANCE`.
//
//   O seed NÃO é evidência de que uma feature funciona. Ele prepara a situação; a transição
//   que se quer provar tem de ser executada PELO PRODUTO. Semear um serviço já aprovado com
//   estoque já baixado provaria apenas que este script sabe escrever no banco.
//
//   Por isso o dataset tem um serviço PENDENTE com material declarado e estoque INTACTO: a
//   aprovação, a baixa e a comissão são para acontecer na tela, e é lá que se verifica.
//
// FAIL-CLOSED, no mesmo padrão de `provision-bucket-documentos.mjs`
//   Escrever dados fictícios no banco errado é irreversível na prática. Então: exige
//   `ALLOW_DEMO_SEED=true`, recusa `NODE_ENV=production`, e recusa qualquer `DATABASE_URL`
//   que não seja reconhecidamente de desenvolvimento ou teste. Na dúvida, aborta.
//
// Uso:
//   node --env-file=.env scripts/seed-demo.mjs --check
//   ALLOW_DEMO_SEED=true node --env-file=.env scripts/seed-demo.mjs --seed
//   ALLOW_DEMO_SEED=true node --env-file=.env scripts/seed-demo.mjs --reset
//
// Modos:
//   --check  (default) SOMENTE LEITURA: diz o que existe e se o ambiente é elegível.
//   --seed   idempotente: recria o tenant DEMO do zero e o repovoa. Não toca em outros tenants.
//   --reset  remove o tenant DEMO e nada mais.
//
// Credenciais: locais e descartáveis, passadas por `DEMO_SENHA` (sem default). Nenhuma senha
// é impressa, versionada ou reaproveitada de outro ambiente.
// =============================================================================
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

/** Marca única do tenant demo. Tudo criado aqui pende deste slug — é o que torna o reset seguro. */
const SLUG_DEMO = 'demo-admai-runtime';
const NOME_DEMO = 'DEMO — Chaveiro Runtime';

function abortar(msg, code = 1) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(code);
}
const ok = (m) => console.log(`✅ ${m}`);
const info = (m) => console.log(`   ${m}`);

/**
 * Decide se a base é elegível para receber dados fictícios.
 *
 * Lista de PERMISSÃO, não de negação: procurar por "prod" no host deixaria passar qualquer
 * banco cujo nome não contenha a palavra. Aqui só passa o que é reconhecidamente local.
 * Nome de banco que não termine em `_dev`/`_test`, ou host que não seja loopback, aborta.
 */
export function ambienteElegivel(databaseUrl, nodeEnv) {
  if (nodeEnv === 'production') {
    return { elegivel: false, motivo: 'NODE_ENV=production' };
  }
  if (!databaseUrl) return { elegivel: false, motivo: 'DATABASE_URL ausente' };

  let u;
  try {
    u = new URL(databaseUrl);
  } catch {
    return { elegivel: false, motivo: 'DATABASE_URL não é uma URL válida' };
  }

  const hostLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname);
  if (!hostLocal) {
    return { elegivel: false, motivo: `host "${u.hostname}" não é loopback` };
  }

  const banco = u.pathname.replace(/^\//, '');
  if (!/_(dev|test)$/.test(banco)) {
    return {
      elegivel: false,
      motivo: `banco "${banco}" não termina em _dev nem _test`,
    };
  }
  return { elegivel: true, motivo: null, banco };
}

/**
 * O dataset, declarado como DADO e não como sequência de `create`.
 *
 * Cada entrada diz QUAL CAPACIDADE ela existe para permitir observar. Sem isso um seed vira
 * um monte de linhas plausíveis, e ninguém sabe depois se pode mexer numa sem quebrar a
 * observação de outra coisa.
 */
export const COBERTURA = Object.freeze([
  { fixture: 'dono.demo', prova: 'RBAC: acesso total, configuração da empresa, financeiro' },
  { fixture: 'gestor.demo', prova: 'RBAC: aprova e rejeita, vê equipe, não administra empresa' },
  {
    fixture: 'ana.tecnica + Técnico',
    prova: 'fluxo do funcionário: ponto, meus serviços, registro',
  },
  {
    fixture: 'Assinatura em trial (14 dias)',
    prova: 'que o produto ABRE — sem ela requireAssinaturaAtiva devolve 402 em tudo',
  },
  {
    fixture: 'aprovacaoServico = ON',
    prova: 'serviço do funcionário nasce pendente; seletor de material aparece',
  },
  { fixture: 'Material com saldo normal', prova: 'catálogo e movimentação de entrada' },
  { fixture: 'Material abaixo do mínimo', prova: 'alerta de estoque baixo no dashboard' },
  { fixture: 'Material já consumido', prova: 'movimentação de saída rastreável, com saldoApos' },
  { fixture: 'Material nunca usado', prova: 'contraprova: nem todo material aparece em serviço' },
  {
    fixture: 'Serviço ATIVO com material',
    prova: 'financeiro, comissão e custo de material no dashboard',
  },
  {
    fixture: 'Serviço EM_ANDAMENTO',
    prova: 'o "serviço atual" do técnico; e que ele fica FORA do agregado enquanto corre',
  },
  { fixture: 'Serviço rejeitado', prova: 'que rejeitado NÃO entra no agregado financeiro' },
  {
    fixture: 'Serviço PENDENTE com material e estoque intacto',
    prova: 'a aprovação a ser feita NO PRODUTO: status, baixa e comissão',
  },
  { fixture: 'Batidas de ponto do dia anterior', prova: 'relatório de ponto e banco de horas' },
]);

/* Cliente PREGUIÇOSO. Construir no escopo do módulo faria a simples importação deste arquivo
   abrir conexão — e os testes do guard, que só querem `ambienteElegivel`, quebravam antes de
   rodar um caso sequer. Efeito colateral em nível de módulo torna o arquivo intestável. */
let _prisma = null;
/* Prisma 7 tira a conexão do schema e a coloca no driver adapter — construir sem ele estoura
   `PrismaClientOptions` vazio. Mesma montagem de `src/db/prisma.js:10`, com a diferença de que
   aqui a URL é lida DEPOIS do guard, nunca antes. */
const db = () =>
  (_prisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }));

const modo = process.argv.find((a) => ['--check', '--seed', '--reset'].includes(a)) || '--check';

async function empresaDemo() {
  return db().empresa.findUnique({ where: { slug: SLUG_DEMO } });
}

/**
 * Remove o tenant demo inteiro, em ordem explícita de dependência.
 *
 * A primeira versão apagava só a `Empresa` e contava com cascata — e não há: as relações com
 * `Empresa` no schema não declaram `onDelete`, então o banco recusa com
 * `Foreign key constraint violated on the constraint: Usuario_empresaId_fkey`.
 *
 * A ordem abaixo desce dos filhos para os pais. Escopo por tenant em cada passo, nunca `TRUNCATE`:
 * este banco também guarda os dados de desenvolvimento do usuário, e apagá-los para recriar o
 * demo seria destruir o que não é meu.
 *
 * `deleteMany` de tabela que o seed nunca preencheu é no-op barato — mas precisa estar aqui,
 * porque a verificação de runtime CRIA coisas (serviço aprovado gera movimentação, login gera
 * sessão) e sem elas o `--reset` quebraria depois da primeira observação.
 */
async function remover() {
  const e = await empresaDemo();
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
  /* Recria do zero em vez de fazer upsert campo a campo: idempotência por reconstrução é
     verificável de olho, e um upsert parcial deixaria resíduo de uma versão anterior do
     dataset convivendo com a nova — que é justamente o tipo de estado que engana observação. */
  await remover();

  const hash = await bcrypt.hash(senha, 10);
  const agora = new Date();
  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

  const empresa = await db().empresa.create({
    data: { nome: NOME_DEMO, slug: SLUG_DEMO, aprovacaoServico: true },
  });

  /* ASSINATURA EM TRIAL — descoberto observando o runtime, nao lendo o schema.
     A primeira versao criava a empresa direto pelo Prisma e pulava o cadastro, que e onde o
     trial de 14 dias nasce. Resultado: `requireAssinaturaAtiva` respondia 402 em TODA rota de
     produto e o painel mostrava "Nao foi possivel carregar os dados" em cima de um dashboard
     vazio. O paywall estava certo; o seed e que criava um tenant comercialmente morto.
     Vale como prova do enforcement: sem esta linha, nada do produto abre. */
  await db().assinatura.create({
    data: {
      empresaId: empresa.id,
      status: 'trialing',
      trialFimEm: new Date(agora.getTime() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const usuario = (nome, username, papel, admin = false) =>
    db().usuario.create({
      data: {
        empresaId: empresa.id,
        nome,
        username,
        email: `${username}@demo.local`,
        senhaHash: hash,
        papel,
        admin,
        ativo: true,
        emailVerificado: true,
      },
    });

  await usuario('Dona Demo', 'dono.demo', 'dono', true);
  await usuario('Gestor Demo', 'gestor.demo', 'gestor');
  const ana = await usuario('Ana Técnica', 'ana.tecnica', 'funcionario');

  const tecnicoAna = await db().tecnico.create({
    data: {
      empresaId: empresa.id,
      nome: 'Ana Técnica',
      telefone: '5511900000001',
      telefoneDisplay: '5511900000001',
      comissao: 20,
      ativo: true,
      usuarioId: ana.id,
      modalidade: 'clt',
    },
  });
  const tecnicoBruno = await db().tecnico.create({
    data: {
      empresaId: empresa.id,
      nome: 'Bruno Campo',
      telefone: '5511900000002',
      telefoneDisplay: '5511900000002',
      comissao: 15,
      ativo: true,
    },
  });

  const material = (nome, unidade, precoUnit, precoVenda, estoqueMinimo, quantidadeAtual) =>
    db().material.create({
      data: {
        empresaId: empresa.id,
        nome,
        unidade,
        precoUnit,
        precoVenda,
        estoqueMinimo,
        quantidadeAtual,
      },
    });

  const fechadura = await material('Fechadura Tetra', 'un', 45, 120, 3, 12);
  const cilindro = await material('Cilindro Simples', 'un', 18, 60, 5, 2); // abaixo do mínimo
  const chaveCodificada = await material('Chave Codificada', 'un', 90, 240, 2, 8);
  await material('Mola Aérea', 'un', 210, 480, 1, 4); // nunca usado

  const servico = (dados) =>
    db().servico.create({
      data: {
        empresaId: empresa.id,
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
        /* `CADASTRO_DEMO` deixa a origem legível no banco: quem olhar uma linha destas sabe
           que veio do seed e não de um WhatsApp real. */
        msgOriginal: 'CADASTRO_DEMO',
        remetenteWpp: 'seed-demo',
        criadoEm: dados.criadoEm ?? agora,
        aprovadoEm: dados.aprovadoEm ?? null,
        ...(dados.materiais ? { materiais: { create: dados.materiais } } : {}),
      },
    });

  // Concluído com material: alimenta financeiro, comissão e custo de material.
  const concluido = await servico({
    local: 'Rua das Acácias, 240',
    descricao: 'Troca de fechadura tetra na porta principal',
    valorCobrado: 380,
    valorMaterial: 120,
    comissao: 52,
    /* `ativo` e não `concluido`: a máquina de estados é `ativo → em_andamento → ativo`, e
       concluir DEVOLVE o serviço para `ativo`. `concluido` não existe no produto — a primeira
       versão deste seed o inventou, os serviços sumiram do dashboard, e por um momento pareceu
       bug de receita nas métricas. Era o seed criando um estado inalcançável. */
    status: 'ativo',
    tecnicoId: tecnicoAna.id,
    clienteNome: 'Marcos Ribeiro',
    clienteTelefone: '5511911110001',
    criadoEm: ontem,
    aprovadoEm: ontem,
    materiais: [{ materialId: fechadura.id, quantidade: 1 }],
  });

  /* A saída de estoque DESTE serviço é semeada porque ele representa história já ocorrida.
     O serviço PENDENTE lá embaixo é que fica com o estoque intacto de propósito. */
  await db().movimentacaoEstoque.create({
    data: {
      materialId: fechadura.id,
      tipo: 'saida',
      quantidade: 1,
      saldoApos: 12,
      origem: 'servico',
      servicoId: concluido.id,
      observacao: 'DEMO: consumo histórico',
    },
  });

  await servico({
    local: 'Av. Paulista, 1500 — sala 42',
    descricao: 'Abertura de porta e ajuste de dobradiça',
    valorCobrado: 220,
    comissao: 33,
    /* Em andamento: é o estado transitório que o técnico vê como "serviço atual". */
    status: 'em_andamento',
    tecnicoId: tecnicoBruno.id,
    clienteNome: 'Condomínio Paulista',
    clienteTelefone: '5511911110002',
  });

  await servico({
    local: 'Rua do Comércio, 88',
    descricao: 'Orçamento recusado pelo gestor',
    valorCobrado: 900,
    comissao: 180,
    status: 'rejeitado',
    tecnicoId: tecnicoAna.id,
    clienteNome: 'Loja Central',
    clienteTelefone: '5511911110003',
    criadoEm: ontem,
    aprovadoEm: ontem,
  });

  /* O CASO QUE NÃO PODE SER SEMEADO PRONTO.
     Pendente, com material declarado, estoque INTACTO e nenhuma movimentação de saída. A
     aprovação acontece na tela; é lá que se observa o status mudar, o saldo de `cilindro` cair
     de 2 para 1, a movimentação nascer com `servicoId`, e a comissão aparecer no financeiro. */
  await servico({
    local: 'Travessa São Jorge, 12',
    descricao: 'Instalação de cilindro — AGUARDA APROVAÇÃO DO GESTOR',
    valorCobrado: 260,
    valorMaterial: 60,
    comissao: 40,
    status: 'pendente',
    tecnicoId: tecnicoAna.id,
    clienteNome: 'Helena Duarte',
    clienteTelefone: '5511911110004',
    materiais: [{ materialId: cilindro.id, quantidade: 1 }],
  });

  await servico({
    local: 'Rua Piauí, 300',
    descricao: 'Cópia de chave codificada',
    valorCobrado: 310,
    valorMaterial: 90,
    comissao: 44,
    status: 'ativo',
    tecnicoId: tecnicoBruno.id,
    clienteNome: 'Auto Center Piauí',
    clienteTelefone: '5511911110005',
    criadoEm: ontem,
    aprovadoEm: ontem,
    materiais: [{ materialId: chaveCodificada.id, quantidade: 1 }],
  });

  // Ponto do dia anterior, fechado: dá o que conferir no relatório e no banco de horas.
  const dia = new Date(Date.UTC(ontem.getUTCFullYear(), ontem.getUTCMonth(), ontem.getUTCDate()));
  const em = (h, m) => new Date(dia.getTime() + (h * 60 + m) * 60 * 1000);
  const registro = await db().registroPonto.create({
    data: {
      empresaId: empresa.id,
      tecnicoId: tecnicoAna.id,
      data: dia,
      entradaEm: em(8, 0),
      almocoSaidaEm: em(12, 0),
      almocoVoltaEm: em(13, 0),
      saidaEm: em(18, 30),
      totalMinutos: 570,
      horaExtraMinutos: 90,
    },
  });
  for (const [tipo, hora, minuto] of [
    ['entrada', 8, 0],
    ['almoco_saida', 12, 0],
    ['almoco_volta', 13, 0],
    ['saida', 18, 30],
  ]) {
    await db().batidaPonto.create({
      data: { registroId: registro.id, tipo, em: em(hora, minuto) },
    });
  }

  return empresa;
}

async function principal() {
  const url = process.env.DATABASE_URL;
  const eleg = ambienteElegivel(url, process.env.NODE_ENV);

  if (modo === '--check') {
    const e = await empresaDemo();
    console.log('AdmAi — seed demo  [F0-AMBIENTE]');
    info(`ambiente elegível : ${eleg.elegivel ? `sim (${eleg.banco})` : `NÃO — ${eleg.motivo}`}`);
    info(`tenant demo       : ${e ? `presente (id ${e.id})` : 'ausente'}`);
    info(`cobertura         : ${COBERTURA.length} fixtures declaradas`);
    for (const c of COBERTURA) info(`  · ${c.fixture} → ${c.prova}`);
    return e ? 0 : 0;
  }

  /* Os dois guards são independentes de propósito: a variável mostra INTENÇÃO, a checagem de
     ambiente mostra ALVO. Exigir só a intenção deixaria um `ALLOW_DEMO_SEED=true` esquecido no
     shell semear produção; exigir só o alvo dispensaria qualquer ato deliberado. */
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    abortar(
      `${modo} escreve no banco e exige intenção explícita.\n` +
        '   Rode com:  ALLOW_DEMO_SEED=true node --env-file=.env scripts/seed-demo.mjs ' +
        modo
    );
  }
  if (!eleg.elegivel) {
    abortar(
      `Recusando ${modo}: ${eleg.motivo}.\n` +
        '   Este script só opera em banco local terminado em _dev ou _test.\n' +
        '   Nenhum dado foi escrito.'
    );
  }

  if (modo === '--reset') {
    const havia = await remover();
    ok(havia ? `tenant demo removido de ${eleg.banco}` : 'nada a remover');
    return 0;
  }

  const senha = process.env.DEMO_SENHA;
  if (!senha || senha.length < 8) {
    abortar(
      'Defina DEMO_SENHA (mínimo 8 caracteres) para as contas demo.\n' +
        '   Use uma senha LOCAL e descartável; ela não é impressa nem versionada.'
    );
  }

  const empresa = await semear(senha);
  ok(`tenant demo semeado em ${eleg.banco} (empresa id ${empresa.id})`);
  info('contas: dono.demo · gestor.demo · ana.tecnica   (senha em DEMO_SENHA)');
  info(`cobertura: ${COBERTURA.length} fixtures — rode --check para a lista`);
  info('');
  info('SEED_STATE != RUNTIME_ACCEPTANCE — o serviço PENDENTE existe para ser aprovado');
  info('NO PRODUTO. Aprovar por aqui não prova nada.');
  return 0;
}

/* Só executa quando chamado como script. Importado (pelos testes), exporta e não roda. */
if (process.argv[1] && process.argv[1].endsWith('seed-demo.mjs')) {
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
