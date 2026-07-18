import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormPersist } from '../useFormPersist.js';

// F8: cobertura direta do hook de rascunho (antes só exercido de forma indireta).
const KEY = 'admai_test_form';
const inicial = { nome: '', valor: '' };

describe('useFormPersist (F8)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('inicializa com os valores iniciais quando não há rascunho salvo', () => {
    const { result } = renderHook(() => useFormPersist(KEY, inicial));
    expect(result.current[0]).toEqual(inicial);
  });

  it('hidrata do localStorage fazendo merge com os iniciais', () => {
    localStorage.setItem(KEY, JSON.stringify({ nome: 'Ana' }));
    const { result } = renderHook(() => useFormPersist(KEY, inicial));
    expect(result.current[0]).toEqual({ nome: 'Ana', valor: '' });
  });

  it('ignora JSON inválido salvo (cai para os iniciais)', () => {
    localStorage.setItem(KEY, '{invalido');
    const { result } = renderHook(() => useFormPersist(KEY, inicial));
    expect(result.current[0]).toEqual(inicial);
  });

  it('persiste (debounced) e clear() remove a chave e reseta', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFormPersist(KEY, inicial));

    act(() => result.current[1]({ nome: 'Bia', valor: '10' }));
    expect(localStorage.getItem(KEY)).toBeNull(); // debounce ainda não disparou

    act(() => vi.advanceTimersByTime(300));
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ nome: 'Bia', valor: '10' });

    act(() => result.current[2]()); // clear
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(result.current[0]).toEqual(inicial);
  });
});
