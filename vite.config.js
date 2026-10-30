import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // Kunci port: localStorage terikat ke URL persis, jadi jika port pindah
    // otomatis data akan terlihat "hilang". 5174 supaya bisa berdampingan
    // dengan InStats (5173) tanpa bentrok dan tanpa berbagi localStorage.
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name][extname]'
      }
    }
  },
})
