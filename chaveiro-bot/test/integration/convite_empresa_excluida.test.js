/**
 * Convite pendente × exclusão da empresa — o que sobrevive, e o que NÃO pode.  [F0-10]
 *
 * O QUE ESTE TESTE DECIDE
 *   `ConviteUsuario` não tem FK para `Empresa` (schema.prisma:485) e a cascata manual de
 *   `apagarEmpresaEmCascata` apagava 13 modelos sem incluí-lo. Duas consequências, uma pior que
 *   a outra:
 *
 *   1. O convite órfão continuava RESPONDENDO: `GET /convite/:token` devolvia 200 com
 *      `empresa: ''` — um convite com cara de válido para uma empresa que não existe — e o
 *      aceite estourava na FK de `Usuario.empresaId` com 500. Fail-closed por ACIDENTE: quem
 *      protegia era a constraint, não uma decisão.
 *   2. `convite.email` e `nomeConvidadoPor` são dado pessoal — do CONVIDADO, um terceiro que
 *      talvez nunca tenha aceitado nada — sobrevivendo à exclusão de conta que o comentário da
 *      própria cascata declara servir a LGPD e à Play Store.
 *
 *   A correção é a menor possível: `conviteUsuario.deleteMany` entra na transação da cascata.
 *   Este teste prova o comportamento CERTO; o commit registra o errado observado antes dela.
 *
 * INVARIANTE REGISTRADA (não testada aqui): `AuditLog` também sobrevive à exclusão — e isso é
 * DELIBERADO (trilha de auditoria não pode morrer junto com quem ela audita), com a política de
 * não carregar dado pessoal no próprio registro. Ver `auditoria_dado_pessoal.test.js`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

let app;

beforeAll(async () => {
  ({ app } = await criarApp());
  await limparBanco();
});

describe('exclusão da empresa com convite pendente', () => {
  it('apaga o convite junto: 404 nas duas rotas, zero linhas, zero conta órfã', async () => {
    const { token: jwt, empresaId } = await criarEmpresaComAdmin(request, app, 'ConvOrfao');

    // Convite semeado como a rota o cria (o token cru só sai por e-mail, então a fixture
    // reproduz a geração: 32 bytes hex, hash SHA-256 no banco).
    const tokenConvite = randomBytes(32).toString('hex');
    await prisma.conviteUsuario.create({
      data: {
        empresaId,
        email: 'convidado-terceiro@teste.com',
        papel: 'funcionario',
        tokenHash: createHash('sha256').update(tokenConvite).digest('hex'),
        nomeConvidadoPor: 'Admin ConvOrfao',
        expiraEm: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    // CONTROLE POSITIVO primeiro: com a empresa viva, o convite responde. Sem isto, os 404 do
    // final poderiam vir de um token errado na fixture, e o teste passaria vazio.
    const antes = await request(app).get(`/api/convite/${tokenConvite}`);
    expect(antes.status).toBe(200);
    expect(antes.body.email).toBe('convidado-terceiro@teste.com');

    // Exclusão pelo caminho REAL do produto (dono único → cascata da empresa inteira).
    const exclusao = await request(app)
      .delete('/api/me/conta')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ senha: 'SenhaForte1!' });
    expect([200, 204]).toContain(exclusao.status);
    expect(await prisma.empresa.findUnique({ where: { id: empresaId } })).toBeNull();

    // O dado pessoal do terceiro não pode sobreviver à exclusão.
    expect(await prisma.conviteUsuario.count({ where: { empresaId } })).toBe(0);

    // E o convite deixa de RESPONDER: 404 honesto nas duas pontas, nunca 200-fantasma nem 500.
    const depois = await request(app).get(`/api/convite/${tokenConvite}`);
    expect(depois.status).toBe(404);

    const aceite = await request(app).post(`/api/convite/${tokenConvite}/aceitar`).send({
      nome: 'Convidado Tardio',
      username: 'convidadotardio',
      senha: 'SenhaForte1!',
    });
    expect(aceite.status).toBe(404);

    // Nenhuma conta órfã nasceu em nenhum dos caminhos.
    expect(await prisma.usuario.count({ where: { username: 'convidadotardio' } })).toBe(0);
  });
});
