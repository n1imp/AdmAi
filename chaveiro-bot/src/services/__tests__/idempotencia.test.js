/**
 * Unit — idempotência de webhooks (F5.2). Mocka o ioredis com um SET NX in-memory.
 * Prova: 1ª vez → novo (true), reentrega da mesma chave → duplicata (false), e
 * fail-open (erro no Redis → true, para não perder o evento).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ctl = vi.hoisted(() => ({ throwOnSet: false, store: new Map() }));

vi.mock('ioredis', () => {
  class FakeRedis {
    on() {}
    async set(key, _v, _ex, _ttl, mode) {
      if (ctl.throwOnSet) throw new Error('redis down');
      if (mode === 'NX' && ctl.store.has(key)) return null; // já existia
      ctl.store.set(key, '1');
      return 'OK';
    }
  }
  return { default: FakeRedis };
});

import { marcarSeNovo } from '../idempotencia.js';

describe('marcarSeNovo (F5.2)', () => {
  beforeEach(() => {
    ctl.throwOnSet = false;
    ctl.store.clear();
  });

  it('1ª vez → true (novo); mesma chave de novo → false (duplicata)', async () => {
    expect(await marcarSeNovo('stripe:evt_1', 60)).toBe(true);
    expect(await marcarSeNovo('stripe:evt_1', 60)).toBe(false);
  });

  it('chaves diferentes são independentes (cada uma nova)', async () => {
    expect(await marcarSeNovo('wa:a', 60)).toBe(true);
    expect(await marcarSeNovo('wa:b', 60)).toBe(true);
  });

  it('fail-open: erro no Redis → true (processa, não perde o evento)', async () => {
    ctl.throwOnSet = true;
    expect(await marcarSeNovo('stripe:evt_x', 60)).toBe(true);
  });
});
