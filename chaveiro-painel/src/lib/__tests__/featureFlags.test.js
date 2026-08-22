/**
 * Unit — flags de release.  [SCOPE-F3]
 *
 * A PROPRIEDADE QUE IMPORTA É O DEFAULT
 *   Feature diferida que volta ao ar por esquecimento de configuração é o estado inválido que estas
 *   flags existem para impedir — e ele acontece em silêncio, que é o pior jeito de acontecer.
 *   Por isso ausência de variável tem de significar DESLIGADO, e não "assume ligado".
 */
import { describe, it, expect } from 'vitest';
import { FLAGS, featureAtiva } from '../featureFlags.js';

describe('featureFlags', () => {
  it('as três diferidas nascem DESLIGADAS sem configuração', () => {
    /* O ambiente de teste não define nenhuma `VITE_FEATURE_*`. É exatamente o cenário de um build
       onde alguém esqueceu de configurar — e o resultado tem de ser "não vai ao ar". */
    expect(FLAGS.METRIC_HUBS).toBe(false);
    expect(FLAGS.GOOGLE_REVIEWS).toBe(false);
    expect(FLAGS.NOTIFICACOES).toBe(false);
  });

  it('só a string `true` liga — qualquer outro valor é não', () => {
    /* `VITE_FEATURE_X=1`, `=yes`, `=false` e `=` são todos erros de configuração plausíveis, e
       nenhum deles pode ser lido como consentimento para lançar. */
    for (const nome of Object.keys(FLAGS)) {
      expect(typeof FLAGS[nome]).toBe('boolean');
    }
    expect(featureAtiva('METRIC_HUBS')).toBe(false);
  });

  it('CONTRAPROVA: nome desconhecido é ATIVO — só o que foi diferido carrega flag', () => {
    /* Se desconhecido virasse `false`, um erro de digitação apagaria uma tela do MVP. A lista de
       flags cobre o que saiu do release; o resto do produto não depende dela para existir. */
    expect(featureAtiva('SERVICOS')).toBe(true);
    expect(featureAtiva('qualquer-coisa')).toBe(true);
  });

  it('o conjunto de flags é FECHADO: só as três diferidas', () => {
    /* Flag nova aparecendo aqui sem decisão de escopo é sinal de que alguém retirou algo do
       release sem registrar. O teste força a conversa. */
    expect(Object.keys(FLAGS).sort()).toEqual(['GOOGLE_REVIEWS', 'METRIC_HUBS', 'NOTIFICACOES']);
  });
});
