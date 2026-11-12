/**
 * Central Cloud Synchronization Manager
 * Synchronizes local IndexedDB and categories with TiDB Cloud database.
 * Enables seamless cross-device data sharing across all mobile and desktop devices.
 */

import { getAllCardsLocal, saveCardLocal, getPendingCards, markCardSynced } from './db.js';
import { listCardsFromDB, listCategoriesFromDB, saveRecord } from './api.js';
import { addCategory, getCategories } from './categories.js';
import { setPendingCount } from './store.js';

let isSyncing = false;

function isOnline() {
  return typeof navigator === 'undefined' || Boolean(navigator.onLine);
}

function dispatch(name, detail) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

/**
 * Upload pending offline cards to TiDB Cloud
 * @returns {Promise<number>} Count of uploaded cards
 */
export async function pushPendingCards() {
  if (!isOnline()) return 0;
  let synced = 0;

  try {
    const pending = await getPendingCards();
    if (!pending || pending.length === 0) return 0;

    for (const card of pending) {
      try {
        const res = await saveRecord(
          card.record,
          card.frontBase64 || null,
          card.backBase64 || null
        );
        await markCardSynced(card.id, {
          row: res.id || card.id,
          frontImageUrl: res.frontImageUrl,
          backImageUrl: res.backImageUrl
        });
        synced++;
      } catch (err) {
        console.warn('Failed to upload offline card to TiDB:', card.id, err);
      }
    }

    const remaining = await getPendingCards();
    setPendingCount(remaining.length);
  } catch (err) {
    console.warn('pushPendingCards error:', err);
  }

  return synced;
}

/**
 * Pull latest cards and categories from TiDB Cloud database
 * and merge into local IndexedDB
 * @returns {Promise<{ ok: boolean, count: number, updated: boolean, error?: string }>}
 */
export async function pullCardsFromCloud() {
  if (!isOnline()) {
    return { ok: false, count: 0, updated: false, error: 'Offline' };
  }

  try {
    // 1. Fetch categories summary
    try {
      const catRes = await listCategoriesFromDB();
      if (catRes && Array.isArray(catRes.categories)) {
        for (const c of catRes.categories) {
          if (c.category) addCategory(c.category);
        }
      }
    } catch (catErr) {
      console.warn('Failed to fetch categories summary:', catErr);
    }

    // 2. Fetch cards from TiDB Cloud (up to 500 contacts)
    const res = await listCardsFromDB('', 500);
    const dbCards = res.cards || [];

    const localCards = await getAllCardsLocal();
    const localMap = new Map(localCards.map(c => [c.id, c]));

    let newOrUpdatedCount = 0;

    for (const remote of dbCards) {
      const local = localMap.get(remote.id);
      const remoteCategory = remote.category || remote.record?.category || 'General';
      addCategory(remoteCategory);

      // If card doesn't exist locally or has changed
      if (!local) {
        await saveCardLocal({
          id: remote.id,
          record: remote.record,
          category: remoteCategory,
          source: remote.source || 'AI',
          status: 'synced',
          frontImageUrl: remote.record?.frontImageUrl || null,
          backImageUrl: remote.record?.backImageUrl || null,
          createdAt: remote.createdAt || remote.record?.timestamp || new Date().toISOString()
        });
        newOrUpdatedCount++;
      }
    }

    return {
      ok: true,
      count: dbCards.length,
      newOrUpdatedCount,
      updated: newOrUpdatedCount > 0
    };
  } catch (err) {
    console.error('pullCardsFromCloud error:', err);
    return { ok: false, count: 0, updated: false, error: err.message };
  }
}

/**
 * Complete Two-Way Sync:
 * 1. Push any pending offline scans from this device
 * 2. Pull all cards from TiDB Cloud database
 * 3. Dispatch 'cards-synced' event to update active UI
 */
export async function syncCardsWithCloud(options = { notify: false }) {
  if (isSyncing) return { ok: false, message: 'Sync in progress' };
  if (!isOnline()) return { ok: false, message: 'Offline' };

  isSyncing = true;
  dispatch('sync-state-changed', { syncing: true });

  try {
    // Step 1: Push offline cards
    const uploaded = await pushPendingCards();

    // Step 2: Pull cloud cards
    const pullResult = await pullCardsFromCloud();

    dispatch('cards-synced', {
      uploaded,
      newCards: pullResult.newOrUpdatedCount || 0,
      totalCloudCards: pullResult.count || 0
    });

    return {
      ok: true,
      uploaded,
      imported: pullResult.newOrUpdatedCount || 0,
      total: pullResult.count || 0
    };
  } catch (err) {
    console.error('syncCardsWithCloud failed:', err);
    return { ok: false, error: err.message };
  } finally {
    isSyncing = false;
    dispatch('sync-state-changed', { syncing: false });
  }
}
