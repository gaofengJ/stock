module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'import'],
  extends: [
    'airbnb',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  settings: {
    'import/resolver': {
      alias: {
        map: [
          ['@', './src'],
        ],
        extensions: ['.ts', '.js'],
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'], // 如果是 Typescript 项目，添加 '.ts', '.tsx'
      },
    }
  },
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/prefer-default-export': 'off',
    'class-methods-use-this': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'warn',
    'no-useless-constructor': 'off',
    'no-empty-function': 'off',
    'max-classes-per-file': 'off',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
        pathGroups: [
          {
            pattern: '@/**',
            group: 'internal',
            position: 'before', // 将 @ 的引入放在 parent (..) 之前
          },
        ],
        pathGroupsExcludedImportTypes: ['builtin', 'external'], // 确保 builtin 和 external 总是在最前面
      },
    ],
    'no-console': [
      'error',
      {
        allow: ['info', 'error']
      }
    ]
  },
};
