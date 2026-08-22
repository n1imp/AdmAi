import { describe, it, expect } from 'vitest';
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
