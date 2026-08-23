/**
 * Crisp atrás do consentimento — o gate que a Política de Cookies §2/§4 promete.  [SL-05]
 *
 * O DEFEITO: `iniciarCrisp()` rodava incondicional no boot; a tag de terceiro entrava antes de
 * qualquer escolha, contradizendo a política publicada ("somente com seu consentimento").
 *
 * O QUE jsdom PROVA AQUI: presença/ausência da TAG de script e as mensagens na fila `$crisp`
 * (jsdom não busca scripts). O comportamento de REDE real — zero requisição a crisp.chat sem
 * consentimento — é a matriz F4.4, por CDP. Confundir as duas provas seria TEST_PASS !=
 * RUNTIME_ACCEPTED.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const CHAVE = 'admai_cookies_consent';
const tagCrisp = () => document.head.querySelector('script[src*="crisp.chat"]');

/* `carregado` é estado de módulo (como no navegador: uma carga por sessão) — cada cenário
   precisa de um módulo virgem, senão um teste herda a sessão do anterior. */
async function moduloVirgem(id = 'id-de-teste') {
  vi.resetModules();
  vi.stubEnv('VITE_CRISP_ID', id);
  return import('../crispBootstrap.js');
}

beforeEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
  delete window.$crisp;
  delete window.CRISP_WEBSITE_ID;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
});

describe('sincronizarCrisp', () => {
  it('SEM escolha: fail-closed — nenhuma tag, nenhum global', async () => {
    const { sincronizarCrisp } = await moduloVirgem();
    sincronizarCrisp();
    expect(tagCrisp()).toBeNull();
    expect(window.CRISP_WEBSITE_ID).toBeUndefined();
  });

  it('"Apenas necessários" NÃO carrega suporte (a política o classifica como opcional)', async () => {
    const { sincronizarCrisp } = await moduloVirgem();
    localStorage.setItem(CHAVE, 'necessary');
    sincronizarCrisp();
    expect(tagCrisp()).toBeNull();
  });

  it('consentimento pleno carrega a tag uma única vez, mesmo sincronizando de novo', async () => {
    const { sincronizarCrisp } = await moduloVirgem();
    localStorage.setItem(CHAVE, 'all');
    sincronizarCrisp();
    sincronizarCrisp();
    expect(document.head.querySelectorAll('script[src*="crisp.chat"]')).toHaveLength(1);
    expect(window.CRISP_WEBSITE_ID).toBe('id-de-teste');
  });

  it('revogação após a carga esconde o widget; re-consentimento reexibe SEM segunda tag', async () => {
    const { sincronizarCrisp } = await moduloVirgem();
    localStorage.setItem(CHAVE, 'all');
    sincronizarCrisp(); // carrega e zera a fila
    localStorage.removeItem(CHAVE);
    sincronizarCrisp();
    expect(window.$crisp).toContainEqual(['do', 'chat:hide']);
    localStorage.setItem(CHAVE, 'all');
    sincronizarCrisp();
    expect(window.$crisp).toContainEqual(['do', 'chat:show']);
    expect(document.head.querySelectorAll('script[src*="crisp.chat"]')).toHaveLength(1);
  });

  it('sem VITE_CRISP_ID é no-op absoluto, mesmo com consentimento pleno', async () => {
    const { sincronizarCrisp } = await moduloVirgem('');
    localStorage.setItem(CHAVE, 'all');
    sincronizarCrisp();
    expect(tagCrisp()).toBeNull();
    expect(window.$crisp).toBeUndefined();
  });
});
