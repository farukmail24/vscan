/**
 * Backend API Client for TiDB Cloud Database
 * Communicates with the TiDB Cloud API endpoints (/api or api/index.php)
 */

import { getSettings } from './settings.js';

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Resolves the API endpoint URL intelligently:
 * Works in Vite dev (port 3000), Apache/XAMPP subpath (/vscan/api), or remote hosting.
 */
function getEndpointUrl() {
  const settings = getSettings();
  const configured = (settings.apiUrl || '/api').trim();

  // If already absolute URL (e.g. http://...)
  if (/^https?:\/\//i.test(configured)) {
    return configured;
  }

  // If running in a subdirectory (e.g. /vscan/ or /vscan/dist/)
  const pathname = window.location.pathname;
  const basePathMatch = pathname.match(/^(\/[^\/]+)/);
  const basePath = basePathMatch ? basePathMatch[1] : '';

  if (basePath && basePath !== '/' && !configured.startsWith(basePath)) {
    return `${basePath.replace(/\/+$/, '')}/${configured.replace(/^\/+/, '')}`;
  }

  return configured;
}

/**
 * Universal caller to the TiDB backend API
 * @param {string} action - 'ping' | 'extract' | 'checkDuplicate' | 'save' | 'update' | 'listCards' | 'deleteCard' | 'getKnowledge'
 * @param {object} payload - action parameters
 * @returns {Promise<any>}
 */
export async function callBackend(action, payload = {}) {
  const settings = getSettings();
  let url = getEndpointUrl();

  if (!navigator.onLine) {
    throw new Error('Device is currently offline. Please check your internet connection or use Offline Mode.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const bodyData = {
      action,
      geminiApiKey: settings.geminiApiKey || undefined,
      ...payload
    };

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyData),
        signal: controller.signal
      });
    } catch (networkErr) {
      // In XAMPP, if /api fails, attempt automatic fallback to api/index.php
      if (!url.endsWith('.php')) {
        const phpUrl = url.endsWith('/') ? `${url}index.php` : `${url}/index.php`;
        try {
          response = await fetch(phpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData),
            signal: controller.signal
          });
          url = phpUrl;
        } catch (_) {
          throw networkErr;
        }
      } else {
        throw networkErr;
      }
    }

    clearTimeout(timer);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`API endpoint not found (404) at ${url}. Verify backend server is running.`);
      }
      if (response.status === 429) {
        throw new Error('Rate limit or quota exceeded (429). Please try again in a moment.');
      }
      const errText = await response.text();
      try {
        const errObj = JSON.parse(errText);
        throw new Error(errObj.error || `Server returned HTTP ${response.status}`);
      } catch (_) {
        throw new Error(`Server returned HTTP ${response.status}: ${errText.slice(0, 150)}`);
      }
    }

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (parseError) {
      throw new Error(`Invalid JSON from TiDB API: ${text.slice(0, 150)}`);
    }

    if (!result.ok) {
      throw new Error(result.error || 'Unknown backend error occurred');
    }

    return result;
  } catch (err) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      throw new Error('Request timed out (30s). The TiDB Database or AI API took too long to respond.');
    }

    if (err.message && err.message.includes('Failed to fetch')) {
      throw new Error('Network error (Failed to fetch). Verify TiDB backend server is running.');
    }

    throw err;
  }
}

/**
 * Ping TiDB Cloud backend to verify connectivity, latency, and version
 */
export async function pingBackend() {
  return callBackend('ping');
}

/**
 * Call Gemini AI extraction on backend with multi-key failover
 */
export async function extractWithAI(imageBase64, backImageBase64 = null) {
  const settings = getSettings();
  const keys = [
    settings.geminiPrimaryApiKey,
    settings.geminiBackupApiKey,
    ...(settings.geminiApiKeys || [])
  ].filter(Boolean);

  const uniqueKeys = Array.from(new Set(keys.map(k => k.trim()))).filter(Boolean);

  return callBackend('extract', {
    geminiApiKeys: uniqueKeys,
    imageBase64,
    mimeType: 'image/jpeg',
    backImageBase64: backImageBase64 || null,
    backMimeType: backImageBase64 ? 'image/jpeg' : null
  });
}

/**
 * Test Gemini API keys status and model capability
 */
export async function testGeminiKeys(keys = []) {
  return callBackend('testGeminiKeys', { geminiApiKeys: keys });
}

/**
 * Update Gemini API keys in TiDB database
 */
export async function updateGeminiKeys(keys = []) {
  return callBackend('updateGeminiKeys', { keys });
}

/**
 * Check if contacts with the same emails or phones exist in TiDB database
 */
export async function checkDuplicate(emails = [], phones = []) {
  return callBackend('checkDuplicate', { emails, phones });
}

/**
 * Save record and image base64s directly to TiDB Database
 */
export async function saveRecord(record, frontImageBase64 = null, backImageBase64 = null) {
  return callBackend('save', {
    record,
    frontImageBase64,
    backImageBase64
  });
}

/**
 * Update an existing record by ID in TiDB Database
 */
export async function updateRecord(id, record) {
  return callBackend('update', { id, record });
}

/**
 * Retrieve dynamic rules from TiDB table "knowledge_rules"
 */
export async function getKnowledgeRules() {
  return callBackend('getKnowledge');
}

/**
 * Fetch saved cards from TiDB database
 */
export async function listCardsFromDB(search = '', limit = 100) {
  return callBackend('listCards', { search, limit });
}

/**
 * Delete a card from TiDB database
 */
export async function deleteCardFromDB(id) {
  return callBackend('deleteCard', { id });
}
