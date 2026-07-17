import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWidgetPrefs } from '../useWidgetPrefs.js';

const IDS = ['a', 'b', 'c'];
const salvo = () => JSON.parse(localStorage.getItem('admai_dashboard_widgets'));

beforeEach(() => localStorage.clear());

describe('useWidgetPrefs (F4d)', () => {
  it('ordem padrão = ids, sem ocultos', () => {
    const { result } = renderHook(() => useWidgetPrefs(IDS));
    expect(result.current.ordem).toEqual(['a', 'b', 'c']);
    expect([...result.current.ocultos]).toEqual([]);
  });

  it('mover reordena, anuncia e persiste no localStorage', () => {
    const { result } = renderHook(() => useWidgetPrefs(IDS));
    act(() => result.current.mover('b', -1, 'B'));
    expect(result.current.ordem).toEqual(['b', 'a', 'c']);
    expect(result.current.anuncio).toMatch(/posição 1 de 3/);
    expect(salvo().ordem).toEqual(['b', 'a', 'c']);
  });

  it('mover além dos limites não altera a ordem', () => {
    const { result } = renderHook(() => useWidgetPrefs(IDS));
    act(() => result.current.mover('a', -1, 'A'));
    expect(result.current.ordem).toEqual(['a', 'b', 'c']);
  });

  it('alternarVisibilidade oculta/exibe e persiste', () => {
    const { result } = renderHook(() => useWidgetPrefs(IDS));
    act(() => result.current.alternarVisibilidade('c', 'C'));
    expect([...result.current.ocultos]).toContain('c');
    expect(salvo().ocultos).toContain('c');
    act(() => result.current.alternarVisibilidade('c', 'C'));
    expect([...result.current.ocultos]).not.toContain('c');
  });

  it('carrega prefs salvas, ignora ids desconhecidos e acrescenta ids novos ao fim', () => {
    localStorage.setItem(
      'admai_dashboard_widgets',
      JSON.stringify({ ordem: ['c', 'x', 'a'], ocultos: ['b', 'y'] })
    );
    const { result } = renderHook(() => useWidgetPrefs(IDS));
    expect(result.current.ordem).toEqual(['c', 'a', 'b']);
    expect([...result.current.ocultos]).toEqual(['b']);
  });

  it('F8/F7: prefs antigas (só gráficos) + ids novos (ops) → ops entram ao fim, ordem preservada', () => {
    const charts = ['tecnicos', 'local', 'evolucao'];
    localStorage.setItem('admai_dashboard_widgets', JSON.stringify({ ordem: charts, ocultos: [] }));
    const full = [...charts, 'aprovacoes', 'estoque-baixo', 'operacao'];
    const { result } = renderHook(() => useWidgetPrefs(full));
    expect(result.current.ordem).toEqual(full);
    expect([...result.current.ocultos]).toEqual([]);
  });
});
