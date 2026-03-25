import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: { modules: { localsConvention: 'camelCase' } },
  test: {
    globals: true,
    css: false,
  },
});
