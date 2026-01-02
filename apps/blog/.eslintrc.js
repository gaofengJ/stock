module.exports = {
  extends: [
    'eslint:recommended',
    'airbnb',
  ],
  ignorePatterns: [
    '/docs/src/nav-config.mts',
    '/docs/src/sidebar-config.mts',
  ],
  rules: {
    'no-unused-vars': 'off',
    'no-plusplus': 'off',
    'no-console': 'off',
    'no-param-reassign': 'off',
    'consistent-return': 'off',
    'no-mixed-operators': 'off',
    'no-continue': 'off',
    'prefer-destructuring': 'off',
    'import/prefer-default-export': 'off',
    'import/no-unresolved': 'off',
    'import/extensions': 'off',
  },
};
