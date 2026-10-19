/**
 * Settings Store & Persistence
 * Manages configuration stored in localStorage
 */

const STORAGE_KEY = 'card_scanner_settings';

const DEFAULT_SETTINGS = {
  appsScriptUrl: '',
  appToken: '',
  scannedBy: '',
  mode: 'auto', // 'auto' | 'ai' | 'offline'
  ocrLang: 'auto', // 'auto' | 'eng' | 'ben' | 'eng+ben'
  batchMode: false,
  uploadImagesToDrive: false, // Default: false (do not upload images to Google Drive)
  theme: 'system' // 'system' | 'dark' | 'light'
};

/**
 * Load settings from localStorage with defaults
 */
export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    console.error('Failed to read settings from localStorage:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save updated settings to localStorage
 */
export function saveSettings(newSettings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...newSettings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('settings-changed', { detail: updated }));
    return updated;
  } catch (err) {
    console.error('Failed to save settings to localStorage:', err);
    throw err;
  }
}

/**
 * Update a single setting
 */
export function updateSetting(key, value) {
  return saveSettings({ [key]: value });
}
