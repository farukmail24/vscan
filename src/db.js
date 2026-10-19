/**
 * IndexedDB Local Database (idb)
 * Stores scanned cards for offline queue and persistent history,
 * as well as learned layout assignments per company.
 */

import { openDB } from 'idb';

const DB_NAME = 'CardScannerDB';
const DB_VERSION = 2;

let dbPromise = null;

export function getDB() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // Cards store
        if (!db.objectStoreNames.contains('cards')) {
          const cardStore = db.createObjectStore('cards', { keyPath: 'id' });
          cardStore.createIndex('by-status', 'status');
          cardStore.createIndex('by-createdAt', 'createdAt');
          cardStore.createIndex('by-source', 'source');
        }

        // Company layout memory store (for Step 8 tap-to-assign heuristics)
        if (!db.objectStoreNames.contains('company_layouts')) {
          db.createObjectStore('company_layouts', { keyPath: 'company' });
        }

        // Knowledge pack & learning store (for Step 11 dynamic rules and learning loop)
        if (!db.objectStoreNames.contains('knowledge')) {
          db.createObjectStore('knowledge', { keyPath: 'key' });
        }
      }
    });
  }
  return dbPromise;
}

/**
 * Save or update a card in IndexedDB
 * @param {object} card - { id, record, frontBlob?, backBlob?, frontImageBase64?, backImageBase64?, source, status, createdAt, ocrText, ocrLines }
 */
export async function saveCardLocal(card) {
  const db = await getDB();
  const item = {
    ...card,
    updatedAt: new Date().toISOString()
  };
  await db.put('cards', item);
  return item;
}

/**
 * Get a single card by its UUID
 */
export async function getCardLocal(id) {
  const db = await getDB();
  return db.get('cards', id);
}

/**
 * Retrieve all cards sorted by createdAt descending
 */
export async function getAllCardsLocal() {
  const db = await getDB();
  const all = await db.getAllFromIndex('cards', 'by-createdAt');
  return all.reverse();
}

/**
 * Retrieve all pending cards awaiting sync to Google Sheet
 */
export async function getPendingCards() {
  const db = await getDB();
  return db.getAllFromIndex('cards', 'by-status', 'pending');
}

/**
 * Mark a pending card as synced
 */
export async function markCardSynced(id, updateFields = {}) {
  const db = await getDB();
  const card = await db.get('cards', id);
  if (card) {
    card.status = 'synced';
    card.syncedAt = new Date().toISOString();
    Object.assign(card, updateFields);
    await db.put('cards', card);
  }
}

/**
 * Delete a card by ID
 */
export async function deleteCardLocal(id) {
  const db = await getDB();
  return db.delete('cards', id);
}

/**
 * Save field assignments learned for a company layout
 * @param {string} company
 * @param {object} assignments - { nameLineIdx, designationLineIdx, addressLineIdx }
 */
export async function saveCompanyLayout(company, assignments) {
  if (!company || typeof company !== 'string') return;
  const normalized = company.trim().toLowerCase();
  if (!normalized) return;

  const db = await getDB();
  await db.put('company_layouts', {
    company: normalized,
    originalName: company.trim(),
    assignments,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get saved layout hints for a company
 */
export async function getCompanyLayout(company) {
  if (!company || typeof company !== 'string') return null;
  const normalized = company.trim().toLowerCase();
  if (!normalized) return null;

  const db = await getDB();
  return db.get('company_layouts', normalized);
}

/**
 * Save knowledge item into IndexedDB
 * @param {string} key
 * @param {any} value
 */
export async function saveKnowledgeKey(key, value) {
  const db = await getDB();
  if (!db) return;
  await db.put('knowledge', { key, value, updatedAt: new Date().toISOString() });
}

export async function getKnowledgeKey(key) {
  const db = await getDB();
  if (!db) return null;
  const entry = await db.get('knowledge', key);
  return entry ? entry.value : null;
}

export async function getAllKnowledge() {
  const db = await getDB();
  if (!db) return [];
  return db.getAll('knowledge');
}

export async function clearKnowledgeStore() {
  const db = await getDB();
  if (!db) return;
  return db.clear('knowledge');
}

