import { describe, it, expect } from 'vitest';
import { authLimiter } from '../rateLimiters.js';
import authRouter from '../../routes/auth.js';

// F4: authLimiter era definido DUAS VEZES — uma em app.js (Redis) e outra, separada, em
// routes/auth.js (sem RedisStore, cai no MemoryStore padrão). Este teste prova que
// routes/auth.js agora reaproveita a MESMA instância exportada por rateLimiters.js
// (identidade de referência), não uma segunda instância independente.
function encontrarCamada(router, path, method) {
  return router.stack.find(
    (camada) =>
      camada.route?.path === path && Object.keys(camada.route?.methods ?? {}).includes(method)
  );
}

describe('rateLimiters (F4 — dedup do authLimiter)', () => {
  it('authLimiter exportado é uma função de middleware única', () => {
    expect(typeof authLimiter).toBe('function');
  });

  it.each([
    ['/auth/recuperar-senha', 'post'],
    ['/auth/redefinir-senha', 'post'],
    ['/auth/magic-link', 'post'],
  ])('%s usa a MESMA instância de authLimiter (não uma cópia em MemoryStore)', (path, method) => {
    const camada = encontrarCamada(authRouter, path, method);
    expect(camada, `rota ${method} ${path} não encontrada`).toBeTruthy();
    // O stack da rota inclui [authLimiter, handler] — o authLimiter deve ser
    // referência-idêntica ao exportado por rateLimiters.js (mesma instância/estado Redis).
    const temAuthLimiter = camada.route.stack.some((s) => s.handle === authLimiter);
    expect(temAuthLimiter).toBe(true);
  });
});
