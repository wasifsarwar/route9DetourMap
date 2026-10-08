import { defineConfig } from 'vitest/config';
import { getRealtime } from './src/realtime/relay';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react(), { name: 'route9-live-dev', configureServer(server) {
    server.middlewares.use('/api/route9-live', async (_request, response) => {
      try { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(await getRealtime())); }
      catch { response.statusCode = 503; response.end('{"error":"Realtime unavailable"}'); }
    });
  } }],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
