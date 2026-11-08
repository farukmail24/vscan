import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function tidbApiPlugin() {
  return {
    name: 'tidb-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api')) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
          });
          return res.end();
        }

        if (req.method === 'GET') {
          try {
            const { handleApiRequest } = await import('./server/apiHandler.js');
            const result = await handleApiRequest('ping');
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(500, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const { handleApiRequest } = await import('./server/apiHandler.js');
              const parsed = body ? JSON.parse(body) : {};
              const actionFromUrl = url.pathname.replace(/^\/api\/?/, '');
              const action = parsed.action || actionFromUrl || 'ping';
              const result = await handleApiRequest(action, parsed);
              res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
              });
              res.end(JSON.stringify(result));
            } catch (err) {
              res.writeHead(400, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
              });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  server: {
    port: 3000,
    host: true
  },
  plugins: [
    tidbApiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'tesseract/**/*'],
      manifest: {
        name: 'Card Scanner - Business Card AI & Offline Reader',
        short_name: 'Card Scanner',
        description: 'Scan business cards with Gemini AI or offline OCR and sync to Google Sheets',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024, // 25MB for tesseract assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,gz,traineddata}']
      }
    })
  ],
  test: {
    environment: 'node'
  }
});
