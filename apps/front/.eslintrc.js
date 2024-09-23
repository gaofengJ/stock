module.exports = {
  extends: ['airbnb', 'airbnb/hooks', 'plugin:@typescript-eslint/recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'import'],
  ignorePatterns: ['.eslint.js', '.next', 'node_modules'],
  settings: {
    'import/resolver': {
      alias: {
        map: [
          ['@', './src'],
        ],
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'], // 如果是 Typescript 项目，添加 '.ts', '.tsx'
      },
    },
  },
  rules: { // 在这里可以添加或覆盖规则
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': ['error', { extensions: ['.jsx', '.tsx'] }], // 控制哪些文件扩展名可以包含 JSX 语法
    'import/no-unresolved': 'off',
    'import/extensions': 'off',
    'import/prefer-default-export': 0,
    'no-shadow': 'off',
    'react/function-component-definition': 'off',
    'react/require-default-props': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'no-param-reassign': 'off',
    'max-len': 'off',
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
      'warn',
      {
        allow: ['log', 'error', 'info'],
      },
    ],
  },
  // extends: 'next/core-web-vitals',
};
