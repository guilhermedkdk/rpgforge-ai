import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // NestJS resolves its dependencies from the metadata TypeScript emits for decorators, which
  // esbuild (vitest's default transform) does not produce. swc does, so the container can be built.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/testing/global-setup.ts'],
    setupFiles: ['src/testing/setup.ts'],
    // One database, shared: parallel files would truncate each other's rows mid-case.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
