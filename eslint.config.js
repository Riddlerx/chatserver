module.exports = [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        // Browser globals for client.js
        document: 'readonly',
        window: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        setTimeout: 'readonly',
        FormData: 'readonly',
        atob: 'readonly',
        NodeFilter: 'readonly',
        io: 'readonly',
        marked: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'error',
      'no-undef': 'error',
    },
  },
];