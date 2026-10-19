/**
 * Settings Screen Component
 * Manages Apps Script connection, App Token, Scanner identity,
 * mode configuration, connection testing, and cache management.
 */

import { getSettings, saveSettings } from '../settings.js';
import { pingBackend, saveRecord } from '../api.js';
import { getPendingCards, markCardSynced } from '../db.js';
import { showToast } from './toast.js';

export function renderSettings(container) {
  const currentSettings = getSettings();

  container.innerHTML = `
    <div class="settings-view-content">
      <!-- Backend Connection Card -->
      <div class="card-panel">
        <div class="card-title">
          <span>Backend Configuration</span>
          <span class="badge badge-ai">Apps Script</span>
        </div>

        <form id="settings-form">
          <!-- Apps Script URL -->
          <div class="form-group">
            <label class="form-label" for="setting-url">Apps Script Web App URL</label>
            <input type="url" id="setting-url" class="form-input" placeholder="https://script.google.com/macros/s/.../exec" value="${escapeHtml(currentSettings.appsScriptUrl || '')}" required />
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
              Deploy your Google Sheet script as a Web App (Access: Anyone) and paste the /exec URL.
            </div>
          </div>

          <!-- App Token -->
          <div class="form-group">
            <label class="form-label" for="setting-token">App Token (Shared Secret)</label>
            <div style="position: relative;">
              <input type="password" id="setting-token" class="form-input" style="padding-right: 42px;" placeholder="Secret matching backend APP_TOKEN" value="${escapeHtml(currentSettings.appToken || '')}" required />
              <button type="button" id="toggle-token-btn" class="btn-icon" style="position: absolute; right: 4px; top: 4px;" title="Show or hide token">
                <svg id="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
              Never committed to Git or exposed. Verified by doPost on your Apps Script.
            </div>
          </div>

          <!-- Scanned By Name -->
          <div class="form-group">
            <label class="form-label" for="setting-scanned-by">Scanned By (Your Name / ID)</label>
            <input type="text" id="setting-scanned-by" class="form-input" placeholder="e.g. Tanvir Rahman" value="${escapeHtml(currentSettings.scannedBy || '')}" />
          </div>

          <!-- Default Mode -->
          <div class="form-group">
            <label class="form-label" for="setting-mode">Default Extraction Mode</label>
            <select id="setting-mode" class="form-select">
              <option value="auto" ${currentSettings.mode === 'auto' ? 'selected' : ''}>Auto (AI when online, Offline OCR when offline)</option>
              <option value="ai" ${currentSettings.mode === 'ai' ? 'selected' : ''}>AI Only (Google Gemini 2.5 Flash via Apps Script)</option>
              <option value="offline" ${currentSettings.mode === 'offline' ? 'selected' : ''}>Offline OCR Only (In-browser Tesseract.js & jsQR)</option>
            </select>
          </div>

          <!-- Theme -->
          <div class="form-group">
            <label class="form-label" for="setting-theme">App Color Theme</label>
            <select id="setting-theme" class="form-select">
              <option value="system" ${currentSettings.theme === 'system' ? 'selected' : ''}>System Default</option>
              <option value="dark" ${currentSettings.theme === 'dark' ? 'selected' : ''}>Dark Slate</option>
              <option value="light" ${currentSettings.theme === 'light' ? 'selected' : ''}>Light Clean</option>
            </select>
          </div>

          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button type="submit" class="btn btn-primary">
              Save Settings
            </button>
            <button type="button" id="test-connection-btn" class="btn btn-secondary">
              Test Connection
            </button>
          </div>
        </form>
      </div>

      <!-- Test Connection Result Box -->
      <div id="test-result-box" class="card-panel" style="display: none; padding: 12px 16px;"></div>

      <!-- Sync & Data Tools Card -->
      <div class="card-panel">
        <div class="card-title">
          <span>Storage & Offline Sync</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button type="button" id="manual-sync-btn" class="btn btn-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Sync Pending Offline Cards
          </button>
          
          <button type="button" id="clear-local-db-btn" class="btn btn-danger">
            Clear Local Cache & Reset Settings
          </button>
        </div>
      </div>

      <!-- About & Version Info -->
      <div style="text-align: center; margin-top: 24px; color: var(--text-muted); font-size: 0.8rem;">
        <div style="font-weight: 600; color: var(--text-secondary); margin-bottom: 2px;">Card Scanner PWA</div>
        <div>Version 1.0.0 · Gemini AI & Offline OCR (eng+ben)</div>
        <div style="margin-top: 4px; font-size: 0.72rem;">Designed for Bangladesh & International Business Cards</div>
      </div>
    </div>
  `;

  // Toggle token password visibility
  const tokenInput = container.querySelector('#setting-token');
  const toggleTokenBtn = container.querySelector('#toggle-token-btn');
  toggleTokenBtn.onclick = () => {
    if (tokenInput.type === 'password') {
      tokenInput.type = 'text';
    } else {
      tokenInput.type = 'password';
    }
  };

  // Form submit
  const form = container.querySelector('#settings-form');
  form.onsubmit = (e) => {
    e.preventDefault();
    const url = container.querySelector('#setting-url').value.trim();
    const token = container.querySelector('#setting-token').value.trim();
    const scannedBy = container.querySelector('#setting-scanned-by').value.trim();
    const mode = container.querySelector('#setting-mode').value;
    const theme = container.querySelector('#setting-theme').value;

    saveSettings({
      appsScriptUrl: url,
      appToken: token,
      scannedBy,
      mode,
      theme
    });

    // Apply theme
    applyTheme(theme);

    showToast('Settings saved successfully!', 'success');
  };

  // Test Connection
  const testBtn = container.querySelector('#test-connection-btn');
  const testBox = container.querySelector('#test-result-box');

  testBtn.onclick = async () => {
    // Save current values first
    const url = container.querySelector('#setting-url').value.trim();
    const token = container.querySelector('#setting-token').value.trim();

    if (!url || !token) {
      showToast('Please enter both Apps Script URL and App Token', 'warning');
      return;
    }

    saveSettings({ appsScriptUrl: url, appToken: token });

    testBtn.setAttribute('disabled', 'true');
    testBtn.textContent = 'Testing...';
    testBox.style.display = 'block';
    testBox.style.borderColor = 'var(--accent-blue)';
    testBox.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; color: var(--accent-blue); font-size: 0.85rem;">
        <span class="status-dot"></span>
        Connecting to Google Apps Script backend...
      </div>
    `;

    try {
      const res = await pingBackend();
      testBox.style.borderColor = 'var(--accent-emerald)';
      testBox.innerHTML = `
        <div style="color: var(--accent-emerald); font-weight: 700; font-size: 0.9rem; margin-bottom: 4px;">
          ✓ Connection Successful!
        </div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">
          Backend service acknowledged ping: <strong>${escapeHtml(res.timestamp || new Date().toISOString())}</strong>
        </div>
      `;
      showToast('Backend connection verified!', 'success');
    } catch (err) {
      testBox.style.borderColor = 'var(--accent-rose)';
      testBox.innerHTML = `
        <div style="color: var(--accent-rose); font-weight: 700; font-size: 0.9rem; margin-bottom: 4px;">
          ✗ Connection Failed
        </div>
        <div style="font-size: 0.78rem; color: var(--text-primary); margin-bottom: 6px;">
          ${escapeHtml(err.message)}
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted);">
          Check that: (1) URL ends with /exec, (2) Deployment Access is set to "Anyone", and (3) Token matches Script Property APP_TOKEN.
        </div>
      `;
      showToast('Connection test failed', 'error');
    } finally {
      testBtn.removeAttribute('disabled');
      testBtn.textContent = 'Test Connection';
    }
  };

  // Manual Sync Pending Cards
  const syncBtn = container.querySelector('#manual-sync-btn');
  syncBtn.onclick = async () => {
    if (!navigator.onLine) {
      showToast('Device is offline. Connect to internet first.', 'error');
      return;
    }

    const pending = await getPendingCards();
    if (pending.length === 0) {
      showToast('No pending cards to sync.', 'info');
      return;
    }

    syncBtn.setAttribute('disabled', 'true');
    syncBtn.textContent = `Syncing ${pending.length} cards...`;
    let synced = 0;

    for (const card of pending) {
      try {
        const res = await saveRecord(card.record, card.frontBase64, card.backBase64);
        await markCardSynced(card.id, {
          row: res.row,
          frontImageUrl: res.frontImageUrl,
          backImageUrl: res.backImageUrl
        });
        synced++;
      } catch (err) {
        console.error('Failed sync for card:', card.id, err);
      }
    }

    syncBtn.removeAttribute('disabled');
    syncBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
      Sync Pending Offline Cards
    `;
    showToast(`Sync complete! ${synced} cards uploaded.`, 'success');
  };

  // Clear Local Data
  const clearBtn = container.querySelector('#clear-local-db-btn');
  clearBtn.onclick = () => {
    if (confirm('Are you sure? This will delete locally stored cards and reset settings.')) {
      localStorage.clear();
      indexedDB.deleteDatabase('CardScannerDB');
      showToast('Local database cleared. Reloading...', 'info');
      setTimeout(() => window.location.reload(), 1000);
    }
  };
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
