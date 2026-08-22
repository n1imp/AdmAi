/**
 * Unit — decodificação do payload do JWT.  [GAP-UI-01]
 *
 * O CONTROLE CENTRAL DESTE ARQUIVO
 *   O defeito original passava em qualquer teste feito com nome ASCII. `João` só quebra se o
 *   teste usar `João`. Por isso os casos abaixo carregam Unicode real — e não um `é` solitário
 *   como amostra simbólica, mas os nomes que aparecem de fato numa base brasileira.
 *
 *   O token é montado aqui com `TextEncoder` + base64url, exatamente como o backend produz. Se eu
 *   montasse com `btoa(JSON.stringify(...))`, o fixture teria o MESMO defeito do código sob teste
 *   e os dois erros se cancelariam — o teste passaria com o decoder quebrado.
 */
import { describe, it, expect } from 'vitest';
import { decodeJWT } from '../jwt.js';

/** Monta um JWT com payload real em UTF-8, do jeito que o backend monta. */
function tokenCom(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binaria = '';
  for (const b of bytes) binaria += String.fromCharCode(b);
  const b64url = btoa(binaria).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `cabecalho.${b64url}.assinatura`;
}

describe('decodeJWT — bytes viram texto, não caracteres', () => {
  it('CONTROLE POSITIVO: payload ASCII continua funcionando', () => {
    const p = decodeJWT(tokenCom({ id: 7, nome: 'Ana', papel: 'funcionario', admin: false }));
    /* Sem isto, um decoder que devolvesse `null` sempre passaria em todo caso de Unicode
       abaixo — porque `null` não contém mojibake. */
    expect(p).toMatchObject({ id: 7, nome: 'Ana', papel: 'funcionario', admin: false });
  });

  it.each([
    ['Ana Técnica', 'é'],
    ['João Gonçalves', 'ão e ç juntos'],
    ['José', 'é final'],
    ['Márcia', 'á'],
    ['Ação', 'ç seguido de ã'],
  ])('preserva %s (%s)', (nome) => {
    /* Com `atob` cru, `é` (bytes c3 a9) virava `Ã©`. A asserção compara o nome INTEIRO: checar
       só "contém é" deixaria passar um decoder que corrompesse os outros caracteres. */
    expect(decodeJWT(tokenCom({ nome })).nome).toBe(nome);
  });

  it('preserva caracteres isolados que a codificação errada duplica', () => {
    for (const c of ['Ç', 'ã', 'é']) {
      const lido = decodeJWT(tokenCom({ nome: c })).nome;
      expect(lido).toBe(c);
      /* Um caractere que vira dois é a assinatura exata do defeito: o comprimento denuncia
         antes mesmo de olhar o conteúdo. */
      expect(lido).toHaveLength(1);
    }
  });

  it('sobrevive a payload SEM padding, qualquer que seja o comprimento', () => {
    /* `base64url` omite `=`. Sem repor o padding, `atob` recusa payloads cujo comprimento cai em
       certos restos de 4 — falha intermitente que parece aleatória porque depende do TAMANHO do
       payload, não do conteúdo. Os quatro comprimentos abaixo cobrem os quatro restos. */
    for (const n of [1, 2, 3, 4]) {
      const nome = 'a'.repeat(n);
      expect(decodeJWT(tokenCom({ nome })).nome).toBe(nome);
    }
  });

  it('caractere fora do plano básico (emoji) sobrevive', () => {
    /* Quatro bytes em UTF-8. Se o decoder tratasse byte como caractere, sairiam quatro símbolos. */
    expect(decodeJWT(tokenCom({ nome: 'Chaveiro 🔑' })).nome).toBe('Chaveiro 🔑');
  });

  it('token ilegível devolve null em vez de estourar', () => {
    /* Item corrompido no localStorage não pode derrubar a aplicação no boot. */
    for (const ruim of ['', 'sem-pontos', 'a.!!!nao-e-base64!!!.c', null, undefined, 'a..c']) {
      expect(decodeJWT(ruim)).toBeNull();
    }
  });

  it('payload que não é JSON devolve null', () => {
    const b64 = btoa('isto não é json').replace(/=+$/, '');
    expect(decodeJWT(`a.${b64}.c`)).toBeNull();
  });
});
