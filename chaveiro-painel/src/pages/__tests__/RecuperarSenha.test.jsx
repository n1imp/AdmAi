/**
 * Um componente, três tarefas — e a rota decide qual, EXPLICITAMENTE.  [SL-07]
 *
 * O DEFEITO: /recuperar-senha e /redefinir-senha compartilham o componente e o roteiro era
 * `token ? redefinir : pedido`. Um link de redefinição SEM token (e-mail truncou a URL) caía
 * calado na tela de pedido — trocava a tarefa do usuário sem dizer que o link quebrou.
 *
 * O contrato agora: cada combinação rota×token declara sua tarefa no h1.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RecuperarSenha from '../RecuperarSenha.jsx';

vi.mock('../../lib/api.js', () => ({ default: { post: vi.fn() } }));

afterEach(cleanup);

const montarEm = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/recuperar-senha" element={<RecuperarSenha />} />
        <Route path="/redefinir-senha" element={<RecuperarSenha />} />
      </Routes>
    </MemoryRouter>
  );

describe('RecuperarSenha — roteiro rota×token', () => {
  it('/recuperar-senha sem token: tarefa de PEDIDO', () => {
    montarEm('/recuperar-senha');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/recuperar senha/i);
  });

  it('/redefinir-senha com token: tarefa de REDEFINIÇÃO', () => {
    montarEm('/redefinir-senha?token=abc123');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/nova senha/i);
  });

  it('/redefinir-senha SEM token: estado explícito de link quebrado, nunca a troca silenciosa', () => {
    montarEm('/redefinir-senha');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/link incompleto/i);
    // A saída é pedir OUTRO link — o caminho de recuperação continua a um clique.
    expect(screen.getByRole('link', { name: /pedir novo link/i })).toHaveAttribute(
      'href',
      '/recuperar-senha'
    );
    // E a prova do defeito antigo: o formulário de pedido NÃO está nesta tela.
    expect(screen.queryByRole('heading', { name: /recuperar senha/i })).toBeNull();
  });

  it('/recuperar-senha COM token ainda redefine (deep-link de e-mail antigo não quebra)', () => {
    montarEm('/recuperar-senha?token=abc123');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/nova senha/i);
  });
});
