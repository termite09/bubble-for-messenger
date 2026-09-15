const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/main/**/*.js', 'src/lib/**/*.js', 'test/**/*.js', '*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // The pages: browsers, plus what each preload puts on window.
    files: ['src/renderer/*-renderer.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, bubbleApi: 'readonly', settingsApi: 'readonly', shieldApi: 'readonly', dismissApi: 'readonly' } },
  },
  {
    files: ['src/renderer/*-preload.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.browser, ...globals.node } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
