import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'security/index': 'src/security/index.ts',
    'middleware/index': 'src/middleware/index.ts',
    'errors/index': 'src/errors/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: true,
  target: 'es2022',
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.js' : '.cjs'
    };
  },
  external: [
    'aws-ssl-profiles',
    'express',
    'jsonwebtoken',
    'mysql2',
    'mysql2/promise',
    'picocolors'
  ]
});
