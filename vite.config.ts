import { defineConfig } from 'vite';

export default defineConfig({
  // Served from https://<user>.github.io/hopeless-crusade/ (GitHub Pages project site)
  base: '/hopeless-crusade/',
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/ui/**', 'happy-dom']],
  },
} as never);
