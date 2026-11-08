import http from 'http';
import { handleApiRequest } from './apiHandler.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Health check / GET ping
  if (url.pathname === '/api' || url.pathname === '/api/ping') {
    if (req.method === 'GET') {
      try {
        const result = await handleApiRequest('ping');
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
      return;
    }
  }

  // Handle POST /api or POST /api/:action
  if (url.pathname.startsWith('/api')) {
    if (req.method === 'POST') {
      let bodyData = '';
      req.on('data', chunk => {
        bodyData += chunk;
      });

      req.on('end', async () => {
        try {
          const parsed = bodyData ? JSON.parse(bodyData) : {};
          const actionFromUrl = url.pathname.replace(/^\/api\/?/, '');
          const action = parsed.action || actionFromUrl || 'ping';

          const result = await handleApiRequest(action, parsed);
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 400, { ok: false, error: err.message });
        }
      });
      return;
    }
  }

  sendJson(res, 404, { ok: false, error: 'Endpoint not found' });
});

server.listen(PORT, () => {
  console.log(`TiDB Backend API server running on http://localhost:${PORT}`);
});
