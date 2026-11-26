import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'development-csp',
    apply: 'serve',
    // Vite injects an inline React refresh preamble during development only.
    // The packaged build keeps the strict policy from index.html.
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    }
  }],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  envPrefix: ['VITE_'],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts'
  }
});
