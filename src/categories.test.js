import { describe, it, expect, beforeEach } from 'vitest';

// In-memory localStorage mock for node test runner
const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (k) => memoryStore.has(k) ? memoryStore.get(k) : null,
  setItem: (k, v) => memoryStore.set(k, String(v)),
  removeItem: (k) => memoryStore.delete(k),
  clear: () => memoryStore.clear()
};

import {
  getCategories,
  saveCategories,
  addCategory,
  getCurrentCategory,
  setCurrentCategory,
  groupCardsByCategory
} from './categories.js';

describe('Categories & Event Manager Suite', () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it('provides default categories including GTD EXPO and General', () => {
    const categories = getCategories();
    expect(categories).toContain('GTD EXPO');
    expect(categories).toContain('General');
  });

  it('adds a new unique category and preserves existing ones', () => {
    const added = addCategory('Dhaka Tech Summit 2026');
    expect(added).toBe('Dhaka Tech Summit 2026');
    const categories = getCategories();
    expect(categories).toContain('Dhaka Tech Summit 2026');
  });

  it('sets and gets current active category', () => {
    expect(getCurrentCategory()).toBe('GTD EXPO');
    setCurrentCategory('Dhaka Tech Summit 2026');
    expect(getCurrentCategory()).toBe('Dhaka Tech Summit 2026');
  });

  it('groups cards into dedicated event categories accurately', () => {
    const cards = [
      {
        id: 'c1',
        record: { name: 'Alice', company: 'Alpha Inc', category: 'GTD EXPO', timestamp: '2026-11-10T10:00:00Z' }
      },
      {
        id: 'c2',
        record: { name: 'Bob', company: 'Beta Corp', category: 'GTD EXPO', timestamp: '2026-11-10T11:00:00Z' }
      },
      {
        id: 'c3',
        record: { name: 'Charlie', company: 'Gamma LLC', category: 'Medical Summit', timestamp: '2026-11-09T08:00:00Z' }
      },
      {
        id: 'c4',
        record: { name: 'David', company: 'Delta Ltd', tags: ['vip', 'category:Fintech Fair'] }
      },
      {
        id: 'c5',
        record: { name: 'Eve', company: 'Echo' } // No category -> General
      }
    ];

    const grouped = groupCardsByCategory(cards);

    const gtd = grouped.find(g => g.category === 'GTD EXPO');
    expect(gtd).toBeDefined();
    expect(gtd.count).toBe(2);
    expect(gtd.cards.map(c => c.record.name)).toEqual(['Alice', 'Bob']);

    const med = grouped.find(g => g.category === 'Medical Summit');
    expect(med).toBeDefined();
    expect(med.count).toBe(1);

    const fintech = grouped.find(g => g.category === 'Fintech Fair');
    expect(fintech).toBeDefined();
    expect(fintech.count).toBe(1);

    const general = grouped.find(g => g.category === 'General');
    expect(general).toBeDefined();
    expect(general.count).toBe(1);
  });
});
