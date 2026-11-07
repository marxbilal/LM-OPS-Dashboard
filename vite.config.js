import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev` runs the Netlify functions for sign-in (/api/login) and NetSuite Data Sync (/api/netsuite-sync) with the
// keys in .env, so both work locally without the Netlify CLI. The keys stay in Node, never in the bundle.
function netsuiteDevApi() {
  return {
    name: 'netsuite-dev-api',
    apply: 'serve',
    configureServer(server) {
      for (const [path, file] of [['/api/netsuite-sync', 'netsuite-sync'], ['/api/login', 'login']]) server.middlewares.use(path, async (req, res) => {
        try {
          const { default: handler } = await server.ssrLoadModule(`/netlify/functions/${file}.mjs`);
          const body = req.method === 'POST' || req.method === 'PUT' ? await new Promise((ok) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => ok(d)); }) : undefined;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const r = await handler(new Request(`http://localhost${req.originalUrl}`, { method: req.method, headers, body }));
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await r.text());
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: `Local ${file} failed: ${e.message}` }));
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
