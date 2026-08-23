/**
 * "Esta sessão é minha?" precisa de resposta em português.  [SL-14]
 *
 * O DEFEITO: a lista de sessões mostrava "curl/8.19.0", "::1" e "::ffff:127.0.0.1" — strings
 * que não permitem a decisão de segurança que a tela pede. A tradução é determinística e pura.
 */
import { describe, it, expect } from 'vitest';
import { descreverDispositivo, formatarIp } from '../Seguranca.jsx';

describe('descreverDispositivo', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Chrome em Windows',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1',
      'Safari em iPhone/iPad',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', 'Firefox em Linux'],
    [
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0',
      'Edge em Windows',
    ],
    ['curl/8.19.0', 'Ferramenta de linha de comando'],
    ['python-requests/2.31', 'Ferramenta de linha de comando'],
    [undefined, 'Dispositivo desconhecido'],
    ['coisa-estranha/1.0', 'Dispositivo desconhecido'],
  ])('%s → %s', (ua, esperado) => {
    expect(descreverDispositivo(ua)).toBe(esperado);
  });
});

describe('formatarIp', () => {
  it.each([
    ['::1', 'acesso local'],
    ['::ffff:127.0.0.1', 'acesso local'],
    ['::ffff:187.10.20.30', '187.10.20.30'], // IPv4 mapeado perde o prefixo; público fica cru
    ['203.0.113.7', '203.0.113.7'],
    [null, '—'],
  ])('%s → %s', (ip, esperado) => {
    expect(formatarIp(ip)).toBe(esperado);
  });
});
