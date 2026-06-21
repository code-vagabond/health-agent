import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  // index.ts carries its own shebang; tsup preserves it and marks the output executable.
});
