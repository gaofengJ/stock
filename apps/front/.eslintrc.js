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
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  rules: { // 在这里可以添加或覆盖规则
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': ['error', { extensions: ['.jsx', '.tsx'] }], // 控制哪些文件扩展名可以包含 JSX 语法
  },
  // extends: 'next/core-web-vitals',
};
