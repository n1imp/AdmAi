/**
 * Teste de integração: fluxo completo de cadastro com OTP por WhatsApp.
 *
 * Cobre:
 *  - POST /api/auth/register com telefone → 201 + telefoneVerificado:false
 *  - Captura do OTP enviado pelo gateway (mockado) via enviarMensagem
 *  - POST /api/me/telefone/otp/verificar com código correto → 200 { telefoneVerificado:true }
 *  - Verificação no banco: usuario.telefoneVerificado===true + Tecnico criado com usuarioId
 *  - Código errado → 400
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Mock parcial do gateway: mantém outros exports reais, mocka só enviarMensagem.
vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { enviarMensagem } from '../../src/services/whatsapp/gateway.js';
import { criarApp } from '../../src/app.js';
import { limparBanco, prisma } from './helpers.js';

let app;

beforeAll(() => {
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco();
  enviarMensagem.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Cadastro com OTP de telefone', () => {
  const dadosCadastro = {
    nome: 'Dono OTP',
    nomeEmpresa: 'Chaveiro OTP Ltda',
    username: `donoOtp${Date.now()}`,
    email: `dono.otp.${Date.now()}@example.com`,
    telefone: '5511988880001',
    senha: 'SenhaForte1!',
  };

  it('POST /api/auth/register retorna 201 com telefoneVerificado:false e envia OTP', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(dadosCadastro);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.telefoneVerificado).toBe(false);
    expect(res.body.telefone).toBeTruthy();

    // Gateway deve ter sido chamado com o OTP
    expect(enviarMensagem).toHaveBeenCalled();
    const mensagemOtp = enviarMensagem.mock.calls[0][1];
    const match = mensagemOtp.match(/(\d{6})/);
    expect(match).not.toBeNull();
  });

  it('POST /api/me/telefone/otp/verificar com código correto → 200 { telefoneVerificado:true }', async () => {
    const resRegister = await request(app)
      .post('/api/auth/register')
      .send({ ...dadosCadastro, username: `donoOtp2${Date.now()}`, email: `otp2.${Date.now()}@ex.com` });

    expect(resRegister.status).toBe(201);
    const { token } = resRegister.body;
    const userId = resRegister.body.id;

    // Extrai o OTP da mensagem enviada
    const mensagemOtp = enviarMensagem.mock.calls[0][1];
    const [, codigo] = mensagemOtp.match(/(\d{6})/);

    const resVerificar = await request(app)
      .post('/api/me/telefone/otp/verificar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo });

    expect(resVerificar.status).toBe(200);
    expect(resVerificar.body.telefoneVerificado).toBe(true);

    // Confirma no banco que telefoneVerificado foi salvo
    const usuario = await prisma.usuario.findUnique({ where: { id: userId } });
    expect(usuario.telefoneVerificado).toBe(true);

    // Confirma que foi criado um Tecnico vinculado ao usuário
    const tecnico = await prisma.tecnico.findFirst({ where: { usuarioId: userId } });
    expect(tecnico).not.toBeNull();
    expect(tecnico.usuarioId).toBe(userId);
    expect(tecnico.empresaId).toBe(usuario.empresaId);
    // O telefone do técnico deve ser o canônico do usuário
    expect(tecnico.telefone).toBeTruthy();
  });

  it('POST /api/me/telefone/otp/verificar com código errado → 400', async () => {
    const resRegister = await request(app)
      .post('/api/auth/register')
      .send({ ...dadosCadastro, username: `donoOtp3${Date.now()}`, email: `otp3.${Date.now()}@ex.com` });

    expect(resRegister.status).toBe(201);
    const { token } = resRegister.body;

    const resVerificar = await request(app)
      .post('/api/me/telefone/otp/verificar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: '000000' });

    expect(resVerificar.status).toBe(400);
  });
});
