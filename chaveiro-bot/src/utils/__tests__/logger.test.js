import { describe, it, expect } from 'vitest';
import { redigirSensiveis } from '../logger.js';

describe('redigirSensiveis', () => {
  it('redige chaves sensíveis (case-insensitive) e preserva o resto', () => {
    const r = redigirSensiveis({
      userId: 7,
      senha: 'segredo123',
      senhaHash: '$2a$12$abc',
      Authorization: 'Bearer xyz',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      nome: 'Ana',
    });
    expect(r.userId).toBe(7);
    expect(r.nome).toBe('Ana');
    expect(r.senha).toBe('[REDACTED]');
    expect(r.senhaHash).toBe('[REDACTED]');
    expect(r.Authorization).toBe('[REDACTED]');
    expect(r.totpSecret).toBe('[REDACTED]');
  });

  it('redige em objetos aninhados', () => {
    const r = redigirSensiveis({ ctx: { usuario: { id: 1, password: 'p', token: 'abc' } } });
    expect(r.ctx.usuario.id).toBe(1);
    expect(r.ctx.usuario.password).toBe('[REDACTED]');
    expect(r.ctx.usuario.token).toBe('[REDACTED]');
  });

  it('não quebra com ciclos nem com primitivos', () => {
    const o = { a: 1 };
    o.self = o; // ciclo
    expect(() => redigirSensiveis(o)).not.toThrow();
    expect(redigirSensiveis('texto')).toBe('texto');
    expect(redigirSensiveis(null)).toBe(null);
  });

  it('não redige chaves comuns como "codigo" (usada p/ códigos de erro)', () => {
    const r = redigirSensiveis({ codigo: 'senha_provisoria', erro: 'x' });
    expect(r.codigo).toBe('senha_provisoria');
  });
});
