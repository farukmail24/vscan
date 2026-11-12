/**
 * Categories & Event Manager
 * Manages category/event grouping for business card scans (e.g. "GTD EXPO", "General").
 * Enables per-category scanning, isolated category browsing, and dedicated CSV export.
 */

const STORAGE_KEY_CATEGORIES = 'card_scanner_categories';
const STORAGE_KEY_CURRENT = 'card_scanner_current_category';

const DEFAULT_CATEGORIES = ['GTD EXPO', 'General'];

// Safe storage and event dispatcher for both browser and test/SSR environments
const storage = {
  getItem(key) {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    } catch (_) {}
    return null;
  },
  setItem(key, value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch (_) {}
  }
};

function dispatchEventSafely(name, detail) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  } catch (_) {}
}

/**
 * Retrieve all registered categories
 * @returns {string[]}
 */
export function getCategories() {
  try {
    const raw = storage.getItem(STORAGE_KEY_CATEGORIES);
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list) || list.length === 0) {
      list = [...DEFAULT_CATEGORIES];
    }
    // Deduplicate and trim
    const seen = new Set();
    const clean = [];
    for (const c of [...list, ...DEFAULT_CATEGORIES]) {
      const trimmed = String(c || '').trim();
      const lower = trimmed.toLowerCase();
      if (trimmed && !seen.has(lower)) {
        seen.add(lower);
        clean.push(trimmed);
      }
    }
    return clean;
  } catch (err) {
    console.error('Failed to read categories:', err);
    return [...DEFAULT_CATEGORIES];
  }
}

/**
 * Save categories list
 * @param {string[]} categories
 */
export function saveCategories(categories) {
  try {
    const seen = new Set();
    const clean = [];
    for (const c of categories) {
      const trimmed = String(c || '').trim();
      const lower = trimmed.toLowerCase();
      if (trimmed && !seen.has(lower)) {
        seen.add(lower);
        clean.push(trimmed);
      }
    }
    if (clean.length === 0) clean.push('General');
    storage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(clean));
    dispatchEventSafely('categories-updated', clean);
    return clean;
  } catch (err) {
    console.error('Failed to save categories:', err);
    return categories;
  }
}

/**
 * Add a new category
 * @param {string} name
 * @returns {string} The normalized category name
 */
export function addCategory(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'General';

  const current = getCategories();
  const exists = current.find(c => c.toLowerCase() === trimmed.toLowerCase());
  if (!exists) {
    current.unshift(trimmed);
    saveCategories(current);
  }
  return exists || trimmed;
}

/**
 * Get the currently active category for incoming scans
 * @returns {string}
 */
export function getCurrentCategory() {
  try {
    const saved = storage.getItem(STORAGE_KEY_CURRENT);
    if (saved && saved.trim()) {
      return saved.trim();
    }
  } catch (_) {}
  return 'GTD EXPO'; // Default to user's requested event
}

/**
 * Set the currently active category for incoming scans
 * @param {string} name
 */
export function setCurrentCategory(name) {
  const trimmed = String(name || '').trim() || 'General';
  addCategory(trimmed);
  try {
    storage.setItem(STORAGE_KEY_CURRENT, trimmed);
    dispatchEventSafely('current-category-changed', trimmed);
  } catch (err) {
    console.error('Failed to set current category:', err);
  }
  return trimmed;
}

/**
 * Groups an array of cards by category
 * @param {Array<object>} cards
 * @returns {Array<{ category: string, count: number, cards: Array<object>, lastScannedAt: string }>}
 */
export function groupCardsByCategory(cards = []) {
  const map = new Map();
  const allKnownCategories = getCategories();

  // Initialize all known categories so empty ones can be seen/selected
  for (const cat of allKnownCategories) {
    map.set(cat, {
      category: cat,
      count: 0,
      cards: [],
      lastScannedAt: null
    });
  }

  // Populate from cards
  for (const card of cards) {
    const rec = card.record || {};
    let cat = (rec.category || card.category || '').trim();

    // Fallback: check tags for "category:XYZ"
    if (!cat && rec.tags) {
      const tagStr = Array.isArray(rec.tags) ? rec.tags.join(',') : String(rec.tags);
      const match = tagStr.match(/category:([a-zA-Z0-9_\-\s]+)/i);
      if (match) cat = match[1].trim();
    }

    if (!cat) cat = 'General';

    // Find case-insensitive match among known categories
    let matchedKey = null;
    for (const key of map.keys()) {
      if (key.toLowerCase() === cat.toLowerCase()) {
        matchedKey = key;
        break;
      }
    }

    if (!matchedKey) {
      matchedKey = cat;
      map.set(matchedKey, {
        category: matchedKey,
        count: 0,
        cards: [],
        lastScannedAt: null
      });
      addCategory(matchedKey);
    }

    const entry = map.get(matchedKey);
    entry.count += 1;
    entry.cards.push(card);

    const cardTime = rec.timestamp || card.createdAt;
    if (cardTime) {
      if (!entry.lastScannedAt || new Date(cardTime) > new Date(entry.lastScannedAt)) {
        entry.lastScannedAt = cardTime;
      }
    }
  }

  // Convert map to sorted array (categories with cards first, then by lastScannedAt, then alphabet)
  const result = Array.from(map.values()).sort((a, b) => {
    // Current active category on top
    const current = getCurrentCategory().toLowerCase();
    if (a.category.toLowerCase() === current) return -1;
    if (b.category.toLowerCase() === current) return 1;

    // Highest count first
    if (b.count !== a.count) return b.count - a.count;

    // Latest scan date
    if (a.lastScannedAt && b.lastScannedAt) {
      return new Date(b.lastScannedAt) - new Date(a.lastScannedAt);
    }
    return a.category.localeCompare(b.category);
  });

  return result;
}
