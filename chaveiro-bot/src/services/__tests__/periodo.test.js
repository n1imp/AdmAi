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
