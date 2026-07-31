import { describe, it, expect } from 'vitest';
import {
  construirFiltroPeriodo,
  construirFiltroPeriodoAnterior,
  agruparReceitaPorDia,
  dataValida,
} from '../periodo.js';

// F9/M1: helpers de período compartilhados por /dashboard e /me/metricas.
describe('periodo', () => {
  it('hoje: gte à meia-noite, lte ao fim do dia', () => {
    const f = construirFiltroPeriodo('hoje');
    expect(f.gte.getHours()).toBe(0);
    expect(f.gte.getMinutes()).toBe(0);
    expect(f.lte.getHours()).toBe(23);
  });

  it('mes: gte no primeiro dia do mês corrente', () => {
    const f = construirFiltroPeriodo('mes');
    expect(f.gte.getDate()).toBe(1);
    expect(f.gte.getMonth()).toBe(new Date().getMonth());
  });

  it('semana: gte no domingo da semana atual', () => {
    const f = construirFiltroPeriodo('semana');
    expect(f.gte.getDay()).toBe(0);
  });

  it('custom com inicio e fim válidos', () => {
    const f = construirFiltroPeriodo('custom', '2026-01-01', '2026-01-31');
    expect(dataValida(f.gte)).toBe(true);
    expect(dataValida(f.lte)).toBe(true);
    expect(f.gte.getTime()).toBeLessThan(f.lte.getTime());
  });

  // B3: `inicio` era lido como UTC e `fim` recebia 'T23:59:59.999Z' fixo. Em BRT (UTC-3)
  // isso deslocava a janela em 3h: incluía a noite do dia anterior ao início e EXCLUÍA
  // tudo entre 21h e 23h59 do último dia — justamente o horário de trabalho do negócio,
  // e o número que sai no PDF de fechamento financeiro.
  it('custom: cobre o dia inteiro em horário LOCAL, das 00:00 às 23:59', () => {
    const f = construirFiltroPeriodo('custom', '2026-07-01', '2026-07-31');
    expect(f.gte.getFullYear()).toBe(2026);
    expect(f.gte.getMonth()).toBe(6); // julho
    expect(f.gte.getDate()).toBe(1);
    expect(f.gte.getHours()).toBe(0);
    expect(f.gte.getMinutes()).toBe(0);

    expect(f.lte.getDate()).toBe(31);
    expect(f.lte.getHours()).toBe(23);
    expect(f.lte.getMinutes()).toBe(59);
  });

  it('custom: serviço às 23h do último dia entra no período (regressão B3)', () => {
    const f = construirFiltroPeriodo('custom', '2026-07-01', '2026-07-31');
    const servicoTarde = new Date(2026, 6, 31, 23, 0, 0); // 31/07 23:00 local
    expect(servicoTarde.getTime()).toBeLessThanOrEqual(f.lte.getTime());
    expect(servicoTarde.getTime()).toBeGreaterThanOrEqual(f.gte.getTime());
  });

  it('custom: não vaza para o dia anterior ao início (regressão B3)', () => {
    const f = construirFiltroPeriodo('custom', '2026-07-01', '2026-07-31');
    const vesperaTarde = new Date(2026, 5, 30, 22, 0, 0); // 30/06 22:00 local
    expect(vesperaTarde.getTime()).toBeLessThan(f.gte.getTime());
  });

  it('custom: formato inesperado cai no fallback em vez de filtro inválido', () => {
    // Antes, um ISO completo em `fim` virava Invalid Date e o filtro colapsava em silêncio.
    const f = construirFiltroPeriodo('custom', '2026-07-01T10:00:00Z', 'lixo');
    expect(dataValida(f.gte)).toBe(true);
    expect(dataValida(f.lte)).toBe(true);
    expect(f.gte.getTime()).toBeLessThan(f.lte.getTime());
  });

  it('custom sem datas → cai no último mês', () => {
    const f = construirFiltroPeriodo('custom');
    expect(dataValida(f.gte)).toBe(true);
    expect(f.gte.getTime()).toBeLessThan(f.lte.getTime());
  });

  it('período anterior: mesma duração, termina antes do atual', () => {
    const atual = {
      gte: new Date('2026-02-01T00:00:00Z'),
      lte: new Date('2026-02-28T23:59:59Z'),
    };
    const ant = construirFiltroPeriodoAnterior(atual);
    expect(ant.lte.getTime()).toBeLessThan(atual.gte.getTime());
    const durAtual = atual.lte.getTime() - atual.gte.getTime();
    const durAnt = ant.lte.getTime() - ant.gte.getTime();
    expect(Math.abs(durAnt - durAtual)).toBeLessThanOrEqual(1);
  });

  it('agruparReceitaPorDia soma receita e comissão por dia, ordenado', () => {
    const servicos = [
      { criadoEm: '2026-01-02T10:00:00Z', valorLiquido: 100, comissaoGerada: 30 },
      { criadoEm: '2026-01-02T15:00:00Z', valorLiquido: 50, comissaoGerada: 10 },
      { criadoEm: '2026-01-01T09:00:00Z', valorLiquido: 200, comissaoGerada: 60 },
    ];
    expect(agruparReceitaPorDia(servicos)).toEqual([
      { data: '2026-01-01', receita: 200, comissao: 60, servicos: 1 },
      { data: '2026-01-02', receita: 150, comissao: 40, servicos: 2 },
    ]);
  });
});
