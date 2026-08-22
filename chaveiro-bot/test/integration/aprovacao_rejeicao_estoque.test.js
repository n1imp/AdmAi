/**
 * Teste de integração: aprovação, rejeição e baixa de estoque no fluxo real.
 * [GAP-APV-01] [GAP-EST-01]
 *
 * O QUE ESTE ARQUIVO DECIDE
 *   Duas coisas estavam declaradas como funcionando e nenhuma tinha controle POSITIVO:
 *
 *   `/servicos/:id/rejeitar` só aparecia em `idor_escrita_cross_tenant`, provando que a empresa B
 *   não rejeita serviço da A. Um endpoint que recusasse TODA rejeição passaria nesse teste — negativo
 *   sem positivo não prova capacidade, prova só recusa.
 *
 *   A baixa de estoque só tinha prova de UNIDADE, com o client do Prisma mockado. Mock não decrementa
 *   linha nenhuma: provava a função, não o encadeamento rota -> transação -> banco.
 *
 * O QUE APARECEU AO ESCREVER, e era maior que a lacuna de teste  [GAP-EST-02]
 *   O ramo de baixa na APROVAÇÃO (`servicos.js:269`) era inalcançável pela API. Ele exige serviço
 *   `pendente` COM materiais, e essa combinação não existia:
 *     · funcionário registra  -> podia virar `pendente`, mas `materiais` era forçado a `[]`;
 *     · gestor/dono registra  -> podia mandar material, mas o status nascia `ativo`;
 *     · `/aprovar` não lê corpo — não havia como anexar material na aprovação.
 *
 *   O comentário da própria rota mandava "registre-os na aprovação", e a aprovação não oferecia esse
 *   caminho. O efeito era o que aquele comentário dizia querer evitar: serviço do funcionário
 *   consome material e o estoque não se mexe, em silêncio.
 *
 *   A suíte de UNIDADE passava o tempo todo, porque testa a função — e a função está certa. Errado
 *   era o caminho que deveria chamá-la. Só integração distingue as duas coisas.
 *
 * O QUE MUDOU, e as duas restrições que não eram minhas  [D-EST-02]
 *   O funcionário passa a DECLARAR material; quem BAIXA continua sendo a aprovação. Duas condições
 *   vieram do Codex Decisor e fecham furos que a minha proposta abria:
 *
 *   1. Só quando `aprovacaoServico` está ligada. Sem ela o serviço nasce `ativo` e a baixa sairia
 *      por ação do próprio funcionário, sem gestor no caminho — a "correção" reduziria proteção.
 *   2. A transição `pendente -> ativo` virou reivindicação atômica. Tornar o ramo alcançável expõe
 *      uma corrida que já existia: duas aprovações concorrentes dariam duas baixas do mesmo material.
 *
 *   NÃO fecha o fluxo do painel: `NovoServicoFuncionario.jsx` não envia `materiais`. Isto fecha a
 *   alcançabilidade pela API, que é o escopo autorizado.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma } from './helpers.js';

let app;

beforeAll(() => {
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Cria material com saldo conhecido. O saldo tem de ser conhecido: sem isso não há o que comparar.
 *
 * O saldo NÃO entra no cadastro. `POST /materiais` não aceita `quantidadeAtual` — de propósito: o
 * saldo é consequência das movimentações, não um número que alguém digita. A primeira versão deste
 * arquivo mandava `quantidadeAtual` no cadastro, ele era ignorado em silêncio pelo Zod, e os
 * materiais nasciam com 0. O fixture é que estava errado, não a rota.
 */
async function criarMaterial(token, { nome, quantidadeAtual }) {
  const res = await request(app)
    .post('/api/materiais')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, unidade: 'un', precoUnit: 10 });
  expect(res.status).toBe(201);

  const entrada = await request(app)
    .post(`/api/materiais/${res.body.id}/movimentacao`)
    .set('Authorization', `Bearer ${token}`)
    .send({ tipo: 'entrada', quantidade: quantidadeAtual, observacao: 'saldo inicial do teste' });
  expect(entrada.status).toBe(201);
  expect(entrada.body.quantidadeAtual).toBe(quantidadeAtual);

  return res.body;
}

const SERVICO_BASE = {
  local: 'Rua de Teste, 100',
  descricao: 'Abertura de porta residencial',
  valorCobrado: 200,
  valorMaterial: 0,
};

/** Liga a exigência de aprovação: sem isso o serviço do funcionário já nasce `ativo`. */
async function exigirAprovacao(empresaId) {
  await prisma.empresa.update({ where: { id: empresaId }, data: { aprovacaoServico: true } });
}

describe('Baixa de estoque pelo fluxo real [GAP-EST-01]', () => {
  it('CONTROLE POSITIVO: registrar serviço com material DECREMENTA o saldo no banco', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'E1');
    const material = await criarMaterial(admin.token, { nome: 'Fechadura', quantidadeAtual: 10 });

    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        ...SERVICO_BASE,
        tecnico: 'Tecnico Um',
        valorMaterial: 30,
        materiais: [{ materialId: material.id, quantidade: 3 }],
      });

    expect(res.status).toBe(201);
    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    expect(depois.quantidadeAtual).toBe(7);
  });

  it('a movimentação fica RASTREÁVEL: aparece na listagem do material', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'E2');
    const material = await criarMaterial(admin.token, { nome: 'Cilindro', quantidadeAtual: 8 });

    await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        ...SERVICO_BASE,
        tecnico: 'Tecnico Dois',
        valorMaterial: 20,
        materiais: [{ materialId: material.id, quantidade: 2 }],
      });

    const lista = await request(app)
      .get(`/api/materiais/${material.id}/movimentacoes`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(lista.status).toBe(200);
    const movs = lista.body.movimentacoes ?? lista.body;
    expect(Array.isArray(movs)).toBe(true);

    /* Procura a BAIXA, não "alguma movimentação": a entrada de saldo inicial já garantiria uma
       linha, e aceitar qualquer linha faria o teste passar mesmo se a baixa não fosse registrada.
       Decrementar sem deixar rastro satisfaria a metade "baixa automática" e falharia a metade
       "movimentação rastreável" — e é a segunda que o gestor usa para auditar divergência. */
    const baixa = movs.find((m) => m.tipo === 'saida');
    expect(baixa).toBeTruthy();
    expect(baixa.quantidade).toBe(2);
    expect(baixa.saldoApos).toBe(6);
    /* A movimentação aponta para o serviço que a causou — sem isso o gestor vê o saldo cair e não
       consegue dizer por quê. */
    expect(baixa.servicoId).toBeTruthy();
  });

  it('o vínculo serviço-material é gravado, não só o saldo', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'E3');
    const material = await criarMaterial(admin.token, { nome: 'Chave', quantidadeAtual: 5 });

    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        ...SERVICO_BASE,
        tecnico: 'Tecnico Tres',
        valorMaterial: 10,
        materiais: [{ materialId: material.id, quantidade: 1 }],
      });

    const vinculos = await prisma.servicoMaterial.findMany({ where: { servicoId: res.body.id } });
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0].materialId).toBe(material.id);
  });

  it('material de OUTRA empresa não é aceito e não movimenta nada', async () => {
    const a = await criarEmpresaComAdmin(request, app, 'E4');
    const b = await criarEmpresaComAdmin(request, app, 'E5');
    const materialDaB = await criarMaterial(b.token, { nome: 'Da Empresa B', quantidadeAtual: 9 });

    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        ...SERVICO_BASE,
        tecnico: 'Tecnico A',
        valorMaterial: 10,
        materiais: [{ materialId: materialDaB.id, quantidade: 1 }],
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const depois = await prisma.material.findUnique({ where: { id: materialDaB.id } });
    expect(depois.quantidadeAtual).toBe(9);
  });
});

describe('Aprovação e rejeição pelo gestor [GAP-APV-01]', () => {
  it('CONTROLE POSITIVO: gestor APROVA serviço pendente e o registro guarda quem aprovou', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'A1');
    await exigirAprovacao(admin.empresaId);
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func Aprov' });

    const criado = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send(SERVICO_BASE);
    expect(criado.status).toBe(201);

    const antes = await prisma.servico.findUnique({ where: { id: criado.body.id } });
    expect(antes.status).toBe('pendente');

    const res = await request(app)
      .post(`/api/servicos/${criado.body.id}/aprovar`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    const depois = await prisma.servico.findUnique({ where: { id: criado.body.id } });
    expect(depois.status).toBe('ativo');
    expect(depois.aprovadoPor).toBe(admin.userId);
    expect(depois.aprovadoEm).toBeInstanceOf(Date);
  });

  it('CONTROLE POSITIVO: gestor REJEITA serviço pendente e o registro guarda quem rejeitou', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'A2');
    await exigirAprovacao(admin.empresaId);
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func Rej' });

    const criado = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send(SERVICO_BASE);
    expect(criado.status).toBe(201);

    const res = await request(app)
      .post(`/api/servicos/${criado.body.id}/rejeitar`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejeitado');
    const depois = await prisma.servico.findUnique({ where: { id: criado.body.id } });
    expect(depois.status).toBe('rejeitado');
    expect(depois.aprovadoPor).toBe(admin.userId);
  });

  it('rejeitar duas vezes devolve 409, e id inexistente devolve 404 — a rota distingue os casos', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'A3');
    await exigirAprovacao(admin.empresaId);
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func 409' });

    const criado = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send(SERVICO_BASE);

    const primeira = await request(app)
      .post(`/api/servicos/${criado.body.id}/rejeitar`)
      .set('Authorization', `Bearer ${admin.token}`);
    const segunda = await request(app)
      .post(`/api/servicos/${criado.body.id}/rejeitar`)
      .set('Authorization', `Bearer ${admin.token}`);
    const inexistente = await request(app)
      .post('/api/servicos/99999999/rejeitar')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(primeira.status).toBe(200);
    /* 409 e 404 significam coisas diferentes para o painel: "outra pessoa já resolveu" contra
       "esse serviço não existe". Colapsar os dois em 404 já foi corrigido; isto impede voltar. */
    expect(segunda.status).toBe(409);
    expect(inexistente.status).toBe(404);
  });

  it('serviço REJEITADO não pode ser aprovado depois', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'A4');
    await exigirAprovacao(admin.empresaId);
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func Seq' });

    const criado = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send(SERVICO_BASE);
    await request(app)
      .post(`/api/servicos/${criado.body.id}/rejeitar`)
      .set('Authorization', `Bearer ${admin.token}`);

    const aprovar = await request(app)
      .post(`/api/servicos/${criado.body.id}/aprovar`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(aprovar.status).toBe(409);
    const depois = await prisma.servico.findUnique({ where: { id: criado.body.id } });
    expect(depois.status).toBe('rejeitado');
  });
});

describe('Baixa na aprovação: o caminho do funcionário [GAP-EST-02] [D-EST-02]', () => {
  it('APROVAÇÃO LIGADA: funcionário DECLARA material, serviço fica pendente e o estoque NÃO se mexe ainda', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'G1');
    await exigirAprovacao(admin.empresaId);
    const material = await criarMaterial(admin.token, { nome: 'Material G1', quantidadeAtual: 6 });
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func Mat' });

    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send({
        ...SERVICO_BASE,
        valorMaterial: 20,
        materiais: [{ materialId: material.id, quantidade: 2 }],
      });

    expect(res.status).toBe(201);
    const servico = await prisma.servico.findUnique({
      where: { id: res.body.id },
      include: { materiais: true },
    });
    expect(servico.status).toBe('pendente');
    expect(servico.materiais).toHaveLength(1);

    /* A METADE QUE IMPORTA: declarar não é baixar. Se o estoque caísse aqui, o funcionário estaria
       movimentando estoque sozinho e a aprovação viraria enfeite. */
    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    expect(depois.quantidadeAtual).toBe(6);
    const movs = await prisma.movimentacaoEstoque.findMany({
      where: { materialId: material.id, tipo: 'saida' },
    });
    expect(movs).toHaveLength(0);
  });

  it('a APROVAÇÃO dá a baixa: uma única saída, com saldoApos e servicoId', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'G2');
    await exigirAprovacao(admin.empresaId);
    const material = await criarMaterial(admin.token, { nome: 'Material G2', quantidadeAtual: 12 });
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func Baixa' });

    const criado = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send({
        ...SERVICO_BASE,
        valorMaterial: 40,
        materiais: [{ materialId: material.id, quantidade: 4 }],
      });
    expect(criado.status).toBe(201);

    const aprovacao = await request(app)
      .post(`/api/servicos/${criado.body.id}/aprovar`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(aprovacao.status).toBe(200);

    const servico = await prisma.servico.findUnique({
      where: { id: criado.body.id },
      include: { materiais: true },
    });
    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    const saidas = await prisma.movimentacaoEstoque.findMany({
      where: { materialId: material.id, tipo: 'saida' },
    });

    expect(servico.status).toBe('ativo');
    /* O vínculo declarado no registro sobrevive à aprovação — a baixa não pode consumi-lo. */
    expect(servico.materiais).toHaveLength(1);
    expect(depois.quantidadeAtual).toBe(8);
    expect(saidas).toHaveLength(1);
    expect(saidas[0].saldoApos).toBe(8);
    expect(saidas[0].servicoId).toBe(criado.body.id);
  });

  it('REJEITAR serviço pendente com material não baixa nada', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'G3');
    await exigirAprovacao(admin.empresaId);
    const material = await criarMaterial(admin.token, { nome: 'Material G3', quantidadeAtual: 7 });
    const func = await criarFuncionarioComAcesso(request, app, admin.token, {
      nome: 'Func Rej Mat',
    });

    const criado = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send({
        ...SERVICO_BASE,
        valorMaterial: 15,
        materiais: [{ materialId: material.id, quantidade: 3 }],
      });

    const rejeicao = await request(app)
      .post(`/api/servicos/${criado.body.id}/rejeitar`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(rejeicao.status).toBe(200);

    /* Recusar o serviço e mesmo assim consumir o material seria o pior dos dois mundos: o gestor
       negou o trabalho e o estoque pagou por ele. */
    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    expect(depois.quantidadeAtual).toBe(7);
    const saidas = await prisma.movimentacaoEstoque.findMany({
      where: { materialId: material.id, tipo: 'saida' },
    });
    expect(saidas).toHaveLength(0);
  });

  it('material de OUTRO tenant declarado por funcionário: nada é criado e o saldo alheio fica intacto', async () => {
    const a = await criarEmpresaComAdmin(request, app, 'G4A');
    const b = await criarEmpresaComAdmin(request, app, 'G4B');
    await exigirAprovacao(a.empresaId);
    const materialDaB = await criarMaterial(b.token, { nome: 'Material da B', quantidadeAtual: 5 });
    const func = await criarFuncionarioComAcesso(request, app, a.token, { nome: 'Func Cross' });

    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send({
        ...SERVICO_BASE,
        valorMaterial: 10,
        materiais: [{ materialId: materialDaB.id, quantidade: 1 }],
      });

    /* Deixar o funcionário declarar material sem revalidar o tenant transformaria esta correção
       num IDOR de estoque: bastaria adivinhar o id de um material alheio. */
    expect(res.status).toBeGreaterThanOrEqual(400);
    const depois = await prisma.material.findUnique({ where: { id: materialDaB.id } });
    expect(depois.quantidadeAtual).toBe(5);
    const servicos = await prisma.servico.findMany({ where: { empresaId: a.empresaId } });
    expect(servicos).toHaveLength(0);
  });

  it('APROVAÇÃO DESLIGADA: funcionário que manda material continua recebendo 400', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'G5');
    /* Sem `exigirAprovacao`: o serviço nasceria `ativo` e a baixa sairia sem gestor nenhum. */
    const material = await criarMaterial(admin.token, { nome: 'Material G5', quantidadeAtual: 9 });
    const func = await criarFuncionarioComAcesso(request, app, admin.token, {
      nome: 'Func Sem Aprov',
    });

    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send({ ...SERVICO_BASE, materiais: [{ materialId: material.id, quantidade: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('materiais_nao_permitidos');
    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    expect(depois.quantidadeAtual).toBe(9);
  });

  it('serviço de funcionário SEM material declarado continua não movendo estoque', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'G6');
    await exigirAprovacao(admin.empresaId);
    const material = await criarMaterial(admin.token, { nome: 'Material G6', quantidadeAtual: 4 });
    const func = await criarFuncionarioComAcesso(request, app, admin.token, {
      nome: 'Func Sem Mat',
    });

    const criado = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send({ ...SERVICO_BASE, valorMaterial: 40 });
    await request(app)
      .post(`/api/servicos/${criado.body.id}/aprovar`)
      .set('Authorization', `Bearer ${admin.token}`);

    /* CONTRAPROVA da correção: ela não pode ter passado a baixar material que ninguém declarou.
       `valorMaterial` cobrado em texto livre continua sem contrapartida no estoque — é assim por
       desenho, e continua sendo o limite honesto desta rota. */
    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    expect(depois.quantidadeAtual).toBe(4);
  });

  it('CORRIDA: duas aprovações concorrentes dão UMA baixa, e a perdedora recebe 409', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'G7');
    await exigirAprovacao(admin.empresaId);
    const material = await criarMaterial(admin.token, { nome: 'Material G7', quantidadeAtual: 10 });
    const func = await criarFuncionarioComAcesso(request, app, admin.token, {
      nome: 'Func Corrida',
    });

    const criado = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send({
        ...SERVICO_BASE,
        valorMaterial: 30,
        materiais: [{ materialId: material.id, quantidade: 3 }],
      });

    const aprovar = () =>
      request(app)
        .post(`/api/servicos/${criado.body.id}/aprovar`)
        .set('Authorization', `Bearer ${admin.token}`);
    const [um, dois] = await Promise.all([aprovar(), aprovar()]);

    /* PROVADO QUE MORDE, por sonda de mutação: trocando o `updateMany` filtrado por um `update`
       cego pelo id, as duas requisições voltam 200 e este caso falha. As duas chamadas se
       interlaçam de fato — ambas passam pelo pré-check vendo `pendente` — então quem produz o 409
       aqui é a reivindicação atômica, não o pré-check. Sem ela o material cairia 6 em vez de 3, e
       o gestor veria estoque sumindo sem serviço correspondente por causa de um duplo clique.
       O limite honesto: a interlaçagem é comportamento de agendamento, observado neste ambiente.
       Se um dia as duas requisições passarem a serializar, o caso continua verde pelo pré-check e
       deixa de medir a atomicidade — sem avisar. */
    const status = [um.status, dois.status].sort();
    expect(status).toEqual([200, 409]);

    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    expect(depois.quantidadeAtual).toBe(7);
    const saidas = await prisma.movimentacaoEstoque.findMany({
      where: { materialId: material.id, tipo: 'saida' },
    });
    expect(saidas).toHaveLength(1);
  });
});
