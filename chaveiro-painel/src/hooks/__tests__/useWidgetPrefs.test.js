import { describe, it, expect, beforeEach } from 'vitest';
import { StrictMode } from 'react';
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

  // Updaters de estado devem ser PUROS: sob StrictMode o React reexecuta cada updater, e um
  // side effect lá dentro (o antigo setAnuncio/ref) repetiria. Um mover(1x) tem de produzir
  // exatamente 1 swap e o anúncio da posição final — em StrictMode como no app (main.jsx).
  it('StrictMode: mover 1x = 1 swap e anúncio correto (updater puro, sem efeito duplicado)', () => {
    const { result } = renderHook(() => useWidgetPrefs(IDS), { wrapper: StrictMode });
    act(() => result.current.mover('a', 1, 'A'));
    expect(result.current.ordem).toEqual(['b', 'a', 'c']);
    expect(result.current.anuncio).toBe('A movido para a posição 2 de 3.');
    act(() => result.current.alternarVisibilidade('b', 'B'));
    expect([...result.current.ocultos]).toEqual(['b']);
    expect(result.current.anuncio).toBe('B ocultado.');
    expect(salvo()).toEqual({ ordem: ['b', 'a', 'c'], ocultos: ['b'] });
  });
});
