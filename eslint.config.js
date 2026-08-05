import js from '@eslint/js';

const node = {
  process: 'readonly', __dirname: 'readonly', __filename: 'readonly', module: 'writable',
  require: 'readonly', exports: 'writable', Buffer: 'readonly', console: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
};
const browser = {
  window: 'readonly', document: 'readonly', localStorage: 'readonly', fetch: 'readonly',
  location: 'readonly', console: 'readonly', FormData: 'readonly', confirm: 'readonly', alert: 'readonly',
  setTimeout: 'readonly', URLSearchParams: 'readonly',
};

export default [
  js.configs.recommended,
  { ignores: ['**/dist/**', '**/node_modules/**', 'server/public/**', 'db/**/*.sql', 'db/seed*.sql'] },
  {
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], 'no-empty': 'off' },
  },
  {
    files: ['server/**/*.js', 'db/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: node },
  },
  {
    files: ['server/test/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...node } },
  },
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: { sourceType: 'module', ecmaVersion: 2023, parserOptions: { ecmaFeatures: { jsx: true } }, globals: browser },
    rules: { 'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }] },
  },
];
