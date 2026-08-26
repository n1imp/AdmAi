/**
 * Teste de integração: o convidado consegue ENTRAR.  [GAP-ONB-01]
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *   `POST /usuarios/convidar`, `GET /convite/:token` e `POST /convite/:token/aceitar` estão
 *   implementados, a página `ConviteAceitar.jsx` existe, e a única suíte que mencionava convite
 *   provava apenas o caso NEGATIVO: que um gestor não convida alguém como dono. Ninguém tinha
 *   provado que o convidado entra.
 *
 *   Sem isso o AdmAi é monousuário na prática — a empresa cadastra o dono e não consegue
 *   demonstrar que consegue trazer mais ninguém.
 *
 * O TOKEN VEM DO E-MAIL, e é assim que o teste o obtém
 *   A criação guarda só o `sha256` do token; o valor bruto vai para `enviarEmailConvite`. O teste
 *   mocka esse envio e captura o argumento, exercitando o endpoint REAL de criação. Ler o hash do
 *   banco e forjar um token faria o teste provar a minha reimplementação do hash em vez do
 *   produto — e passaria mesmo se o e-mail nunca fosse enviado.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/email.js', async (orig) => ({
  ...(await orig()),
  enviarEmailConvite: vi.fn().mockResolvedValue(null),
}));

import { enviarEmailConvite } from '../../src/services/email.js';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

let app;

beforeAll(() => {
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco();
  enviarEmailConvite.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Convida alguém pelo endpoint real e devolve o token capturado do e-mail. */
async function convidar(token, { email, papel }) {
  const res = await request(app)
    .post('/api/usuarios/convidar')
    .set('Authorization', `Bearer ${token}`)
    .send({ email, papel });
  expect(res.status).toBe(200);

  /* Se o e-mail não foi enviado, não há convite utilizável — e o teste tem de morrer aqui em vez
     de seguir medindo o nada. */
  expect(enviarEmailConvite).toHaveBeenCalled();
  const [, , , tokenBruto] = enviarEmailConvite.mock.calls.at(-1);
  expect(typeof tokenBruto).toBe('string');
  return tokenBruto;
}

const DADOS = {
  nome: 'Convidado Teste',
  username: `conv${Date.now().toString().slice(-6)}`,
  senha: 'SenhaForte1!',
};

describe('Convite: o convidado entra na empresa certa com o papel certo', () => {
  it('PRÉ-CONDIÇÃO: convidar cria o registro e envia o e-mail com o token', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'C1');
    const bruto = await convidar(token, { email: 'novo1@teste.com', papel: 'gestor' });

    const convite = await prisma.conviteUsuario.findFirst({ where: { empresaId } });
    expect(convite).not.toBeNull();
    expect(convite.email).toBe('novo1@teste.com');
    expect(convite.papel).toBe('gestor');
    expect(convite.aceitoEm).toBeNull();
    /* O bruto NÃO pode estar guardado: o banco só deve ter o hash. */
    expect(convite.tokenHash).not.toBe(bruto);
  });

  it('CONTROLE POSITIVO: GET /convite/:token descreve o convite para a tela', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'C2');
    const bruto = await convidar(token, { email: 'novo2@teste.com', papel: 'gestor' });

    const res = await request(app).get(`/api/convite/${bruto}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('novo2@teste.com');
    expect(res.body.papel).toBe('gestor');
    expect(res.body.empresa).toBeTruthy();
  });

  it('CONTROLE POSITIVO: o convidado ACEITA e recebe sessão', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'C3');
    const bruto = await convidar(token, { email: 'novo3@teste.com', papel: 'gestor' });

    const res = await request(app)
      .post(`/api/convite/${bruto}/aceitar`)
      .send({ ...DADOS, username: `conv3${Date.now().toString().slice(-5)}` });

    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
  });

  it('o convidado entra na EMPRESA do convite, com o PAPEL do convite', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'C4');
    const bruto = await convidar(token, { email: 'novo4@teste.com', papel: 'gestor' });
    const username = `conv4${Date.now().toString().slice(-5)}`;

    await request(app)
      .post(`/api/convite/${bruto}/aceitar`)
      .send({ ...DADOS, username });

    const criado = await prisma.usuario.findUnique({ where: { username } });
    expect(criado).not.toBeNull();
    expect(criado.empresaId).toBe(empresaId);
    expect(criado.papel).toBe('gestor');
    expect(criado.email).toBe('novo4@teste.com');
    /* E-mail vindo de convite já nasce verificado: quem recebeu o link provou o endereço. */
    expect(criado.emailVerificado).toBe(true);
  });

  it('a sessão devolvida serve: o convidado usa o produto imediatamente', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'C5');
    const bruto = await convidar(token, { email: 'novo5@teste.com', papel: 'gestor' });

    const aceite = await request(app)
      .post(`/api/convite/${bruto}/aceitar`)
      .send({ ...DADOS, username: `conv5${Date.now().toString().slice(-5)}` });

    const me = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${aceite.body.token}`);

    expect(me.status).toBe(200);
    expect(me.body.email).toBe('novo5@teste.com');
  });

  it('CONSUMO ÚNICO: o mesmo convite não é aceito duas vezes', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'C6');
    const bruto = await convidar(token, { email: 'novo6@teste.com', papel: 'gestor' });

    const primeira = await request(app)
      .post(`/api/convite/${bruto}/aceitar`)
      .send({ ...DADOS, username: `conv6a${Date.now().toString().slice(-4)}` });
    expect(primeira.status).toBe(201);

    const segunda = await request(app)
      .post(`/api/convite/${bruto}/aceitar`)
      .send({ ...DADOS, username: `conv6b${Date.now().toString().slice(-4)}` });

    expect(segunda.status).toBe(404);
  });

  it('EXPIRADO: convite vencido não é aceito nem descrito', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'C7');
    const bruto = await convidar(token, { email: 'novo7@teste.com', papel: 'gestor' });

    await prisma.conviteUsuario.updateMany({
      where: { empresaId },
      data: { expiraEm: new Date(Date.now() - 60_000) },
    });

    const descricao = await request(app).get(`/api/convite/${bruto}`);
    const aceite = await request(app)
      .post(`/api/convite/${bruto}/aceitar`)
      .send({ ...DADOS, username: `conv7${Date.now().toString().slice(-5)}` });

    expect(descricao.status).toBe(404);
    expect(aceite.status).toBe(404);
  });

  it('token inventado não descreve nem aceita nada', async () => {
    await criarEmpresaComAdmin(request, app, 'C8');

    const descricao = await request(app).get('/api/convite/token-que-nunca-existiu');
    const aceite = await request(app)
      .post('/api/convite/token-que-nunca-existiu/aceitar')
      .send({ ...DADOS, username: `conv8${Date.now().toString().slice(-5)}` });

    expect(descricao.status).toBe(404);
    expect(aceite.status).toBe(404);
  });

  it('senha fraca é recusada, e o convite continua utilizável depois', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'C9');
    const bruto = await convidar(token, { email: 'novo9@teste.com', papel: 'gestor' });

    const fraca = await request(app)
      .post(`/api/convite/${bruto}/aceitar`)
      /* `abcdefgh` marca so dois criterios (tamanho + minuscula) e a politica exige tres. A
         primeira versao usava `senha123`, que marca TRES — tamanho, minuscula e numero — e portanto
         e VALIDA por desenho. O fixture e que estava errado, nao o produto. */
      .send({
        nome: 'Convidado',
        username: `conv9${Date.now().toString().slice(-5)}`,
        senha: 'abcdefgh',
      });
    expect(fraca.status).toBe(400);

    /* Recusa não pode consumir o convite: o convidado precisa poder tentar de novo com senha boa.
       Sem esta asserção, um bug que marcasse `aceitoEm` antes de validar passaria despercebido. */
    const boa = await request(app)
      .post(`/api/convite/${bruto}/aceitar`)
      .send({ ...DADOS, username: `conv9b${Date.now().toString().slice(-4)}` });
    expect(boa.status).toBe(201);
  });

  it('ISOLAMENTO: o convite de uma empresa não cria usuário na outra', async () => {
    const a = await criarEmpresaComAdmin(request, app, 'CA');
    const b = await criarEmpresaComAdmin(request, app, 'CB');
    const bruto = await convidar(a.token, { email: 'novoA@teste.com', papel: 'gestor' });
    const username = `convA${Date.now().toString().slice(-5)}`;

    await request(app)
      .post(`/api/convite/${bruto}/aceitar`)
      .send({ ...DADOS, username });

    const criado = await prisma.usuario.findUnique({ where: { username } });
    expect(criado.empresaId).toBe(a.empresaId);
    expect(criado.empresaId).not.toBe(b.empresaId);
  });
});
