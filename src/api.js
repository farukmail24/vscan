/**
 * Backend API Client for TiDB Cloud Database
 * Communicates with the TiDB Cloud API endpoints (/api or api/index.php)
 * Featuring resilient auto-detecting endpoint discovery for Vite and XAMPP/Apache.
 */

import { getSettings } from './settings.js';

const REQUEST_TIMEOUT_MS = 30000;
let cachedWorkingEndpoint = null;

export function getActiveEndpoint() {
  return cachedWorkingEndpoint;
}

/**
 * Builds candidate endpoint list based on current browser environment (Vite, XAMPP, relative)
 */
export function getCandidateEndpoints() {
  const settings = getSettings();
  const configured = (settings.apiUrl || '').trim();
  const candidates = [];

  // 1. Previously verified working endpoint
  if (cachedWorkingEndpoint) {
    candidates.push(cachedWorkingEndpoint);
  }

  const hostname = window.location.hostname || 'localhost';
  const port = window.location.port;
  const isVite = port === '3000';
  const pathname = window.location.pathname || '';
  const cleanBase = pathname.replace(/\/([^\/]+\.[^\/]+|\/?)$/, '');
  const isCloudHost = hostname.includes('vercel.app') ||
                      hostname.includes('netlify.app') ||
                      hostname.includes('railway.app') ||
                      hostname.includes('render.com') ||
                      hostname.includes('github.io');

  if (isVite || isCloudHost) {
    // Under Vite dev server or Vercel / Cloud serverless hosting
    candidates.push('/api');
    candidates.push(`http://${hostname}:3000/api`);
    if (!isCloudHost) {
      candidates.push(`http://${hostname}/vscan/api/index.php`);
      candidates.push('/vscan/api/index.php');
    }
  } else {
    // Under Apache / XAMPP / Local Production
    candidates.push('/vscan/api/');
    candidates.push('/vscan/api');
    candidates.push('/vscan/php/index.php');
    if (cleanBase) {
      const rootBase = cleanBase.replace(/\/dist\/?$/, '');
      candidates.push(`${rootBase}/api/`);
      candidates.push(`${rootBase}/php/index.php`);
      candidates.push(`${cleanBase}/php/index.php`);
    }
    candidates.push(`http://${hostname}:3000/api`);
    candidates.push('/api');
  }

  // 2. User configured endpoint (if any and custom)
  if (configured && configured !== '/api') {
    candidates.unshift(configured);
  }

  // Deduplicate candidates
  const seen = new Set();
  return candidates.filter(url => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

/**
 * Universal caller to the TiDB backend API with multi-endpoint fallback
 * @param {string} action - 'ping' | 'extract' | 'checkDuplicate' | 'save' | 'update' | 'listCards' | 'deleteCard' | 'getKnowledge'
 * @param {object} payload - action parameters
 * @returns {Promise<any>}
 */
export async function callBackend(action, payload = {}) {
  const settings = getSettings();
  const candidates = getCandidateEndpoints();

  if (!navigator.onLine) {
    throw new Error('Device is currently offline. Please check your internet connection or use Offline Mode.');
  }

  const bodyData = {
    action,
    geminiApiKey: settings.geminiApiKey || undefined,
    ...payload
  };

  const errors = [];

  for (const url of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyData),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (response.ok) {
        const text = await response.text();
        let result;
        try {
          result = JSON.parse(text);
        } catch (_) {
          errors.push(`${url}: Invalid JSON (${text.slice(0, 60)})`);
          continue;
        }

        if (result && result.ok) {
          cachedWorkingEndpoint = url; // Remember working endpoint
          return result;
        } else if (result && result.error) {
          cachedWorkingEndpoint = null;
          throw new Error(result.error);
        }
      } else {
        errors.push(`${url}: HTTP ${response.status}`);
      }
    } catch (err) {
      clearTimeout(timer);
      if (err.name !== 'AbortError') {
        errors.push(`${url}: ${err.message}`);
      }
    }
  }

  cachedWorkingEndpoint = null;
  throw new Error(`Connection to TiDB backend failed across all endpoints:\n` + errors.slice(0, 3).join('\n'));
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
 * Fetch stored Gemini API keys from TiDB database
 */
export async function getGeminiKeysFromBackend() {
  return callBackend('getGeminiKeys');
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
