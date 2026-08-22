/**
 * Unit — ordem das superfícies de primeiro acesso.  [GAP-UI-02]
 *
 * A PROPRIEDADE QUE ESTE ARQUIVO EXISTE PARA FIXAR
 *   No máximo UMA superfície por vez. O defeito original não era nenhuma das três estar errada —
 *   cada uma, isolada, fazia a coisa certa. Errado era o conjunto, e conjunto só se testa aqui,
 *   onde a decisão passou a morar.
 *
 *   Por isso os casos abaixo enumeram ESTADOS, não componentes: é a combinação que quebrava.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHAVE_CONSENTIMENTO,
  CHAVE_BOAS_VINDAS,
  superficieAtual,
  tourPodeAutoIniciar,
} from '../primeiroAcesso.js';

beforeEach(() => localStorage.clear());

describe('superficieAtual — uma de cada vez', () => {
  it('PRIMEIRO ACESSO: só o consentimento aparece', () => {
    /* Este é o estado em que as três disparavam juntas. */
    expect(superficieAtual()).toBe('consentimento');
  });

  it('consentimento pendente SUPRIME as boas-vindas, mesmo sem elas terem sido vistas', () => {
    expect(localStorage.getItem(CHAVE_BOAS_VINDAS)).toBeNull();
    /* A asserção acima é o ponto: as boas-vindas estão "devidas" e ainda assim não é a vez
       delas. Decidir sobre rastreamento sob um card de onboarding não é decidir. */
    expect(superficieAtual()).toBe('consentimento');
  });

  it.each(['all', 'necessary'])('depois do consentimento (%s) vêm as boas-vindas', (opcao) => {
    localStorage.setItem(CHAVE_CONSENTIMENTO, opcao);
    /* As DUAS escolhas liberam a sequência. Se só "aceitar todos" liberasse, quem recusa
       analíticos ficaria preso sem onboarding — punição silenciosa por exercer a escolha. */
    expect(superficieAtual()).toBe('boas-vindas');
  });

  it('com tudo decidido, nenhuma superfície aparece', () => {
    localStorage.setItem(CHAVE_CONSENTIMENTO, 'necessary');
    localStorage.setItem(CHAVE_BOAS_VINDAS, '1');
    expect(superficieAtual()).toBe('nenhuma');
  });

  it('boas-vindas dispensadas NÃO reabrem por causa do consentimento', () => {
    localStorage.setItem(CHAVE_BOAS_VINDAS, '1');
    localStorage.setItem(CHAVE_CONSENTIMENTO, 'all');
    expect(superficieAtual()).toBe('nenhuma');
  });

  it('INVARIANTE: em nenhum estado possível duas superfícies são devidas', () => {
    const valores = [null, 'all'];
    for (const c of valores) {
      for (const b of [null, '1']) {
        localStorage.clear();
        if (c !== null) localStorage.setItem(CHAVE_CONSENTIMENTO, c);
        if (b !== null) localStorage.setItem(CHAVE_BOAS_VINDAS, b);
        /* Enumera os quatro estados alcançáveis. `superficieAtual` devolve UM rótulo por
           construção — o que esta asserção fixa é que o rótulo é sempre válido, e que nenhum
           estado cai num caso não previsto. */
        expect(['consentimento', 'boas-vindas', 'nenhuma']).toContain(superficieAtual());
      }
    }
  });
});

describe('tour', () => {
  it('NUNCA inicia sozinho, em nenhum estado', () => {
    /* O auto-start era metade da duplicação: o card oferecia "VER TUTORIAL" para algo que já ia
       abrir. Mantê-lo com a ordem corrigida só mudaria QUANDO a interrupção acontece. */
    expect(tourPodeAutoIniciar()).toBe(false);
    localStorage.setItem(CHAVE_CONSENTIMENTO, 'all');
    localStorage.setItem(CHAVE_BOAS_VINDAS, '1');
    expect(tourPodeAutoIniciar()).toBe(false);
  });
});
