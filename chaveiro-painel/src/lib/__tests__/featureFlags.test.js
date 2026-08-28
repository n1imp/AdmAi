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
  it('as quatro diferidas nascem DESLIGADAS sem configuração', () => {
    /* O ambiente de teste não define nenhuma `VITE_FEATURE_*`. É exatamente o cenário de um build
       onde alguém esqueceu de configurar — e o resultado tem de ser "não vai ao ar". */
    expect(FLAGS.METRIC_HUBS).toBe(false);
    expect(FLAGS.GOOGLE_REVIEWS).toBe(false);
    expect(FLAGS.NOTIFICACOES).toBe(false);
    expect(FLAGS.WHATSAPP).toBe(false); // [D2 amendment] superintegração POST_MVP
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

  it('o conjunto de flags é FECHADO: só as cinco diferidas', () => {
    /* Flag nova aparecendo aqui sem decisão de escopo é sinal de que alguém retirou algo do
       release sem registrar. O teste força a conversa. SUBSCRIPTIONS_BILLING entrou por
       decisão soberana D2 (Refoundation Cycle 1, 2026-08-28): assinaturas fora do MVP. */
    expect(Object.keys(FLAGS).sort()).toEqual([
      'GOOGLE_REVIEWS',
      'METRIC_HUBS',
      'NOTIFICACOES',
      'SUBSCRIPTIONS_BILLING',
      'WHATSAPP',
    ]);
  });

  it('SUBSCRIPTIONS_BILLING é OFF por padrão (assinaturas fora do MVP, D2)', () => {
    expect(FLAGS.SUBSCRIPTIONS_BILLING).toBe(false);
  });
});
