/**
 * Backend API Client for Google Apps Script Web App
 * Communicates via POST text/plain;charset=utf-8 to eliminate CORS preflight overhead.
 */

import { getSettings } from './settings.js';

const REQUEST_TIMEOUT_MS = 45000;

/**
 * Universal caller to the Google Apps Script backend
 * @param {string} action - 'ping' | 'extract' | 'checkDuplicate' | 'save' | 'update'
 * @param {object} payload - action parameters
 * @returns {Promise<any>}
 */
export async function callBackend(action, payload = {}) {
  const settings = getSettings();
  const url = (settings.appsScriptUrl || '').trim();
  const token = (settings.appToken || '').trim();

  if (!url) {
    throw new Error('Apps Script URL is not configured. Please open Settings and enter the URL.');
  }

  if (!navigator.onLine) {
    throw new Error('Device is currently offline. Please check your internet connection or use Offline Mode.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const bodyData = {
      token,
      action,
      ...payload
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(bodyData),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized: App Token does not match Apps Script APP_TOKEN. Check Settings.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit or quota exceeded (429). Please try again in a moment.');
      }
      throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (parseError) {
      throw new Error(`Invalid JSON from Apps Script backend: ${text.slice(0, 150)}`);
    }

    if (!result.ok) {
      if (result.error === 'unauthorized') {
        throw new Error('Unauthorized: App Token does not match Apps Script APP_TOKEN. Please update Settings.');
      }
      throw new Error(result.error || 'Unknown backend error occurred');
    }

    return result;
  } catch (err) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      throw new Error('Request timed out (45s). The Apps Script or Gemini API took too long to respond.');
    }

    if (err.message && err.message.includes('Failed to fetch')) {
      throw new Error('Network error (Failed to fetch). Verify Apps Script Web App is deployed with Access: "Anyone".');
    }

    throw err;
  }
}

/**
 * Ping backend to verify URL & Token
 */
export async function pingBackend() {
  return callBackend('ping');
}

/**
 * Call Gemini AI extraction on backend
 */
export async function extractWithAI(imageBase64, backImageBase64 = null) {
  return callBackend('extract', {
    imageBase64,
    mimeType: 'image/jpeg',
    backImageBase64: backImageBase64 || null,
    backMimeType: backImageBase64 ? 'image/jpeg' : null
  });
}

/**
 * Check if contacts with the same emails or phones exist in Google Sheet
 */
export async function checkDuplicate(emails = [], phones = []) {
  return callBackend('checkDuplicate', { emails, phones });
}

/**
 * Save record and image base64s to Google Sheet and Drive
 */
export async function saveRecord(record, frontImageBase64 = null, backImageBase64 = null) {
  return callBackend('save', {
    record,
    frontImageBase64,
    backImageBase64
  });
}

/**
 * Update an existing record by ID
 */
export async function updateRecord(id, record) {
  return callBackend('update', { id, record });
}

/**
 * Retrieve dynamic rules from Sheet tab "Rules" for Knowledge Pack
 */
export async function getKnowledgeRules() {
  return callBackend('getKnowledge');
}

