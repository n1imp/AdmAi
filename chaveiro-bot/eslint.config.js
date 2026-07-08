import js from '@eslint/js';
import globals from 'globals';

// Globals do Vitest (a maioria dos testes importa de 'vitest', mas garantimos).
const vitestGlobals = {
  describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly',
  beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly',
  vi: 'readonly',
};

export default [
  { ignores: ['node_modules/**', 'prisma/migrations/**', 'coverage/**', 'uploads/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Lenient de propósito: padroniza sem exigir refatorar a base inteira.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
    },
  },
  {
    files: ['**/*.test.js', '**/__tests__/**', 'test/**'],
    languageOptions: { globals: { ...globals.node, ...vitestGlobals } },
  },
];
