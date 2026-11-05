import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev` runs netlify/functions/netsuite-sync.mjs at /api/netsuite-sync with the keys in .env,
// so NetSuite Data Sync works locally without the Netlify CLI. The keys stay in Node, never in the bundle.
function netsuiteDevApi() {
  return {
    name: 'netsuite-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/netsuite-sync', async (req, res) => {
        try {
          const { default: handler } = await server.ssrLoadModule('/netlify/functions/netsuite-sync.mjs');
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const r = await handler(new Request(`http://localhost${req.originalUrl}`, { headers }));
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await r.text());
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: `Local NetSuite sync failed: ${e.message}` }));
        }
      });
    },
  };
}

// `npm run build`        -> dist/ for Netlify (functions in netlify/functions)
// `npm run build:single` -> dist-single/index.html, one self-contained file (preview hosting)
export default defineConfig(({ mode, command }) => {
  if (command === 'serve') Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    base: './',
    plugins: mode === 'single' ? [react(), viteSingleFile()] : [react(), netsuiteDevApi()],
    worker: { format: 'es' },
    build: {
      outDir: mode === 'single' ? 'dist-single' : 'dist',
      chunkSizeWarningLimit: 4000,
      sourcemap: false,
    },
  };
});
