import { pool, testConnection } from './db.js';

/**
 * Normalizes phone numbers for duplicate detection (e.g. +88017... -> 017...)
 */
function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+880')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('880')) {
    cleaned = '0' + cleaned.slice(3);
  }
  return cleaned;
}

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DEFAULT_GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2
].filter(Boolean);

function maskApiKey(key) {
  if (!key || key.length < 8) return '***';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/**
 * Retrieve Gemini keys from payload, DB, or defaults
 */
async function resolveGeminiKeys(payload = {}) {
  let keys = [];

  if (Array.isArray(payload.geminiApiKeys) && payload.geminiApiKeys.length > 0) {
    keys = payload.geminiApiKeys;
  } else if (payload.geminiApiKey) {
    keys = [payload.geminiApiKey];
  } else {
    try {
      const [rows] = await pool.query(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'gemini_api_keys'"
      );
      if (rows.length > 0 && rows[0].setting_value) {
        const parsed = JSON.parse(rows[0].setting_value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          keys = parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read gemini_api_keys from database:', e.message);
    }
  }

  if (keys.length === 0 && process.env.GEMINI_API_KEY) {
    keys = [process.env.GEMINI_API_KEY];
  }

  if (keys.length === 0) {
    keys = [...DEFAULT_GEMINI_KEYS];
  }

  // Deduplicate and trim
  const cleanKeys = [];
  const seen = new Set();
  for (const k of keys) {
    const trimmed = String(k || '').trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      cleanKeys.push(trimmed);
    }
  }

  return cleanKeys.length > 0 ? cleanKeys : DEFAULT_GEMINI_KEYS;
}

/**
 * Test each key to verify connection and model support
 */
async function handleTestGeminiKeys(payload = {}) {
  const keys = await resolveGeminiKeys(payload);
  const results = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const candidateModels = ['gemini-2.5-flash', 'gemini-3.8-flash'];
    let success = false;
    let errorDetail = '';
    let workingModel = '';

    for (const model of candidateModels) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Ping' }] }]
          }),
          signal: controller.signal
        });
        clearTimeout(timer);

        if (res.ok) {
          success = true;
          workingModel = model;
          break;
        } else {
          const txt = await res.text();
          let msg = `HTTP ${res.status}`;
          try {
            const parsed = JSON.parse(txt);
            if (parsed.error?.message) msg += `: ${parsed.error.message}`;
          } catch (_) {
            msg += `: ${txt.slice(0, 100)}`;
          }
          errorDetail = msg;
        }
      } catch (err) {
        clearTimeout(timer);
        errorDetail = err.message;
      }
    }

    results.push({
      index: i,
      maskedKey: maskApiKey(key),
      valid: success,
      workingModel: workingModel || null,
      error: success ? null : errorDetail
    });
  }

  return { ok: true, results };
}

/**
 * Update Gemini keys stored in TiDB app_settings table
 */
async function handleUpdateGeminiKeys(payload = {}) {
  const keys = Array.isArray(payload.keys)
    ? payload.keys.map(k => String(k || '').trim()).filter(Boolean)
    : [];
  if (keys.length === 0) {
    throw new Error('At least one Gemini API key is required');
  }

  await pool.query(
    'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    ['gemini_api_keys', JSON.stringify(keys)]
  );

  return {
    ok: true,
    count: keys.length,
    message: `${keys.length} API keys successfully saved to TiDB database!`
  };
}

/**
 * Handle Gemini AI extraction via direct REST API with Multi-Key Failover
 */
async function handleExtract(payload) {
  const keys = await resolveGeminiKeys(payload);
  if (keys.length === 0) {
    throw new Error('No Gemini API keys configured.');
  }

  const imageParts = [];
  if (payload.imageBase64) {
    const cleanFront = payload.imageBase64.replace(/^data:[^;]+;base64,/, '');
    imageParts.push({
      inline_data: {
        mime_type: payload.mimeType || 'image/jpeg',
        data: cleanFront
      }
    });
  }

  if (payload.backImageBase64) {
    const cleanBack = payload.backImageBase64.replace(/^data:[^;]+;base64,/, '');
    imageParts.push({
      inline_data: {
        mime_type: payload.backMimeType || 'image/jpeg',
        data: cleanBack
      }
    });
  }

  const promptText = `Extract contact information from this business card accurately.
Return ONLY valid JSON matching this schema:
{
  "name": "Full name of the person or null",
  "designation": "Job title or designation or null",
  "company": "Company, organization, or store name or null",
  "phones": ["Phone numbers with country code if available"],
  "emails": ["Valid email addresses"],
  "websites": ["Websites or URLs"],
  "address": "Physical street address or office location or null",
  "notes": "Any other key information (products, services, slogan) or null",
  "uncertain_fields": ["List of field names where text was blurry, ambiguous or uncertain"]
}`;

  const body = {
    contents: [
      {
        parts: [
          { text: promptText },
          ...imageParts
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: 'application/json'
    }
  };

  const keyErrors = [];
  let successfulData = null;
  let usedKeyIndex = -1;
  let usedModel = '';

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    const candidateModels = ['gemini-2.5-flash', 'gemini-3.8-flash'];
    let keySucceeded = false;

    for (const model of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timer);

        if (response.ok) {
          const resData = await response.json();
          const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            successfulData = JSON.parse(text);
            usedKeyIndex = i;
            usedModel = model;
            keySucceeded = true;
            break;
          }
        } else {
          const errText = await response.text();
          let errMsg = `Status ${response.status}`;
          try {
            const errJson = JSON.parse(errText);
            if (errJson.error?.message) errMsg += ` (${errJson.error.message})`;
          } catch (_) {
            errMsg += `: ${errText.slice(0, 100)}`;
          }

          if (response.status === 429 || response.status === 403) {
            keyErrors.push(`Key #${i + 1} (${maskApiKey(apiKey)}) hit quota/rate limit [${errMsg}]. Switching to next key.`);
            break; // Move to next key immediately
          } else {
            keyErrors.push(`Key #${i + 1} (${maskApiKey(apiKey)}) with ${model}: ${errMsg}`);
          }
        }
      } catch (fetchErr) {
        clearTimeout(timer);
        keyErrors.push(`Key #${i + 1} (${maskApiKey(apiKey)}) network error: ${fetchErr.message}`);
      }
    }

    if (keySucceeded) {
      break;
    }
  }

  if (!successfulData) {
    throw new Error(
      `All ${keys.length} Gemini API keys failed or exceeded quota:\n` + keyErrors.join('\n')
    );
  }

  return {
    ok: true,
    usedKeyIndex,
    usedKeyMasked: maskApiKey(keys[usedKeyIndex]),
    keySwitched: usedKeyIndex > 0,
    usedModel,
    data: {
      name: successfulData.name || null,
      designation: successfulData.designation || null,
      company: successfulData.company || null,
      phones: Array.isArray(successfulData.phones) ? successfulData.phones : [],
      emails: Array.isArray(successfulData.emails) ? successfulData.emails : [],
      websites: Array.isArray(successfulData.websites) ? successfulData.websites : [],
      address: successfulData.address || null,
      notes: successfulData.notes || null,
      uncertain_fields: Array.isArray(successfulData.uncertain_fields) ? successfulData.uncertain_fields : []
    }
  };
}

/**
 * Handle Duplicate Contact Checking against TiDB cards table
 */
async function handleCheckDuplicate(payload) {
  const emails = (payload.emails || []).map(e => String(e).trim().toLowerCase()).filter(Boolean);
  const phones = (payload.phones || []).map(normalizePhone).filter(Boolean);

  if (emails.length === 0 && phones.length === 0) {
    return { ok: true, duplicates: [] };
  }

  const conditions = [];
  const params = [];

  if (emails.length > 0) {
    conditions.push(`LOWER(email) IN (${emails.map(() => '?').join(',')})`);
    params.push(...emails);
  }

  if (phones.length > 0) {
    for (const p of phones) {
      conditions.push(`(phone1 LIKE ? OR phone2 LIKE ?)`);
      params.push(`%${p}%`, `%${p}%`);
    }
  }

  const query = `
    SELECT id, name, company, email, phone1, phone2
    FROM cards
    WHERE ${conditions.join(' OR ')}
    LIMIT 10;
  `;

  const [rows] = await pool.query(query, params);

  const duplicates = rows.map(r => {
    let reason = 'Matched existing contact';
    if (emails.includes((r.email || '').toLowerCase())) {
      reason = `Email matched (${r.email})`;
    } else {
      reason = `Phone matched (${r.phone1 || r.phone2})`;
    }
    return {
      id: r.id,
      name: r.name,
      company: r.company,
      email: r.email,
      phone1: r.phone1,
      reason
    };
  });

  return { ok: true, duplicates };
}

/**
 * Save record to TiDB (Idempotent: INSERT ... ON DUPLICATE KEY UPDATE)
 */
async function handleSave(payload) {
  const record = payload.record;
  if (!record || !record.id) {
    throw new Error('Record with UUID id is required');
  }

  const timestamp = record.timestamp || new Date().toISOString();
  const phones = Array.isArray(record.phones) ? record.phones : [];
  const phone1 = phones[0] || record.phone1 || '';
  const phone2 = phones[1] || record.phone2 || '';
  const email = Array.isArray(record.emails) ? record.emails[0] : (record.email || '');
  const website = Array.isArray(record.websites) ? record.websites[0] : (record.website || '');
  const tags = Array.isArray(record.tags) ? record.tags.join(', ') : (record.tags || '');

  const frontImage = payload.frontImageBase64 || record.frontImageUrl || record.frontBase64 || null;
  const backImage = payload.backImageBase64 || record.backImageUrl || record.backBase64 || null;
  const needsReview = record.needsReview ? 1 : 0;

  const query = `
    INSERT INTO cards (
      id, timestamp, name, designation, company,
      phone1, phone2, email, website, address,
      notes, tags, front_image, back_image,
      source, needs_review, scanned_by
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    ) ON DUPLICATE KEY UPDATE
      timestamp = VALUES(timestamp),
      name = VALUES(name),
      designation = VALUES(designation),
      company = VALUES(company),
      phone1 = VALUES(phone1),
      phone2 = VALUES(phone2),
      email = VALUES(email),
      website = VALUES(website),
      address = VALUES(address),
      notes = VALUES(notes),
      tags = VALUES(tags),
      front_image = COALESCE(VALUES(front_image), front_image),
      back_image = COALESCE(VALUES(back_image), back_image),
      source = VALUES(source),
      needs_review = VALUES(needs_review),
      scanned_by = VALUES(scanned_by);
  `;

  const values = [
    record.id,
    timestamp,
    record.name || '',
    record.designation || '',
    record.company || '',
    phone1,
    phone2,
    email,
    website,
    record.address || '',
    record.notes || '',
    tags,
    frontImage,
    backImage,
    record.source || 'AI',
    needsReview,
    record.scannedBy || ''
  ];

  await pool.query(query, values);

  return {
    ok: true,
    id: record.id,
    frontImageUrl: frontImage ? 'saved_to_db' : null,
    backImageUrl: backImage ? 'saved_to_db' : null,
    database: 'TiDB Cloud (test.cards)'
  };
}

/**
 * Update an existing record
 */
async function handleUpdate(payload) {
  const { id, record } = payload;
  if (!id || !record) {
    throw new Error('id and record are required');
  }

  const fields = [];
  const values = [];

  const fieldMap = {
    name: record.name,
    designation: record.designation,
    company: record.company,
    address: record.address,
    notes: record.notes,
    tags: Array.isArray(record.tags) ? record.tags.join(', ') : record.tags,
    scanned_by: record.scannedBy
  };

  if (record.phones && Array.isArray(record.phones)) {
    fieldMap.phone1 = record.phones[0] || '';
    fieldMap.phone2 = record.phones[1] || '';
  }
  if (record.emails && Array.isArray(record.emails)) {
    fieldMap.email = record.emails[0] || '';
  }
  if (record.websites && Array.isArray(record.websites)) {
    fieldMap.website = record.websites[0] || '';
  }
  if (typeof record.needsReview !== 'undefined') {
    fieldMap.needs_review = record.needsReview ? 1 : 0;
  }

  for (const [key, val] of Object.entries(fieldMap)) {
    if (typeof val !== 'undefined') {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }

  if (fields.length === 0) {
    return { ok: true, id, message: 'No fields to update' };
  }

  values.push(id);
  const query = `UPDATE cards SET ${fields.join(', ')} WHERE id = ?`;
  await pool.query(query, values);

  return { ok: true, id, updated: true };
}

/**
 * List cards stored in TiDB
 */
async function handleListCards(payload = {}) {
  const limit = Math.min(parseInt(payload.limit || '100', 10), 500);
  const search = (payload.search || '').trim().toLowerCase();

  let query = `
    SELECT id, timestamp, name, designation, company, phone1, phone2,
           email, website, address, notes, tags, source, needs_review, scanned_by,
           created_at, updated_at
    FROM cards
  `;
  const params = [];

  if (search) {
    query += `
      WHERE LOWER(name) LIKE ? OR LOWER(company) LIKE ?
         OR LOWER(designation) LIKE ? OR phone1 LIKE ? OR phone2 LIKE ?
         OR LOWER(email) LIKE ?
    `;
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard, wildcard, wildcard, wildcard, wildcard);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const [rows] = await pool.query(query, params);

  const cards = rows.map(r => ({
    id: r.id,
    record: {
      id: r.id,
      timestamp: r.timestamp,
      name: r.name,
      designation: r.designation,
      company: r.company,
      phones: [r.phone1, r.phone2].filter(Boolean),
      emails: [r.email].filter(Boolean),
      websites: [r.website].filter(Boolean),
      address: r.address,
      notes: r.notes,
      tags: r.tags ? r.tags.split(',').map(t => t.trim()) : [],
      source: r.source,
      needsReview: Boolean(r.needs_review),
      scannedBy: r.scanned_by
    },
    source: r.source,
    status: 'synced',
    createdAt: r.created_at
  }));

  return { ok: true, cards, count: cards.length };
}

/**
 * Delete a card from TiDB
 */
async function handleDeleteCard(payload) {
  const id = payload.id;
  if (!id) throw new Error('Card id is required');
  await pool.query('DELETE FROM cards WHERE id = ?', [id]);
  return { ok: true, id, deleted: true };
}

/**
 * Get knowledge rules from TiDB
 */
async function handleGetKnowledge() {
  const [rows] = await pool.query('SELECT type, value, extra FROM knowledge_rules ORDER BY id ASC');
  return { ok: true, rules: rows, count: rows.length };
}

/**
 * Add a knowledge rule to TiDB
 */
async function handleAddKnowledgeRule(payload) {
  const { type, value, extra } = payload;
  if (!type || !value) throw new Error('Rule type and value are required');
  await pool.query(
    'INSERT INTO knowledge_rules (type, value, extra) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE extra = VALUES(extra)',
    [type, value, extra || '']
  );
  return { ok: true, type, value };
}

/**
 * Central API Request Dispatcher
 */
export async function handleApiRequest(action, payload = {}) {
  switch (action) {
    case 'ping':
      return testConnection();

    case 'save':
      return handleSave(payload);

    case 'update':
      return handleUpdate(payload);

    case 'checkDuplicate':
      return handleCheckDuplicate(payload);

    case 'listCards':
    case 'getCards':
      return handleListCards(payload);

    case 'deleteCard':
      return handleDeleteCard(payload);

    case 'getKnowledge':
      return handleGetKnowledge();

    case 'addKnowledgeRule':
      return handleAddKnowledgeRule(payload);

    case 'extract':
      return handleExtract(payload);

    case 'testGeminiKeys':
      return handleTestGeminiKeys(payload);

    case 'updateGeminiKeys':
      return handleUpdateGeminiKeys(payload);

    default:
      throw new Error(`Unknown API action: "${action}"`);
  }
}
