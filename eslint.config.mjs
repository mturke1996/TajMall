import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'src-tauri/**',
      'dogfood-output/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      'react/no-unescaped-entities': 'off',
      // React Compiler guidance added with eslint-plugin-react-hooks 7. The app does not use the
      // compiler; these flag patterns (resetting a dialog's form when it opens, TanStack Table's
      // mutable instance, hand-written useMemo deps) that are correct today. Kept visible as
      // warnings so new code avoids them; the other compiler rules stay errors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/incompatible-library': 'warn',
    },
  },
];

export default config;
