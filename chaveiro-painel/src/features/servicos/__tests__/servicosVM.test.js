import { describe, it, expect } from 'vitest';
import { statusVM, servicoVM, proximaAcao, STATUS_VM } from '../servicosVM.js';

describe('servicosVM — tradução domínio→produto (glossário)', () => {
  it('status de domínio recebem os rótulos canônicos; `pendente` cru nunca vaza', () => {
    expect(statusVM('pendente')).toEqual({
      rotulo: 'Aguardando aprovação',
      semantica: 'attention',
    });
    expect(statusVM('ativo')).toEqual({ rotulo: 'Aprovado', semantica: 'success' });
    expect(statusVM('rejeitado')).toEqual({ rotulo: 'Rejeitado', semantica: 'danger' });
    for (const vm of Object.values(STATUS_VM)) {
      expect(vm.rotulo.toLowerCase()).not.toBe('pendente');
    }
  });

  it('status desconhecido degrada neutro sem quebrar', () => {
    expect(statusVM('status_novo_do_provider')).toEqual({
      rotulo: 'status_novo_do_provider',
      semantica: 'neutral',
    });
  });

  it('servicoVM: dinheiro tabular pelos formatadores centrais; líquido derivado quando ausente', () => {
    const vm = servicoVM({
      id: 7,
      descricao: 'Troca de segredo',
      local: 'Oficina',
      status: 'pendente',
      valorCobrado: 380,
      valorMaterial: 120,
      criadoEm: '2026-08-28T12:00:00Z',
    });
    expect(vm.cobradoRotulo.replace(/ /g, ' ')).toBe('R$ 380,00');
    expect(vm.liquidoRotulo.replace(/ /g, ' ')).toBe('R$ 260,00');
    expect(vm.status.rotulo).toBe('Aguardando aprovação');
  });

  it('proximaAcao: pendente + permissão de aprovar → Revisar; sem permissão → nenhuma', () => {
    const pode = (m, a) => m === 'aprovacoes' && a === 'aprovar';
    expect(proximaAcao({ status: 'pendente' }, pode)).toEqual({
      tipo: 'revisar',
      rotulo: 'Revisar aprovação',
    });
    expect(proximaAcao({ status: 'pendente' }, () => false)).toBeNull();
    expect(proximaAcao({ status: 'ativo' }, pode)).toBeNull();
    expect(proximaAcao({ status: 'rejeitado' }, pode)).toBeNull();
  });
});
