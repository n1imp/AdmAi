/**
 * Teste de integração E2E — fluxo do funcionário ponta-a-ponta (RBAC + ponto + aprovação).
 *
 * Roteiro (o mesmo da validação manual pedida):
 *   dono cria técnico c/ acesso → PIN provisório → login por telefone + PIN →
 *   troca de senha forçada (1º acesso) → bater ponto com selfie + geo →
 *   registrar serviço (entra PENDENTE) → dono aprova → comissão/receita passam a contar.
 *
 * Cobre as decisões de docs/decisions.md (2026-06-20): self-scope do funcionário,
 * senhaProvisoria bloqueando o painel, prova de batida (BatidaPonto) e efeitos
 * colaterais (comissão/receita) só na APROVAÇÃO.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Mock parcial do gateway: evita envio real de OTP/WhatsApp no register e no acesso.
vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

// 1x1 PNG transparente — selfie válida mínima (data URL aceita pelo /ponto/bater).
const SELFIE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

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

describe('E2E funcionário: acesso → ponto → serviço pendente → aprovação', () => {
  it('percorre o fluxo completo com selfie/geo e aprovação contabilizando comissão', async () => {
    // ── Dono cria a empresa e liga a fila de aprovação ────────────────────────
    const { token: tokenDono } = await criarEmpresaComAdmin(request, app, 'E2E');

    const resConfig = await request(app)
      .patch('/api/config/empresa')
      .set('Authorization', `Bearer ${tokenDono}`)
      .send({ aprovacaoServico: true });
    expect(resConfig.status).toBe(200);
    expect(resConfig.body.aprovacaoServico).toBe(true);

    // ── Dono cria o técnico COM acesso (login por telefone + PIN) ─────────────
    const telefoneFunc = '5521991230001';
    const resTecnico = await request(app)
      .post('/api/tecnicos')
      .set('Authorization', `Bearer ${tokenDono}`)
      .send({ nome: 'Funcionário E2E', telefone: telefoneFunc, comissao: 20, criarAcesso: true });
    expect(resTecnico.status).toBe(201);
    const tecnicoId = resTecnico.body.id;
    expect(resTecnico.body.acesso).toBeTruthy();
    const pin = resTecnico.body.acesso.pin;
    expect(pin).toMatch(/^\d{6}$/);
    expect(resTecnico.body.acesso.papel).toBe('funcionario');

    // ── Funcionário faz login por telefone + PIN → senha provisória ───────────
    const resLogin = await request(app)
      .post('/api/auth/login')
      .send({ telefone: telefoneFunc, password: pin });
    expect(resLogin.status).toBe(200);
    expect(resLogin.body.senhaProvisoria).toBe(true);
    expect(resLogin.body.papel).toBe('funcionario');
    const tokenProvisorio = resLogin.body.token;

    // senhaProvisoria bloqueia o painel (403 com código), exceto /me e troca de senha.
    const resBloqueado = await request(app)
      .get('/api/ponto/hoje')
      .set('Authorization', `Bearer ${tokenProvisorio}`);
    expect(resBloqueado.status).toBe(403);
    expect(resBloqueado.body.codigo).toBe('senha_provisoria');

    // ── Troca de senha forçada (1º acesso) → novo token sem senhaProvisoria ────
    const resTroca = await request(app)
      .patch('/api/me/senha')
      .set('Authorization', `Bearer ${tokenProvisorio}`)
      .send({ senhaAtual: pin, novaSenha: 'NovaSenhaForte1!' });
    expect(resTroca.status).toBe(200);
    expect(resTroca.body.token).toBeTruthy();
    const tokenFunc = resTroca.body.token;

    const resMe = await request(app).get('/api/me').set('Authorization', `Bearer ${tokenFunc}`);
    expect(resMe.status).toBe(200);
    expect(resMe.body.senhaProvisoria).toBe(false);

    // ── Bater ponto com selfie + geolocalização (entrada) ─────────────────────
    const resPonto = await request(app)
      .post('/api/ponto/bater')
      .set('Authorization', `Bearer ${tokenFunc}`)
      .send({ lat: -22.9068, lng: -43.1729, precisao: 12.5, selfie: SELFIE_PNG });
    expect(resPonto.status).toBe(201);
    expect(resPonto.body.tipo).toBe('entrada');
    expect(resPonto.body.batidas.length).toBe(1);
    expect(resPonto.body.batidas[0].temSelfie).toBe(true);

    // Prova persistida: BatidaPonto com selfieUrl + geo (anti-fraude).
    const batida = await prisma.batidaPonto.findFirst({ where: { tipo: 'entrada' } });
    expect(batida).not.toBeNull();
    expect(batida.selfieUrl).toMatch(/^\/uploads-ponto\/ponto-/);
    expect(batida.lat).toBeCloseTo(-22.9068);
    expect(batida.lng).toBeCloseTo(-43.1729);
    expect(batida.origem).toBe('painel');

    // ── Funcionário registra serviço → entra PENDENTE (aprovacaoServico ligada) ─
    const resServico = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${tokenFunc}`)
      .send({
        local: 'Casa do cliente',
        descricao: 'Troca de fechadura',
        valorCobrado: 200,
        clienteTelefone: '5521990000099',
      });
    expect(resServico.status).toBe(201);
    expect(resServico.body.status).toBe('pendente');
    const servicoId = resServico.body.id;

    // Pendente NÃO conta no dashboard do dono.
    const resDashAntes = await request(app)
      .get('/api/dashboard?periodo=mes')
      .set('Authorization', `Bearer ${tokenDono}`);
    expect(resDashAntes.status).toBe(200);
    expect(resDashAntes.body.totalServicos).toBe(0);
    expect(resDashAntes.body.receitaLiquida).toBe(0);

    // ── Dono vê a fila e aprova ───────────────────────────────────────────────
    const resPendentes = await request(app)
      .get('/api/servicos/pendentes')
      .set('Authorization', `Bearer ${tokenDono}`);
    expect(resPendentes.status).toBe(200);
    expect(resPendentes.body.some((s) => s.id === servicoId)).toBe(true);

    const resAprovar = await request(app)
      .post(`/api/servicos/${servicoId}/aprovar`)
      .set('Authorization', `Bearer ${tokenDono}`);
    expect(resAprovar.status).toBe(200);
    expect(resAprovar.body.status).toBe('ativo');

    // ── Após aprovação: receita e comissão passam a contar ────────────────────
    const resDashDepois = await request(app)
      .get('/api/dashboard?periodo=mes')
      .set('Authorization', `Bearer ${tokenDono}`);
    expect(resDashDepois.status).toBe(200);
    expect(resDashDepois.body.totalServicos).toBe(1);
    expect(resDashDepois.body.receitaLiquida).toBe(200);
    expect(resDashDepois.body.totalComissao).toBe(40); // 20% de 200

    // O funcionário vê as próprias métricas (self-scope) com a comissão ganha.
    const resMetricas = await request(app)
      .get('/api/me/metricas')
      .set('Authorization', `Bearer ${tokenFunc}`);
    expect(resMetricas.status).toBe(200);
    expect(resMetricas.body.tecnico.id).toBe(tecnicoId);
    expect(resMetricas.body.comissaoGanha).toBe(40);
    expect(resMetricas.body.servicosPendentes).toBe(0);
  });
});
