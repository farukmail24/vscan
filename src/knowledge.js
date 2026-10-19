/**
 * Knowledge Pack & Self-Learning Engine
 * Manages modular JSON vocabularies (designations, company suffixes, addresses, OCR confusions),
 * merges them with IndexedDB overrides and Google Sheet Rules,
 * and provides high-precision Fuse.js fuzzy matching and learning loops.
 */

import Fuse from 'fuse.js';
import defaultDesignations from './knowledge/designations.json';
import defaultCompanySuffixes from './knowledge/company_suffixes.json';
import defaultAddressWords from './knowledge/address_words.json';
import defaultOcrConfusions from './knowledge/ocr_confusions.json';
import defaultKnownCompanies from './knowledge/known_companies.json';
import { getKnowledgeKey, saveKnowledgeKey, clearKnowledgeStore } from './db.js';

// In-memory active knowledge caches
let activeDesignationsEn = new Set(defaultDesignations.en);
let activeDesignationsBn = new Set(defaultDesignations.bn);
let activeCompanySuffixesEn = new Set(defaultCompanySuffixes.en);
let activeCompanySuffixesBn = new Set(defaultCompanySuffixes.bn);
let activeAddressWordsEn = new Set(defaultAddressWords.en);
let activeAddressWordsBn = new Set(defaultAddressWords.bn);
let activeOcrConfusions = { ...defaultOcrConfusions };
let activeKnownCompanies = new Set(defaultKnownCompanies);

let isInitialized = false;

// Fuse instances for fast fuzzy matching
let companyFuse = null;
let designationFuse = null;

function refreshFuseIndexes() {
  companyFuse = new Fuse(Array.from(activeKnownCompanies), {
    includeScore: true,
    threshold: 0.25, // Only very close matches
    distance: 100,
    ignoreLocation: true
  });

  const allDesigs = [
    ...Array.from(activeDesignationsEn),
    ...Array.from(activeDesignationsBn)
  ];
  designationFuse = new Fuse(allDesigs, {
    includeScore: true,
    threshold: 0.25,
    distance: 100,
    ignoreLocation: true
  });
}

/**
 * Initialize knowledge pack by merging bundled defaults with IndexedDB storage
 */
export async function initKnowledge() {
  try {
    const customDesigs = await getKnowledgeKey('custom_designations');
    if (customDesigs && Array.isArray(customDesigs)) {
      customDesigs.forEach(d => {
        if (/[\u0980-\u09FF]/.test(d)) activeDesignationsBn.add(d);
        else activeDesignationsEn.add(d);
      });
    }

    const customCompanies = await getKnowledgeKey('custom_companies');
    if (customCompanies && Array.isArray(customCompanies)) {
      customCompanies.forEach(c => activeKnownCompanies.add(c));
    }

    const customConfusions = await getKnowledgeKey('custom_ocr_confusions');
    if (customConfusions && typeof customConfusions === 'object') {
      Object.assign(activeOcrConfusions, customConfusions);
    }

    const syncedRules = await getKnowledgeKey('synced_backend_rules');
    if (syncedRules && Array.isArray(syncedRules)) {
      applyRulesList(syncedRules);
    }

    refreshFuseIndexes();
    isInitialized = true;
  } catch (err) {
    console.warn('Could not initialize dynamic knowledge store:', err);
    refreshFuseIndexes();
    isInitialized = true;
  }
}

/**
 * Apply a list of rules { type, value, extra }
 */
function applyRulesList(rules) {
  for (let rule of rules) {
    const type = (rule.type || rule.Type || '').toLowerCase().trim();
    const val = (rule.value || rule.Value || '').trim();
    const extra = (rule.extra || rule.Extra || '').trim();
    if (!val) continue;

    if (type === 'designation') {
      if (/[\u0980-\u09FF]/.test(val)) activeDesignationsBn.add(val);
      else activeDesignationsEn.add(val);
    } else if (type === 'company' || type === 'known_company') {
      activeKnownCompanies.add(val);
    } else if (type === 'company_suffix') {
      if (/[\u0980-\u09FF]/.test(val)) activeCompanySuffixesBn.add(val);
      else activeCompanySuffixesEn.add(val);
    } else if (type === 'address_word') {
      if (/[\u0980-\u09FF]/.test(val)) activeAddressWordsBn.add(val);
      else activeAddressWordsEn.add(val);
    } else if (type === 'ocr_confusion' && extra) {
      activeOcrConfusions[val] = extra;
    }
  }
}

/**
 * Synchronize knowledge rules from backend Sheet tab "Rules"
 */
export async function syncKnowledgeFromBackend(rules) {
  if (!Array.isArray(rules)) return { added: 0 };
  applyRulesList(rules);
  await saveKnowledgeKey('synced_backend_rules', rules);
  refreshFuseIndexes();
  return { added: rules.length };
}

/**
 * Levenshtein Distance for typo matching
 */
export function levenshteinDistance(a, b) {
  if (!a || !b) return (a || b || '').length;
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  const matrix = Array.from({ length: s1.length + 1 }, () => new Array(s2.length + 1).fill(0));

  for (let i = 0; i <= s1.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[s1.length][s2.length];
}

/**
 * Record a correction made by the user on the Review Screen (The Learning Loop)
 * @param {object} diff - { field, originalValue, correctedValue }
 * @returns {Promise<boolean>} true if something new was learned
 */
export async function recordLearnedCorrection(diff) {
  const { field, originalValue, correctedValue } = diff;
  if (!correctedValue || typeof correctedValue !== 'string') return false;

  const orig = (originalValue || '').trim();
  const corr = correctedValue.trim();
  if (orig === corr) return false;

  let learned = false;

  // 1. Detect OCR word-level typo and add to ocr_confusions
  if (orig && corr && orig.length > 3 && corr.length > 3) {
    const dist = levenshteinDistance(orig, corr);
    // If edit distance is small (1 to 3 edits) relative to length, it's an OCR typo!
    if (dist >= 1 && dist <= 3 && Math.abs(orig.length - corr.length) <= 2) {
      activeOcrConfusions[orig] = corr;
      const storedConfusions = (await getKnowledgeKey('custom_ocr_confusions')) || {};
      storedConfusions[orig] = corr;
      await saveKnowledgeKey('custom_ocr_confusions', storedConfusions);
      learned = true;
    }
  }

  // 2. Learn new Designation
  if (field === 'designation' && corr.length >= 3) {
    const isBn = /[\u0980-\u09FF]/.test(corr);
    const targetSet = isBn ? activeDesignationsBn : activeDesignationsEn;
    if (!targetSet.has(corr)) {
      targetSet.add(corr);
      const customDesigs = (await getKnowledgeKey('custom_designations')) || [];
      if (!customDesigs.includes(corr)) {
        customDesigs.push(corr);
        await saveKnowledgeKey('custom_designations', customDesigs);
      }
      learned = true;
    }
  }

  // 3. Learn new Company
  if (field === 'company' && corr.length >= 3) {
    if (!activeKnownCompanies.has(corr)) {
      activeKnownCompanies.add(corr);
      const customCompanies = (await getKnowledgeKey('custom_companies')) || [];
      if (!customCompanies.includes(corr)) {
        customCompanies.push(corr);
        await saveKnowledgeKey('custom_companies', customCompanies);
      }
      learned = true;
    }
  }

  if (learned) {
    refreshFuseIndexes();
  }

  return learned;
}

/**
 * Fuzzy match a company against known companies
 * Auto-corrects only if confidence score is extremely high (score <= 0.15)
 * @param {string} text
 * @returns {{ matched: boolean, value: string, score: number, original: string }}
 */
export function fuzzyMatchCompany(text) {
  if (!text || !companyFuse) return { matched: false, value: text, score: 1, original: text };
  const trimmed = text.trim();
  const results = companyFuse.search(trimmed);
  if (results.length > 0 && results[0].score <= 0.18) {
    const matchedItem = results[0].item;
    // If it already matches case-insensitively, preserve the card's original casing
    if (matchedItem.toLowerCase() === trimmed.toLowerCase()) {
      return {
        matched: true,
        value: text,
        score: results[0].score,
        original: text
      };
    }
    return {
      matched: true,
      value: matchedItem,
      score: results[0].score,
      original: text
    };
  }
  return { matched: false, value: text, score: results[0]?.score ?? 1, original: text };
}

export function fuzzyMatchDesignation(text) {
  if (!text || !designationFuse) return { matched: false, value: text, score: 1, original: text };
  const trimmed = text.trim();
  const results = designationFuse.search(trimmed);
  if (results.length > 0 && results[0].score <= 0.18) {
    const matchedItem = results[0].item;
    // If it already matches case-insensitively, preserve the card's original casing
    if (matchedItem.toLowerCase() === trimmed.toLowerCase()) {
      return {
        matched: true,
        value: text,
        score: results[0].score,
        original: text
      };
    }
    return {
      matched: true,
      value: matchedItem,
      score: results[0].score,
      original: text
    };
  }
  return { matched: false, value: text, score: results[0]?.score ?? 1, original: text };
}

/**
 * Apply known OCR confusions to a line of text
 */
export function applyOcrWordCorrections(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const [confused, corrected] of Object.entries(activeOcrConfusions)) {
    if (confused.toLowerCase() === corrected.toLowerCase()) continue;
    const regex = new RegExp(`\\b${escapeRegExp(confused)}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      // If matched string was ALL-CAPS, return uppercase replacement
      if (match === match.toUpperCase() && match.length > 1) {
        return corrected.toUpperCase();
      }
      return corrected;
    });
  }
  return result;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Getters for active knowledge sets
 */
export function getDesignations() {
  return {
    en: activeDesignationsEn,
    bn: activeDesignationsBn,
    allList: [...Array.from(activeDesignationsEn), ...Array.from(activeDesignationsBn)]
  };
}

export function getCompanySuffixes() {
  return {
    en: activeCompanySuffixesEn,
    bn: activeCompanySuffixesBn,
    allList: [...Array.from(activeCompanySuffixesEn), ...Array.from(activeCompanySuffixesBn)]
  };
}

export function getAddressWords() {
  return {
    en: activeAddressWordsEn,
    bn: activeAddressWordsBn,
    allList: [...Array.from(activeAddressWordsEn), ...Array.from(activeAddressWordsBn)]
  };
}

export function getOcrConfusions() {
  return activeOcrConfusions;
}

export function getKnownCompanies() {
  return Array.from(activeKnownCompanies);
}

/**
 * Summary stats for Settings UI
 */
export function getKnowledgeSummary() {
  return {
    designationsCount: activeDesignationsEn.size + activeDesignationsBn.size,
    companySuffixesCount: activeCompanySuffixesEn.size + activeCompanySuffixesBn.size,
    addressWordsCount: activeAddressWordsEn.size + activeAddressWordsBn.size,
    ocrConfusionsCount: Object.keys(activeOcrConfusions).length,
    knownCompaniesCount: activeKnownCompanies.size
  };
}

/**
 * Reset learned knowledge back to defaults
 */
export async function resetLearnedKnowledge() {
  await clearKnowledgeStore();
  activeDesignationsEn = new Set(defaultDesignations.en);
  activeDesignationsBn = new Set(defaultDesignations.bn);
  activeCompanySuffixesEn = new Set(defaultCompanySuffixes.en);
  activeCompanySuffixesBn = new Set(defaultCompanySuffixes.bn);
  activeAddressWordsEn = new Set(defaultAddressWords.en);
  activeAddressWordsBn = new Set(defaultAddressWords.bn);
  activeOcrConfusions = { ...defaultOcrConfusions };
  activeKnownCompanies = new Set(defaultKnownCompanies);
  refreshFuseIndexes();
}

// Initial index build on module load
refreshFuseIndexes();
