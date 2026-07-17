import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field } from '../Field.jsx';

describe('Field', () => {
  it('associa label, ajuda e erro ao controle', async () => {
    const user = userEvent.setup();
    render(
      <Field
        label="E-mail"
        name="email"
        hint="Use o e-mail da empresa"
        error="Informe um e-mail válido"
        required
      />
    );

    const input = screen.getByLabelText(/e-mail/i);
    await user.click(input.labels[0]);
    expect(input).toHaveFocus();
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Use o e-mail da empresa Informe um e-mail válido');
  });

  it('gera IDs únicos e encaminha propriedades e ref', () => {
    const ref = createRef();
    render(
      <>
        <Field ref={ref} label="Nome" readOnly value="Ana" onChange={() => {}} />
        <Field label="Telefone" disabled />
      </>
    );

    const name = screen.getByLabelText('Nome');
    const phone = screen.getByLabelText('Telefone');
    expect(name.id).not.toBe(phone.id);
    expect(name).toBe(ref.current);
    expect(name).toHaveAttribute('readonly');
    expect(phone).toBeDisabled();
  });

  it('preserva o elemento semântico solicitado', () => {
    render(
      <Field as="select" label="Papel" defaultValue="gestor">
        <option value="gestor">Gestor</option>
      </Field>
    );

    expect(screen.getByRole('combobox', { name: 'Papel' })).toHaveValue('gestor');
  });

  it('pode anunciar um erro que aparece depois da submissão', () => {
    const { rerender } = render(<Field id="documento" label="Documento" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(
      <Field id="documento" label="Documento" error="Informe um documento válido" announceError />
    );

    const input = screen.getByLabelText('Documento');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Informe um documento válido');
    expect(input).not.toHaveAttribute('aria-errormessage');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
    expect(input).toHaveAccessibleDescription('Informe um documento válido');
  });
});
