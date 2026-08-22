/**
 * Teste de integração: a trilha de auditoria cobre operações sobre dado pessoal.  [GAP-AUD-01]
 *
 * O QUE ESTE ARQUIVO DECIDE
 *   A exclusão de conta e a anonimização de cliente funcionavam e eram provadas — mas não deixavam
 *   rastro. `registrarAudit` existia e era chamado em cinco pontos, todos de ciclo de vida de
 *   usuário; nenhum em `account.js` nem em `/lgpd/anonimizar-cliente`, que é onde a exigência legal
 *   aperta. A LGPD pede demonstrar o atendimento ao titular, e demonstrar exige registro.
 *
 * AS DUAS PROPRIEDADES, e a segunda é a que quase ninguém testa
 *   1. A operação GERA registro, com ator, ação, alvo e momento.
 *   2. O registro NÃO carrega o dado pessoal que a operação removeu.
 *
 *   A segunda é o ponto. Uma trilha que guardasse o e-mail excluído ou o telefone anonimizado
 *   preservaria exatamente aquilo que a operação existe para apagar — a auditoria derrotaria a
 *   operação que ela audita, e o sistema ficaria MENOS conforme por ter auditoria.
 *
 * O REGISTRO SOBREVIVE À CASCATA, e isso é necessário
 *   `AuditLog.empresaId` é um `Int` sem relação declarada, então apagar a empresa não apaga a
 *   trilha. Se apagasse, a demonstração morreria junto com o que ela precisa demonstrar.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

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
 * Cria um técnico para pendurar o serviço.
 *
 * `criarEmpresaComAdmin` NÃO deixa um técnico pronto: o técnico-self do dono só nasce quando o
 * telefone é VERIFICADO, não no cadastro. A primeira versão deste arquivo assumiu que existia e
 * quebrou com `null.id`.
 */
async function criarTecnico(empresaId) {
  return prisma.tecnico.create({
    data: { empresaId, nome: 'Tecnico de Teste', comissao: 10 }
  });
}

/** Todo texto do registro, para procurar PII que não deveria estar lá. */
const textoDoRegistro = (r) =>
  JSON.stringify({ antes: r.antes, depois: r.depois, entidade: r.entidade, acao: r.acao });

describe('Auditoria de operações sobre dado pessoal', () => {
  it('CONTROLE POSITIVO: exclusão de conta única gera registro com ator e ação', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'A1');
    /* Um segundo admin, para que a exclusão NÃO caia no caminho de apagar a empresa. */
    await prisma.usuario.create({
      data: {
        nome: 'Outro Admin', username: `outro${Date.now().toString().slice(-6)}`,
        email: `outro${Date.now()}@teste.com`, senhaHash: 'x', papel: 'dono', admin: true,
        ativo: true, empresaId: admin.empresaId
      }
    });

    const res = await request(app)
      .delete('/api/me/conta')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ senha: 'SenhaForte1!' });
    expect(res.status).toBe(200);
    expect(res.body.escopo).toBe('usuario');

    const registros = await prisma.auditLog.findMany({
      where: { empresaId: admin.empresaId, acao: 'conta.excluida' }
    });
    expect(registros).toHaveLength(1);
    expect(registros[0].usuarioId).toBe(admin.userId);
    expect(registros[0].depois.escopo).toBe('usuario');
    expect(registros[0].criadoEm).toBeInstanceOf(Date);
  });

  it('o registro da exclusão NÃO carrega o dado pessoal excluído', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'A2');
    const usuario = await prisma.usuario.findUnique({ where: { id: admin.userId } });
    await prisma.usuario.create({
      data: {
        nome: 'Outro Admin', username: `outro2${Date.now().toString().slice(-5)}`,
        email: `outro2${Date.now()}@teste.com`, senhaHash: 'x', papel: 'dono', admin: true,
        ativo: true, empresaId: admin.empresaId
      }
    });

    await request(app).delete('/api/me/conta')
      .set('Authorization', `Bearer ${admin.token}`).send({ senha: 'SenhaForte1!' });

    const [registro] = await prisma.auditLog.findMany({
      where: { empresaId: admin.empresaId, acao: 'conta.excluida' }
    });
    const texto = textoDoRegistro(registro);

    /* Se qualquer um destes aparecer, a trilha preservou o que a exclusao removeu. */
    expect(texto).not.toContain(usuario.email);
    expect(texto).not.toContain(usuario.nome);
    expect(texto).not.toContain(usuario.username);
    if (usuario.telefone) expect(texto).not.toContain(usuario.telefone);
  });

  it('exclusão que apaga a EMPRESA registra escopo e contagem antes da cascata', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'A3');

    const res = await request(app)
      .delete('/api/me/conta')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ senha: 'SenhaForte1!' });
    expect(res.status).toBe(200);
    expect(res.body.escopo).toBe('empresa');

    const [registro] = await prisma.auditLog.findMany({
      where: { empresaId: admin.empresaId, acao: 'conta.excluida' }
    });
    expect(registro).toBeTruthy();
    expect(registro.depois.escopo).toBe('empresa');
    /* A contagem so e derivavel ANTES da cascata. Se o registro viesse depois, seria zero — e um
       zero aqui pareceria um apagamento que nao afetou ninguem. */
    expect(registro.depois.usuariosAfetados).toBeGreaterThanOrEqual(1);
  });

  it('o registro SOBREVIVE à cascata que apaga a empresa', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'A4');

    await request(app).delete('/api/me/conta')
      .set('Authorization', `Bearer ${admin.token}`).send({ senha: 'SenhaForte1!' });

    const empresa = await prisma.empresa.findUnique({ where: { id: admin.empresaId } });
    const registros = await prisma.auditLog.findMany({ where: { empresaId: admin.empresaId } });

    /* A empresa sumiu; a demonstracao de que ela sumiu, nao. Se a trilha morresse junto, nao
       haveria como provar o atendimento ao titular depois. */
    expect(empresa).toBeNull();
    expect(registros.length).toBeGreaterThanOrEqual(1);
  });

  it('CONTROLE POSITIVO: anonimização de cliente gera registro com as contagens', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'A5');
    const telefone = '5531999887766';
    const tecnico = await criarTecnico(admin.empresaId);
    await prisma.servico.create({
      data: {
        empresaId: admin.empresaId, tecnicoId: tecnico.id,
        clienteNome: 'Cliente Para Apagar', clienteTelefone: telefone,
        valorCobrado: 100, valorLiquido: 100, status: 'concluido',
        /* Campos obrigatorios do modelo. Eu vinha adivinhando um por vez a cada erro do Prisma —
           ler os obrigatorios do schema de uma vez custa menos e nao deixa o proximo escondido. */
        local: 'Rua de Teste', descricao: 'Servico de teste',
        msgOriginal: 'mensagem de teste', remetenteWpp: '5511000000000'
      }
    });

    const res = await request(app)
      .post('/api/lgpd/anonimizar-cliente')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ telefone });
    expect(res.status).toBe(200);
    expect(res.body.servicosAnonimizados).toBeGreaterThanOrEqual(1);

    const [registro] = await prisma.auditLog.findMany({
      where: { empresaId: admin.empresaId, acao: 'lgpd.cliente_anonimizado' }
    });
    expect(registro).toBeTruthy();
    expect(registro.usuarioId).toBe(admin.userId);
    expect(registro.depois.servicosAnonimizados).toBeGreaterThanOrEqual(1);
  });

  it('o registro da anonimização NÃO carrega o telefone nem o nome anonimizados', async () => {
    const admin = await criarEmpresaComAdmin(request, app, 'A6');
    const telefone = '5531988776655';
    const nome = 'Nome Que Deve Sumir';
    const tecnico = await criarTecnico(admin.empresaId);
    await prisma.servico.create({
      data: {
        empresaId: admin.empresaId, tecnicoId: tecnico.id,
        clienteNome: nome, clienteTelefone: telefone,
        valorCobrado: 100, valorLiquido: 100, status: 'concluido',
        /* Campos obrigatorios do modelo. Eu vinha adivinhando um por vez a cada erro do Prisma —
           ler os obrigatorios do schema de uma vez custa menos e nao deixa o proximo escondido. */
        local: 'Rua de Teste', descricao: 'Servico de teste',
        msgOriginal: 'mensagem de teste', remetenteWpp: '5511000000000'
      }
    });

    await request(app).post('/api/lgpd/anonimizar-cliente')
      .set('Authorization', `Bearer ${admin.token}`).send({ telefone });

    const [registro] = await prisma.auditLog.findMany({
      where: { empresaId: admin.empresaId, acao: 'lgpd.cliente_anonimizado' }
    });
    const texto = textoDoRegistro(registro);

    /* O caso mais traicoeiro do arquivo: o telefone e o ARGUMENTO da operacao, entao e a coisa mais
       natural do mundo registra-lo. E registra-lo desfaria a anonimizacao. */
    expect(texto).not.toContain(telefone);
    expect(texto).not.toContain(nome);
  });

  it('ISOLAMENTO: a trilha de uma empresa não aparece na consulta da outra', async () => {
    const a = await criarEmpresaComAdmin(request, app, 'A7');
    const b = await criarEmpresaComAdmin(request, app, 'A8');

    await request(app).delete('/api/me/conta')
      .set('Authorization', `Bearer ${a.token}`).send({ senha: 'SenhaForte1!' });

    const daB = await prisma.auditLog.findMany({ where: { empresaId: b.empresaId } });
    const daA = await prisma.auditLog.findMany({ where: { empresaId: a.empresaId } });

    expect(daA.length).toBeGreaterThanOrEqual(1);
    expect(daB.filter((r) => r.acao === 'conta.excluida')).toHaveLength(0);
  });
});
