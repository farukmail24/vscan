import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db.js', () => {
  const localCards = [];
  return {
    getAllCardsLocal: vi.fn(async () => [...localCards]),
    saveCardLocal: vi.fn(async (card) => {
      const idx = localCards.findIndex(c => c.id === card.id);
      if (idx >= 0) localCards[idx] = card;
      else localCards.push(card);
      return card;
    }),
    getPendingCards: vi.fn(async () => localCards.filter(c => c.status === 'pending')),
    markCardSynced: vi.fn(async (id) => {
      const card = localCards.find(c => c.id === id);
      if (card) card.status = 'synced';
    }),
    __clearLocal: () => { localCards.length = 0; }
  };
});

vi.mock('./api.js', () => ({
  listCardsFromDB: vi.fn(async () => ({
    ok: true,
    cards: [
      {
        id: 'cloud_card_1',
        record: { name: 'Rahim Khan', company: 'Cloud Corp', category: 'GTD EXPO' },
        category: 'GTD EXPO',
        status: 'synced',
        createdAt: '2026-11-12T10:00:00Z'
      }
    ]
  })),
  listCategoriesFromDB: vi.fn(async () => ({
    ok: true,
    categories: [{ category: 'GTD EXPO', card_count: 5 }]
  })),
  saveRecord: vi.fn(async () => ({ ok: true, id: 'cloud_row_1' }))
}));

vi.mock('./store.js', () => ({
  setPendingCount: vi.fn()
}));

try {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value: true,
    configurable: true,
    writable: true
  });
} catch (_) {}

if (typeof CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(name, opts = {}) {
      this.type = name;
      this.detail = opts.detail;
    }
  };
}
if (typeof window === 'undefined') {
  globalThis.window = {
    dispatchEvent: vi.fn()
  };
}

import { syncCardsWithCloud, pullCardsFromCloud } from './sync.js';
import * as dbModule from './db.js';

describe('Cross-Device Cloud Sync Suite', () => {
  beforeEach(() => {
    dbModule.__clearLocal();
    vi.clearAllMocks();
  });

  it('pulls cards and categories from TiDB Cloud and merges them into local storage', async () => {
    const result = await pullCardsFromCloud();
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.newOrUpdatedCount).toBe(1);

    const localCards = await dbModule.getAllCardsLocal();
    expect(localCards.length).toBe(1);
    expect(localCards[0].id).toBe('cloud_card_1');
    expect(localCards[0].record.name).toBe('Rahim Khan');
    expect(localCards[0].category).toBe('GTD EXPO');
  });

  it('executes full two-way cloud sync and notifies app listeners', async () => {
    const syncRes = await syncCardsWithCloud();
    expect(syncRes.ok).toBe(true);
    expect(syncRes.imported).toBe(1);

    const localCards = await dbModule.getAllCardsLocal();
    expect(localCards.length).toBe(1);
  });
});
