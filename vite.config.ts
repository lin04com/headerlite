import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 多入口构建：popup / options（HTML）+ background（SW，模块）
// manifest.json 与 images/ 放在 public/，由 Vite 自动拷贝到 dist 根。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
        background: 'src/background/index.ts',
      },
      output: {
        // background.js 固定文件名，供 manifest 稳定引用；其余走哈希
        entryFileNames: (chunk: { name: string }) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
