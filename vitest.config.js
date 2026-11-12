import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/app/**/*.test.js'], environment: 'node', testTimeout: 60000, hookTimeout: 60000, fileParallelism: false },
  define: { 'import.meta.env.VITE_DATA_SOURCE': JSON.stringify('supabase') },
});
