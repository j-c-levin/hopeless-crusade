import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/ui/**', 'happy-dom']],
  },
} as never);
