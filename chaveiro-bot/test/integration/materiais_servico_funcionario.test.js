/**
 * Teste de integração: o funcionário alcança a declaração de material.  [GAP-EST-03] [D-EST-03]
 *
 * A CADEIA QUE ESTAVA QUEBRADA NO MEIO
 *   `D-EST-02` tornou alcançável a baixa de estoque na aprovação: o funcionário DECLARA o material
 *   no registro, o serviço nasce `pendente` com o vínculo, e a baixa sai quando o gestor aprova.
 *   O backend passou nos 15 casos daquela rodada.
 *
 *   E ninguém conseguia usar. O seletor do painel consome `GET /materiais`, protegido por
 *   `estoque:ver`, e `PRESET_FUNCIONARIO` zera todos os módulos de empresa. Capacidade provada no
 *   backend, inalcançável pela única pessoa que precisava dela. Terceira ocorrência desta classe
 *   nesta frente — a primeira foi o ramo morto de `servicos.js:269`, a segunda o ramo de storage
 *   dos documentos.
 *
 * POR QUE NÃO BASTAVA CONCEDER A PERMISSÃO
 *   `GET /materiais` devolve `precoUnit`, `precoVenda`, `estoqueMinimo`, `quantidadeAtual` e a
 *   contagem de uso. Abrir aquilo para resolver um seletor entregaria custo, margem e inventário a
 *   quem só precisa escolher um item de uma lista. O corte aqui é por NECESSIDADE: id, nome,
 *   unidade.
 *
 * E O QUE ESTE ARQUIVO NÃO DEIXA CONFUNDIR
 *   Rota de leitura não é autorização. Os dois últimos casos provam que o backend revalida o
 *   `materialId` contra o tenant no registro — porque o cliente pode mandar qualquer id, e a única
 *   defesa real é a que roda no servidor.
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

/** Cria material pelo dono. Saldo entra por movimentação — o cadastro não aceita `quantidadeAtual`. */
async function criarMaterial(token, nome, quantidade = 10) {
  const res = await request(app)
    .post('/api/materiais')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, unidade: 'un', precoUnit: 42.5, precoVenda: 90, estoqueMinimo: 3 });
  expect(res.status).toBe(201);
  await request(app)
    .post(`/api/materiais/${res.body.id}/movimentacao`)
    .set('Authorization', `Bearer ${token}`)
    .send({ tipo: 'entrada', quantidade });
  return res.body;
}

const exigirAprovacao = (empresaId) =>
  prisma.empresa.update({ where: { id: empresaId }, data: { aprovacaoServico: true } });

const SERVICO_BASE = {
  local: 'Rua de Teste, 100',
  descricao: 'Troca de segredo',
  valorCobrado: 200,
  valorMaterial: 0,
};

describe('Catálogo mínimo para quem registra serviço [GAP-EST-03]', () => {
  it('CONTROLE POSITIVO: funcionário com registrar_servico recebe 200 e a lista', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'M1');
    await criarMaterial(admin.token, 'Fechadura Tetra');
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func M1' });

    const res = await request(app)
      .get('/api/me/materiais-servico')
      .set('Authorization', `Bearer ${func.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nome).toBe('Fechadura Tetra');
  });

  it('o payload traz SOMENTE id, nome e unidade', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'M2');
    await criarMaterial(admin.token, 'Cilindro');
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func M2' });

    const res = await request(app)
      .get('/api/me/materiais-servico')
      .set('Authorization', `Bearer ${func.token}`);

    /* Comparação por CONJUNTO DE CHAVES, não por ausência campo a campo: uma lista de campos
       proibidos precisaria ser atualizada toda vez que o schema crescesse, e o dia em que
       esquecessem de atualizá-la é exatamente o dia do vazamento. Assim, campo novo no modelo
       reprova aqui até alguém decidir conscientemente incluí-lo. */
    expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'nome', 'unidade']);

    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain('42.5');
    expect(texto).not.toContain('precoUnit');
    expect(texto).not.toContain('quantidadeAtual');
    expect(texto).not.toContain('estoqueMinimo');
  });

  it('TENANT: material de outra empresa nunca aparece', async () => {
    const a = await criarEmpresaComAdmin(request, app, 'M3A');
    const b = await criarEmpresaComAdmin(request, app, 'M3B');
    await criarMaterial(a.token, 'Material da A');
    await criarMaterial(b.token, 'Material da B');
    const funcA = await criarFuncionarioComAcesso(request, app, a.token, { nome: 'Func M3' });

    const res = await request(app)
      .get('/api/me/materiais-servico')
      .set('Authorization', `Bearer ${funcA.token}`);

    /* Nome de material é informação comercial: a lista de compras da concorrente. */
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nome).toBe('Material da A');
    expect(JSON.stringify(res.body)).not.toContain('Material da B');
  });

  it('a rota ANTIGA continua barrada: funcionário segue sem `estoque:ver`', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'M4');
    await criarMaterial(admin.token, 'Material M4');
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func M4' });

    const antiga = await request(app)
      .get('/api/materiais')
      .set('Authorization', `Bearer ${func.token}`);

    /* Se este caso passar a devolver 200, alguém “resolveu” o 403 concedendo a permissão — e o
       custo e o inventário voltaram a sair pela porta que esta rota existe para evitar. */
    expect(antiga.status).toBe(403);
  });

  it('DENY: sem a capacidade `registrar_servico` a rota recusa', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'M5');
    await criarMaterial(admin.token, 'Material M5');
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func M5' });

    /* Revoga só a capacidade, mantendo o usuário ativo e com sessão válida — é a diferença entre
       "não pode isto" e "não pode nada", e só a primeira prova que a guarda olha a capacidade. */
    /* Duas coisas que eu tinha chutado errado e o teste corrigiu: a coluna é `permissoes`
       (Json de overrides sobre o preset do papel, schema.prisma:236-238), não
       `permissoesOverride`; e o vínculo é `Tecnico.usuarioId`, não `Usuario.tecnicoId`. */
    const tecnico = await prisma.tecnico.findUnique({ where: { id: func.tecnicoId } });
    await prisma.usuario.update({
      where: { id: tecnico.usuarioId },
      data: { permissoes: { proprio: { registrar_servico: false } } },
    });

    const res = await request(app)
      .get('/api/me/materiais-servico')
      .set('Authorization', `Bearer ${func.token}`);

    expect(res.status).toBe(403);
  });

  it('sem sessão: 401', async () => {
    const res = await request(app).get('/api/me/materiais-servico');
    expect(res.status).toBe(401);
  });
});

describe('O regime de aprovação chega à tela [D-EST-03]', () => {
  it('`/me/permissoes` informa aprovacaoServico nos dois estados', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'P1');
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func P1' });

    const desligado = await request(app)
      .get('/api/me/permissoes')
      .set('Authorization', `Bearer ${func.token}`);
    await exigirAprovacao(admin.empresaId);
    const ligado = await request(app)
      .get('/api/me/permissoes')
      .set('Authorization', `Bearer ${func.token}`);

    expect(desligado.body.aprovacaoServico).toBe(false);
    /* Lido do banco a cada requisição: o MESMO token vê o valor novo. Se viesse do JWT, o
       funcionário carregaria o regime antigo até a sessão expirar — e a tela ofereceria uma
       capacidade que o backend acabou de passar a recusar. */
    expect(ligado.body.aprovacaoServico).toBe(true);
  });

  it('os campos que já existiam continuam intactos', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'P2');
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func P2' });

    const res = await request(app)
      .get('/api/me/permissoes')
      .set('Authorization', `Bearer ${func.token}`);

    expect(res.status).toBe(200);
    expect(res.body.papel).toBe('funcionario');
    expect(res.body.permissoes.proprio.registrar_servico).toBe(true);
    /* Contraprova do corte de campos acima: aqui o esperado é que NADA tenha sumido. */
    expect(res.body.permissoes.estoque.ver).toBe(false);
  });

  it('TENANT: a empresa A não observa a configuração da empresa B', async () => {
    const a = await criarEmpresaComAdmin(request, app, 'P3A');
    const b = await criarEmpresaComAdmin(request, app, 'P3B');
    await exigirAprovacao(b.empresaId);
    const funcA = await criarFuncionarioComAcesso(request, app, a.token, { nome: 'Func P3' });

    const res = await request(app)
      .get('/api/me/permissoes')
      .set('Authorization', `Bearer ${funcA.token}`);

    expect(res.body.aprovacaoServico).toBe(false);
  });

  it('sem sessão: 401', async () => {
    const res = await request(app).get('/api/me/permissoes');
    expect(res.status).toBe(401);
  });
});

describe('O fluxo inteiro, ponta a ponta [GAP-EST-03]', () => {
  it('funcionário escolhe da lista, registra, e o gestor aprova dando a baixa', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'F1');
    await exigirAprovacao(admin.empresaId);
    const material = await criarMaterial(admin.token, 'Fechadura F1', 10);
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func F1' });

    /* 1. A tela descobre o regime. */
    const contexto = await request(app)
      .get('/api/me/permissoes')
      .set('Authorization', `Bearer ${func.token}`);
    expect(contexto.body.aprovacaoServico).toBe(true);

    /* 2. A tela carrega o catálogo — e é este passo que dava 403 antes. */
    const catalogo = await request(app)
      .get('/api/me/materiais-servico')
      .set('Authorization', `Bearer ${func.token}`);
    expect(catalogo.status).toBe(200);
    const escolhido = catalogo.body.find((m) => m.id === material.id);
    expect(escolhido).toBeTruthy();

    /* 3. O funcionário registra declarando o material escolhido. */
    const criado = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send({
        ...SERVICO_BASE,
        valorMaterial: 85,
        materiais: [{ materialId: escolhido.id, quantidade: 2 }],
      });
    expect(criado.status).toBe(201);

    const pendente = await prisma.servico.findUnique({
      where: { id: criado.body.id },
      include: { materiais: true },
    });
    expect(pendente.status).toBe('pendente');
    expect(pendente.materiais).toHaveLength(1);
    /* Declarar não baixa: o saldo só se move quando um gestor aprova. */
    expect((await prisma.material.findUnique({ where: { id: material.id } })).quantidadeAtual).toBe(
      10
    );

    /* 4. O gestor aprova e a baixa sai. */
    const aprovacao = await request(app)
      .post(`/api/servicos/${criado.body.id}/aprovar`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(aprovacao.status).toBe(200);

    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    expect(depois.quantidadeAtual).toBe(8);
    const saidas = await prisma.movimentacaoEstoque.findMany({
      where: { materialId: material.id, tipo: 'saida' },
    });
    expect(saidas).toHaveLength(1);
    expect(saidas[0].servicoId).toBe(criado.body.id);
  });

  it('SERVER-SIDE: materialId de OUTRO tenant é rejeitado, mesmo tendo vindo "da lista"', async () => {
    const a = await criarEmpresaComAdmin(request, app, 'F2A');
    const b = await criarEmpresaComAdmin(request, app, 'F2B');
    await exigirAprovacao(a.empresaId);
    const daB = await criarMaterial(b.token, 'Material da B', 7);
    const funcA = await criarFuncionarioComAcesso(request, app, a.token, { nome: 'Func F2' });

    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${funcA.token}`)
      .send({
        ...SERVICO_BASE,
        valorMaterial: 50,
        materiais: [{ materialId: daB.id, quantidade: 1 }],
      });

    /* O catálogo nunca mostraria este id — e é justamente por isso que o teste o manda à mão. A
       rota de leitura reduz o que a TELA oferece; ela não impede ninguém de forjar um POST. A
       defesa que conta é a revalidação em `servicos.js:197-200`. */
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await prisma.material.findUnique({ where: { id: daB.id } })).quantidadeAtual).toBe(7);
    expect(await prisma.servico.count({ where: { empresaId: a.empresaId } })).toBe(0);
  });

  it('SERVER-SIDE: materialId inexistente é rejeitado', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'F3');
    await exigirAprovacao(admin.empresaId);
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func F3' });

    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send({
        ...SERVICO_BASE,
        valorMaterial: 10,
        materiais: [{ materialId: 99999999, quantidade: 1 }],
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.servico.count({ where: { empresaId: admin.empresaId } })).toBe(0);
  });

  it('APROVAÇÃO DESLIGADA: o backend continua recusando material do funcionário', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'F4');
    /* Sem `exigirAprovacao` de propósito. */
    const material = await criarMaterial(admin.token, 'Material F4', 5);
    const func = await criarFuncionarioComAcesso(request, app, admin.token, { nome: 'Func F4' });

    const contexto = await request(app)
      .get('/api/me/permissoes')
      .set('Authorization', `Bearer ${func.token}`);
    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func.token}`)
      .send({ ...SERVICO_BASE, materiais: [{ materialId: material.id, quantidade: 1 }] });

    /* A tela some com o seletor porque o contexto diz `false`; o backend recusa porque a decisão
       é dele. As duas camadas concordam, e nenhuma depende da outra — se a tela errar, ou se a
       configuração mudar entre carregar e enviar, a recusa continua acontecendo. */
    expect(contexto.body.aprovacaoServico).toBe(false);
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('materiais_nao_permitidos');
  });
});
