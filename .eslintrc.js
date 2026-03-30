module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-native/all',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended', // deve ser o último
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  plugins: ['react', 'react-native', '@typescript-eslint', 'prettier'],
  settings: {
    react: {
      version: 'detect', // detecta a versão do React automaticamente
    },
  },
  env: {
    'react-native/react-native': true,
    es2021: true,
    node: true,
  },
  rules: {
    // regras personalizadas podem ser adicionadas aqui
    'prettier/prettier': 'warn', // exibe erros de formatação como aviso
    'react/react-in-jsx-scope': 'off', // não necessário no React 17+
    'react-native/no-raw-text': 'off', // opcional: permite textos sem envolver em <Text>
  },
};
