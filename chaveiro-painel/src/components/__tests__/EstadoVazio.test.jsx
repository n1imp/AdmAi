import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EstadoVazio from '../EstadoVazio.jsx';

// Prova que o setup React Testing Library + jsdom funciona.
describe('<EstadoVazio>', () => {
  it('renderiza a mensagem padrão', () => {
    render(<EstadoVazio />);
    expect(screen.getByText('Nenhum dado encontrado')).toBeInTheDocument();
  });

  it('renderiza mensagem e subtítulo customizados', () => {
    render(<EstadoVazio mensagem="Sem serviços" sub="Cadastre o primeiro" />);
    expect(screen.getByText('Sem serviços')).toBeInTheDocument();
    expect(screen.getByText('Cadastre o primeiro')).toBeInTheDocument();
  });

  it('omite o subtítulo quando não informado', () => {
    render(<EstadoVazio mensagem="Vazio" />);
    expect(screen.queryByText('Cadastre o primeiro')).not.toBeInTheDocument();
  });
});
