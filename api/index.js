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
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {}
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
