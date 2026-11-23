import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Three entry points share one code base:
//   /            the public newspaper
//   /newsroom/   staff panel (writers, section leaders)
//   /admin/      admin panel
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: { alias: { '@': r('./src') } },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        site: r('./index.html'),
        newsroom: r('./newsroom/index.html'),
        admin: r('./admin/index.html'),
      },
    },
  },
  test: { environment: 'jsdom', include: ['tests/unit/**/*.test.ts'] },
});
