/**
 * Unit — lock distribuído de cron (F1a).
 *
 * Prova que comLock deixa só UMA de N chamadas concorrentes (as N réplicas do web
 * disparando o mesmo tick) executar o job, e que é fail-closed quando o Redis falha.
 * O Redis é mockado com uma implementação in-memory de SET NX.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controle do fake (hoisted p/ o factory do vi.mock enxergar).
const ctl = vi.hoisted(() => ({ throwOnSet: false, store: new Map() }));

vi.mock('ioredis', () => {
  class FakeRedis {
    on() {}
    async set(key, _val, _ex, _ttl, mode) {
      if (ctl.throwOnSet) throw new Error('redis down');
      if (mode === 'NX' && ctl.store.has(key)) return null; // já travado
      ctl.store.set(key, '1');
      return 'OK';
    }
  }
  return { default: FakeRedis };
});

import { comLock } from '../agendador.js';

describe('comLock — lock distribuído de cron (F1a)', () => {
  beforeEach(() => { ctl.throwOnSet = false; ctl.store.clear(); });

  it('duas chamadas concorrentes na mesma chave → apenas UMA executa', async () => {
    let execs = 0;
    const fn = async () => { execs++; };
    await Promise.all([comLock('resumo', 60, fn), comLock('resumo', 60, fn)]);
    expect(execs).toBe(1);
  });

  it('após o lock liberar (TTL), o próximo tick volta a executar', async () => {
    let execs = 0;
    const fn = async () => { execs++; };
    await comLock('resumo', 60, fn); // adquire e executa
    ctl.store.clear(); // simula expiração do TTL
    await comLock('resumo', 60, fn); // adquire de novo
    expect(execs).toBe(2);
  });

  it('fail-closed: erro no Redis NÃO executa o job (duplicar é pior que pular)', async () => {
    ctl.throwOnSet = true;
    let execs = 0;
    await comLock('resumo', 60, async () => { execs++; });
    expect(execs).toBe(0);
  });
});
