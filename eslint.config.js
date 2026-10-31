// ESLint attrape les vrais bugs ; le typage est déjà vérifié par `npm run typecheck` (tsc strict).
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'server/db/migrations/**', 'test/scratch/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-undef': 'off', // tsc s'en charge
      // un import de valeur là où un type suffit ferait entrer du code serveur (Zod…) dans le bundle client
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
