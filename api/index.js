/**
 * Vercel Serverless Function & Node API Entrypoint for TiDB Cloud
 * Serves /api on Vercel and Node serverless deployments
 */

import { handleApiRequest } from '../server/apiHandler.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    let body = req.body;
    if (!body && (req.method === 'POST' || req.method === 'PUT')) {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const raw = Buffer.concat(buffers).toString('utf-8');
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch (_) {
          body = {};
        }
      }
    } else if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        body = {};
      }
    }
    body = body || {};

    const urlAction = req.query?.action;
    const bodyAction = body.action;
    const action = urlAction || bodyAction || (req.method === 'GET' ? 'ping' : 'ping');

    const result = await handleApiRequest(action, body);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
}
