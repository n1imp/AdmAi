import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/**
 * Autoexclusão de conta — DELETE /api/me/conta (LGPD + requisito da Play Store).
 *
 * Regras cobertas:
 *  - único admin/dono → apaga a EMPRESA INTEIRA em cascata (todos os dados do tenant);
 *  - reautenticação por senha (senha incorreta → 401, nada é apagado);
 *  - admin não-único → apaga só a própria conta, preservando empresa e colegas;
 *  - isolamento: a exclusão nunca toca dados de outra empresa.
 *  - F3: conta social-only (sem senha) e sem 2FA exige código de confirmação por e-mail
 *    (antes, um JWT válido bastava para apagar a empresa inteira sem nenhuma checagem extra).
 */
let codigoEmailCapturado = null;
vi.mock('../../src/services/email.js', async (orig) => ({
  ...(await orig()),
  // Devolve `true` porque é o contrato real: a função resolve com o booleano de "saiu ou
  // foi pulado". Um mock resolvendo undefined faria a rota responder 503 e mascararia
  // que o caminho feliz está correto.
  enviarEmailCodigoExclusaoConta: vi.fn((_usuario, codigo) => {
    codigoEmailCapturado = codigo;
    return Promise.resolve(true);
  }),
}));

let app;
const TEL = '5511999998888';

beforeAll(() => {
  ({ app } = criarApp());
});
beforeEach(async () => {
  await limparBanco();
  codigoEmailCapturado = null;
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function criarTecnico(token, nome) {
  const res = await request(app)
    .post('/api/tecnicos')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, comissao: 10 });
  expect(res.status).toBe(201);
  return res.body;
}

async function criarServicoComCliente(token, empresaId, tecnicoNome) {
  const res = await request(app)
    .post('/api/servicos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      tecnico: tecnicoNome,
      local: 'Casa',
      descricao: 'Troca de fechadura',
      valorCobrado: 200,
    });
  expect(res.status).toBe(201);
  const servicoId = res.body.id;
  await prisma.servico.update({
    where: { id: servicoId },
    data: { clienteNome: 'Cliente Teste', clienteTelefone: TEL },
  });
  await prisma.avaliacao.create({
    data: {
      empresaId,
      servicoId,
      clienteTelefone: TEL,
      clienteNome: 'Cliente Teste',
      status: 'respondida',
      agendadoPara: new Date(),
    },
  });
  return servicoId;
}

// Cria um RegistroPonto + BatidaPonto para exercitar o cascade BatidaPonto←RegistroPonto.
async function criarPonto(empresaId, tecnicoId) {
  const reg = await prisma.registroPonto.create({
    data: { empresaId, tecnicoId, data: new Date(), entradaEm: new Date() },
  });
  await prisma.batidaPonto.create({
    data: { registroId: reg.id, tipo: 'entrada', em: new Date(), origem: 'painel' },
  });
  return reg.id;
}

describe('DELETE /api/me/conta', () => {
  it('único admin: apaga a empresa inteira em cascata e não toca outra empresa', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'A');
    const tecA = await criarTecnico(A.token, 'Téc A');
    await criarServicoComCliente(A.token, A.empresaId, 'Téc A');
    await criarPonto(A.empresaId, tecA.id);

    const B = await criarEmpresaComAdmin(request, app, 'B');
    await criarTecnico(B.token, 'Téc B');
    await criarServicoComCliente(B.token, B.empresaId, 'Téc B');

    const res = await request(app)
      .delete('/api/me/conta')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ senha: 'SenhaForte1!' });

    expect(res.status).toBe(200);
    expect(res.body.escopo).toBe('empresa');

    // Empresa A e todos os seus dados sumiram.
    expect(await prisma.empresa.findUnique({ where: { id: A.empresaId } })).toBeNull();
    expect(await prisma.usuario.count({ where: { empresaId: A.empresaId } })).toBe(0);
    expect(await prisma.tecnico.count({ where: { empresaId: A.empresaId } })).toBe(0);
    expect(await prisma.servico.count({ where: { empresaId: A.empresaId } })).toBe(0);
    expect(await prisma.avaliacao.count({ where: { empresaId: A.empresaId } })).toBe(0);
    expect(await prisma.registroPonto.count({ where: { empresaId: A.empresaId } })).toBe(0);
    expect(await prisma.batidaPonto.count()).toBe(0); // cascade a partir do RegistroPonto

    // Empresa B permanece intacta.
    expect(await prisma.empresa.findUnique({ where: { id: B.empresaId } })).not.toBeNull();
    expect(await prisma.servico.count({ where: { empresaId: B.empresaId } })).toBe(1);
    expect(await prisma.tecnico.count({ where: { empresaId: B.empresaId } })).toBe(1);
  });

  it('senha incorreta → 403 e nada é apagado', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'A');

    const res = await request(app)
      .delete('/api/me/conta')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ senha: 'senhaErrada' });

    expect(res.status).toBe(403);
    expect(await prisma.empresa.findUnique({ where: { id: A.empresaId } })).not.toBeNull();
  });

  it('admin não-único: apaga só a própria conta, preservando empresa e colega', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'A');
    // Segundo dono ativo na MESMA empresa → a empresa não fica órfã.
    const colega = await prisma.usuario.create({
      data: {
        nome: 'Dono 2',
        username: `dono2_${Date.now()}`,
        email: `dono2_${Date.now()}@teste.com`,
        senhaHash: 'x',
        admin: true,
        papel: 'dono',
        ativo: true,
        empresaId: A.empresaId,
      },
    });

    const res = await request(app)
      .delete('/api/me/conta')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ senha: 'SenhaForte1!' });

    expect(res.status).toBe(200);
    expect(res.body.escopo).toBe('usuario');

    // A empresa e o colega permanecem; só a conta que pediu exclusão sumiu.
    expect(await prisma.empresa.findUnique({ where: { id: A.empresaId } })).not.toBeNull();
    expect(await prisma.usuario.findUnique({ where: { id: A.userId } })).toBeNull();
    expect(await prisma.usuario.findUnique({ where: { id: colega.id } })).not.toBeNull();
  });

  describe('F3 — conta social-only (sem senha) e sem 2FA exige código de e-mail', () => {
    async function tornarSocialOnlySemSenha(userId) {
      await prisma.usuario.update({
        where: { id: userId },
        data: {
          senhaHash: null,
          twoFactorAtivo: false,
          email: `social${userId}${Date.now()}@teste.com`,
          emailVerificado: true,
        },
      });
    }

    it('sem código: 403 confirmacao_necessaria e nada é apagado (prova a falha antes do fix)', async () => {
      const A = await criarEmpresaComAdmin(request, app, 'SocialSemCodigo');
      await tornarSocialOnlySemSenha(A.userId);

      const res = await request(app)
        .delete('/api/me/conta')
        .set('Authorization', `Bearer ${A.token}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('confirmacao_necessaria');
      expect(await prisma.empresa.findUnique({ where: { id: A.empresaId } })).not.toBeNull();
    });

    it('código incorreto: 403 e nada é apagado', async () => {
      const A = await criarEmpresaComAdmin(request, app, 'SocialCodigoErrado');
      await tornarSocialOnlySemSenha(A.userId);

      await request(app)
        .post('/api/me/conta/codigo-exclusao')
        .set('Authorization', `Bearer ${A.token}`)
        .send();

      const res = await request(app)
        .delete('/api/me/conta')
        .set('Authorization', `Bearer ${A.token}`)
        .send({ codigo: '000000' });

      expect(res.status).toBe(403);
      expect(await prisma.empresa.findUnique({ where: { id: A.empresaId } })).not.toBeNull();
    });

    it('código correto (recebido por e-mail): exclui a empresa normalmente', async () => {
      const A = await criarEmpresaComAdmin(request, app, 'SocialCodigoCerto');
      await tornarSocialOnlySemSenha(A.userId);

      const solicitar = await request(app)
        .post('/api/me/conta/codigo-exclusao')
        .set('Authorization', `Bearer ${A.token}`)
        .send();
      expect(solicitar.status).toBe(200);
      expect(solicitar.body.enviado).toBe(true);
      expect(codigoEmailCapturado).toMatch(/^\d{6}$/);

      const res = await request(app)
        .delete('/api/me/conta')
        .set('Authorization', `Bearer ${A.token}`)
        .send({ codigo: codigoEmailCapturado });

      expect(res.status).toBe(200);
      expect(res.body.escopo).toBe('empresa');
      expect(await prisma.empresa.findUnique({ where: { id: A.empresaId } })).toBeNull();
    });

    it('regressão: conta COM senha continua exigindo só a senha (não é afetada pelo novo gate)', async () => {
      const A = await criarEmpresaComAdmin(request, app, 'ComSenhaRegressao');
      // NÃO chama tornarSocialOnlySemSenha — mantém senhaHash normal do register.
      const res = await request(app)
        .delete('/api/me/conta')
        .set('Authorization', `Bearer ${A.token}`)
        .send({ senha: 'SenhaForte1!' });

      expect(res.status).toBe(200);
      expect(res.body.escopo).toBe('empresa');
    });
  });
});
