import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* `import.meta.url` no vitest nao e um URL `file:` — vem do transform. O cwd da suite e a raiz
   do modulo, entao o caminho relativo a ela e o que se resolve de verdade. */
const NAVEGACAO = resolve(process.cwd(), 'src/config/navigation.js');
import { buildNavigation, MAX_PRIMARY } from '../navigation.js';

const dono = { papel: 'dono', pode: () => true, podeProprio: () => true };
const gestorPleno = { papel: 'gestor', pode: () => true, podeProprio: () => false };
const gestorRestrito = {
  papel: 'gestor',
  pode: (m) => ['dashboard', 'servicos'].includes(m),
  podeProprio: () => false,
};
const funcPleno = { papel: 'funcionario', pode: () => false, podeProprio: () => true };
const funcMinimo = { papel: 'funcionario', pode: () => false, podeProprio: () => false };

const tos = (lista) => lista.map((d) => d.to);
const moreTos = (nav) => nav.moreGroups.flatMap((g) => g.itens.map((i) => i.to));
const desktopTos = (nav) => nav.desktopGroups.flatMap((g) => g.itens.map((i) => i.to));

describe('buildNavigation — PR2 + PR4', () => {
  it('Dono: primários curados, sem autosserviço, ≤ MAX_PRIMARY', () => {
    const nav = buildNavigation(dono);
    expect(tos(nav.primary)).toEqual(['/', '/tecnicos', '/reparticao']);
    expect(nav.primary.length).toBeLessThanOrEqual(MAX_PRIMARY);
    const todos = [...tos(nav.primary), ...moreTos(nav), ...desktopTos(nav)];
    expect(todos).not.toContain('/meu-ponto');
    expect(todos).not.toContain('/meus-servicos');
    expect(todos).not.toContain('/meus-servicos/novo');
  });

  it('Gestor pleno: 4 primários operacionais, sem autosserviço', () => {
    const nav = buildNavigation(gestorPleno);
    expect(tos(nav.primary)).toEqual(['/', '/aprovacoes', '/tecnicos', '/estoque']);
    expect(moreTos(nav)).not.toContain('/meu-ponto');
  });

  it('Gestor restrito: itens sem permissão somem (não desabilitam)', () => {
    const nav = buildNavigation(gestorRestrito);
    const todos = [...tos(nav.primary), ...moreTos(nav)];
    expect(todos).toContain('/'); // dashboard permitido
    expect(todos).toContain('/servicos'); // servicos permitido
    expect(todos).not.toContain('/tecnicos'); // sem permissão
    expect(todos).not.toContain('/estoque');
  });

  it('Funcionário pleno: início, ponto, registrar, perfil', () => {
    const nav = buildNavigation(funcPleno);
    expect(tos(nav.primary)).toEqual([
      '/',
      '/meu-ponto',
      '/meus-servicos/novo',
      '/configuracao/perfil',
    ]);
  });

  it('Funcionário sem capacidades próprias: só destinos de escopo próprio (sempre)', () => {
    const nav = buildNavigation(funcMinimo);
    const primary = tos(nav.primary);
    expect(primary).toContain('/');
    expect(primary).toContain('/configuracao/perfil');
    expect(primary).not.toContain('/meu-ponto');
    expect(primary).not.toContain('/meus-servicos/novo');
  });

  it('Invariantes: sem destinos duplicados; primário e "Mais" disjuntos', () => {
    for (const ctx of [dono, gestorPleno, funcPleno]) {
      const nav = buildNavigation(ctx);
      const primary = tos(nav.primary);
      const more = moreTos(nav);
      // primário e overflow são disjuntos
      expect(primary.filter((t) => more.includes(t))).toEqual([]);
      // sem "to" duplicado no conjunto mobile
      const mobile = [...primary, ...more];
      expect(new Set(mobile).size).toBe(mobile.length);
      // sem "to" duplicado no desktop
      const desk = desktopTos(nav);
      expect(new Set(desk).size).toBe(desk.length);
      // todo item tem to, label e icon
      for (const item of [...nav.primary, ...nav.desktopGroups.flatMap((g) => g.itens)]) {
        expect(item.to).toBeTruthy();
        expect(item.label).toBeTruthy();
        expect(item.icon).toBeTruthy();
      }
    }
  });

  it('Papel desconhecido cai no manifesto de funcionário (fallback seguro)', () => {
    const nav = buildNavigation({ papel: undefined, pode: () => false, podeProprio: () => true });
    expect(tos(nav.primary)).toContain('/configuracao/perfil');
  });
});

/**
 * Escopo de release na navegação.  [SCOPE-F3]
 *
 * `dono` tem TODAS as permissões (`pode: () => true`). É de propósito: o item some porque a
 * capacidade foi diferida, não porque falta permissão. Testar com um papel restrito confundiria as
 * duas causas e passaria mesmo se a flag não existisse.
 */
describe('features diferidas não aparecem na navegação', () => {
  it('/avaliacoes some para o dono, que pode tudo', () => {
    const nav = buildNavigation(dono);
    const todos = [...tos(nav.primary), ...moreTos(nav), ...desktopTos(nav)];
    expect(todos).not.toContain('/avaliacoes');
  });

  it('CONTRAPROVA: /configuracao/usuarios PERMANECE — ADMIN entra no release', () => {
    /* Sem esta asserção, "esconder tudo" passaria como escopo fechado. A gestão de usuários é
       suporte direto a RBAC e continua visível por decisão explícita. */
    const nav = buildNavigation(dono);
    const todos = [...tos(nav.primary), ...moreTos(nav), ...desktopTos(nav)];
    expect(todos).toContain('/configuracao/usuarios');
  });

  it('CONTRAPROVA: a navegação do dono continua cheia — nada além do diferido saiu', () => {
    const nav = buildNavigation(dono);
    const todos = [...tos(nav.primary), ...moreTos(nav), ...desktopTos(nav)];
    for (const rota of [
      '/',
      '/servicos',
      '/aprovacoes',
      '/tecnicos',
      '/estoque',
      '/configuracao',
    ]) {
      expect(todos, `${rota} sumiu junto`).toContain(rota);
    }
  });
});

/**
 * GAP-UX-NAV-DIFERIDA-01 — feature diferida não pode ser alcançável.
 *
 * O SINTOMA foi o hub do funcionário oferecendo "Notificações · Alertas e avisos" com chevron,
 * para uma rota removida por flag: o toque caía no curinga e devolvia ao Painel, calado.
 *
 * A CAUSA não era a entrada. Era `permite()` fazendo `return true` em `guard.sempre` ANTES de
 * olhar `feature` — ou seja, `sempre: true` desligava o gate de feature inteiro. Dez entradas
 * usam `sempre: true`. Corrigir só a entrada de Notificações deixaria as outras nove prontas
 * para repetir o vazamento na próxima feature diferida.
 *
 * `NAV_HIDDEN` sozinho `!=` `FEATURE_HIDDEN`: esconder o item não basta, e por isso o controle
 * derivado abaixo confere a rota também.
 */
describe('GAP-UX-NAV-DIFERIDA-01 — POST_MVP + USER_REACHABLE = INVALID_RELEASE_STATE', () => {
  const papeis = { dono, gestor: gestorPleno, funcionario: funcPleno };

  it('NEGATIVO: com a flag desligada, nenhum papel alcança Notificações', () => {
    /* O ambiente de teste não define `VITE_FEATURE_NOTIFICACOES`, então a flag está OFF — que é
       exatamente o estado do build de release. */
    for (const [papel, ctx] of Object.entries(papeis)) {
      const nav = buildNavigation(ctx);
      const todos = [...tos(nav.primary), ...moreTos(nav), ...desktopTos(nav)];
      expect(todos, `papel ${papel}`).not.toContain('/configuracao/notificacoes');
    }
  });

  it('NEGATIVO: o vazamento era no hub do FUNCIONÁRIO — nem lá, nem no mínimo', () => {
    /* Era esta a tela da captura: telas/inventario-func/funcionario__mais__390x844.jpg. */
    for (const ctx of [funcPleno, funcMinimo]) {
      expect(moreTos(buildNavigation(ctx))).not.toContain('/configuracao/notificacoes');
    }
  });

  it('SABOTAGEM DO GUARD: `sempre: true` não pode ressuscitar capacidade diferida', () => {
    /* A entrada real de Notificações tem `{ sempre: true, feature: 'NOTIFICACOES' }`. Este teste
       falha se alguém reverter a ordem em `permite()` OU remover a `feature` da entrada — as duas
       formas de reabrir o vazamento. É a sabotagem escrita como invariante permanente. */
    const fonte = readFileSync(NAVEGACAO, 'utf8');
    /* Ancorar no PRÓXIMO `guard:` em vez de numa janela de N caracteres: comentário acrescentado
       entre a entrada e o guard empurraria o alvo para fora de qualquer janela fixa, e o teste
       falharia por motivo errado — foi o que aconteceu na primeira escrita deste controle. */
    const daEntrada = fonte.slice(fonte.indexOf("to: '/configuracao/notificacoes'"));
    const guard = daEntrada.slice(daEntrada.indexOf('guard:'));
    expect(guard.slice(0, 120)).toMatch(/guard:\s*\{[^}]*feature:\s*'NOTIFICACOES'/);
    expect(fonte).toMatch(/if \(guard\.feature && !featureAtiva\(guard\.feature\)\) return false;\s*\n\s*if \(guard\.sempre\) return true;/);
  });

  it('POSITIVO: com a flag LIGADA a superfície volta para quem tem papel', async () => {
    /* Sem este controle, um teste que só afirma ausência passaria com a feature apagada do
       produto — e "sempre indisponível" não é o que a decisão de escopo pediu. Ela pediu
       DIFERIDA: fora deste release, de volta virando uma variável. */
    vi.resetModules();
    vi.doMock('../../lib/featureFlags.js', () => ({
      FLAGS: { METRIC_HUBS: false, GOOGLE_REVIEWS: false, NOTIFICACOES: true },
      featureAtiva: (nome) => (nome === 'NOTIFICACOES' ? true : nome !== 'METRIC_HUBS' && nome !== 'GOOGLE_REVIEWS'),
    }));
    const { buildNavigation: comFlag } = await import('../navigation.js');
    const nav = comFlag(funcPleno);
    const todos = [...nav.primary, ...nav.moreGroups.flatMap((g) => g.itens)].map((d) => d.to);
    expect(todos).toContain('/configuracao/notificacoes');
    vi.doUnmock('../../lib/featureFlags.js');
    vi.resetModules();
  });

  /**
   * CONTROLE DERIVADO — o que teria pego o furo sem ninguém precisar lembrar.
   *
   * O vazamento existiu porque a cobertura das flags foi conferida item a item: duas entradas de
   * /avaliacoes receberam o guard e a de notificações passou. Revisão manual não escala e não
   * repete. Este controle deriva a exigência das ROTAS: toda rota que App.jsx envolve em
   * `featureAtiva('X')` obriga toda entrada de navegação que aponta para ela a carregar
   * `feature: 'X'`.
   *
   * O parser vem do `surface-registry`, que já lê `App.jsx` para o inventário de release. Escrever
   * um segundo regex aqui criaria duas leituras da mesma verdade, livres para divergir.
   */
  it('DERIVADO: toda rota sob flag exige guard de feature na navegação', async () => {
    const { rotasDoRouter } = await import(
      '../../../../tools/admai-delivery/surface-registry.mjs'
    );
    const fonte = readFileSync(NAVEGACAO, 'utf8');

    const sobFlag = rotasDoRouter().filter((r) => r.flag);
    expect(sobFlag.length, 'nenhuma rota sob flag — o controle ficaria vazio').toBeGreaterThan(0);

    const faltando = [];
    for (const { rota, flag } of sobFlag) {
      let i = fonte.indexOf(`to: '${rota}'`);
      while (i !== -1) {
        const daEntrada = fonte.slice(i);
        const guard = daEntrada.slice(daEntrada.indexOf('guard:'), daEntrada.indexOf('guard:') + 200)
          .match(/guard:\s*\{([^}]*)\}/)?.[1] ?? '';
        if (!guard.includes(`feature: '${flag}'`)) faltando.push(`${rota} (esperava ${flag})`);
        i = fonte.indexOf(`to: '${rota}'`, i + 1);
      }
    }
    expect(faltando).toEqual([]);
  });

  it('DERIVADO: a rota de Notificações está mesmo sob flag em App.jsx', async () => {
    /* NAV_HIDDEN != FEATURE_HIDDEN. Esconder o item de menu sem remover a rota deixaria a
       superfície a um Ctrl+L de distância. */
    const { rotasDoRouter } = await import(
      '../../../../tools/admai-delivery/surface-registry.mjs'
    );
    const rota = rotasDoRouter().find((r) => r.rota === '/configuracao/notificacoes');
    expect(rota?.flag).toBe('NOTIFICACOES');
  });
});
