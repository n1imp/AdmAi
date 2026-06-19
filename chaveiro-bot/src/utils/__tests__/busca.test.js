import { describe, it, expect, afterEach } from 'vitest';
import { contemInsensivel, igualInsensivel } from '../busca.js';

const original = process.env.DATABASE_URL;
afterEach(() => {
  process.env.DATABASE_URL = original;
});

describe('busca: filtros textuais por provider', () => {
  it('Postgres → inclui mode:insensitive', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@host:5432/db';
    expect(contemInsensivel('Ana')).toEqual({ contains: 'Ana', mode: 'insensitive' });
    expect(igualInsensivel('Ana')).toEqual({ equals: 'Ana', mode: 'insensitive' });
  });

  it('SQLite (file:) → omite mode (LIKE já é case-insensitive)', () => {
    process.env.DATABASE_URL = 'file:./dev.db';
    expect(contemInsensivel('Ana')).toEqual({ contains: 'Ana' });
    expect(igualInsensivel('Ana')).toEqual({ equals: 'Ana' });
  });
});
