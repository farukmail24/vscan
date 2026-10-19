/**
 * Settings Screen Component
 * Manages Apps Script connection, App Token, Scanner identity,
 * mode configuration, Google Drive image toggle, interactive Setup Guide modal,
 * connection testing, and cache management.
 */

import { getSettings, saveSettings } from '../settings.js';
import { pingBackend, getKnowledgeRules } from '../api.js';
import { getKnowledgeSummary, resetLearnedKnowledge, syncKnowledgeFromBackend } from '../knowledge.js';
import { getPendingCards, markCardSynced } from '../db.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { APPS_SCRIPT_SOURCE } from '../appsScriptSource.js';

export function renderSettings(container) {
  const currentSettings = getSettings();

  container.innerHTML = `
    <div class="settings-view-content">
      <!-- Interactive Setup Guide Banner Button -->
      <div class="card-panel" style="border-color: rgba(59, 130, 246, 0.4); background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(99, 102, 241, 0.05)); margin-bottom: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--accent-blue); display: flex; align-items: center; gap: 6px;">
              <span>📖</span> Apps Script সেটআপ গাইডলাইন
            </div>
            <div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 3px;">
              Google Sheet, Gemini AI ও Web App URL পাওয়ার পূর্ণ নির্দেশিকা
            </div>
          </div>
          <button type="button" id="open-guide-btn" class="btn btn-primary btn-sm" style="flex-shrink: 0; width: auto; padding: 6px 14px;">
            গাইড দেখুন
          </button>
        </div>
      </div>

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
              গুগল শিটের Web App URL (যার শেষে /exec থাকে)। এটি অ্যাক্সেস: Anyone হতে হবে।
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
              নিরাপত্তার জন্য গোপন টোকেন। এটি Apps Script Script Properties-এর APP_TOKEN এর সাথে মিলতে হবে।
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

          <!-- Offline OCR Language -->
          <div class="form-group">
            <label class="form-label" for="setting-ocr-lang">Offline OCR Language Engine</label>
            <select id="setting-ocr-lang" class="form-select">
              <option value="auto" ${(currentSettings.ocrLang || 'auto') === 'auto' ? 'selected' : ''}>⚡ Auto (Fast English first, Bengali fallback)</option>
              <option value="eng" ${currentSettings.ocrLang === 'eng' ? 'selected' : ''}>English Only (Fastest, zero Bengali artifacts)</option>
              <option value="ben" ${currentSettings.ocrLang === 'ben' ? 'selected' : ''}>বাংলা Only (Pure Bengali cards)</option>
              <option value="eng+ben" ${currentSettings.ocrLang === 'eng+ben' ? 'selected' : ''}>English + বাংলা (Bilingual cards)</option>
            </select>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
              Auto মোডে ইংরেজি কার্ডে বিদ্যুৎগতিতে নির্ভুল ফল পাওয়া যায় এবং লোগোর দাগকে বাংলা বর্ণ হিসেবে ভুল পড়া রোধ করে।
            </div>
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

          <!-- CardImages Storage Toggle (Option to skip Google Drive) -->
          <div class="card-panel" style="padding: 12px; margin: 16px 0; background-color: rgba(255, 255, 255, 0.02); border-color: var(--border-color);">
            <div class="switch-container">
              <div style="padding-right: 12px;">
                <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary);">
                  Upload Photos to Google Drive
                </div>
                <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 3px; line-height: 1.4;">
                  <strong>বন্ধ রাখলে (ডিফল্ট):</strong> গুগল ড্রাইভে কোনো ছবি জমা হবে না। সেভ হবে ১০ গুণ দ্রুত এবং ড্রাইভ স্টোরেজ সম্পূর্ণ খালি থাকবে।
                </div>
              </div>
              <label class="switch">
                <input type="checkbox" id="setting-upload-images" ${currentSettings.uploadImagesToDrive ? 'checked' : ''} />
                <span class="slider"></span>
              </label>
            </div>
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

      <!-- Knowledge Base & Learning Engine Card -->
      <div class="card-panel">
        <div class="card-title">
          <span>🧠 Knowledge Base & Learning Engine</span>
          <span class="badge badge-offline">Offline Enhancer</span>
        </div>

        <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">
          অফলাইন OCR-এর নির্ভুলতা বাড়াতে এটি পদবি, কোম্পানি সাফিক্স এবং ইউজারের সংশোধন থেকে স্বয়ংক্রিয়ভাবে শেখে। Google Sheet-এর <strong>"Rules"</strong> ট্যাব থেকেও নতুন নিয়ম লাইভ সিঙ্ক করা যায়।
        </p>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px;">
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 8px 10px;">
            <div style="font-size: 0.7rem; color: var(--text-muted);">পদবি (Designations)</div>
            <div id="stat-designations" style="font-size: 1.1rem; font-weight: 700; color: var(--accent-blue);">--</div>
          </div>
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 8px 10px;">
            <div style="font-size: 0.7rem; color: var(--text-muted);">পরিচিত কোম্পানি (Fuzzy)</div>
            <div id="stat-companies" style="font-size: 1.1rem; font-weight: 700; color: var(--accent-blue);">--</div>
          </div>
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 8px 10px;">
            <div style="font-size: 0.7rem; color: var(--text-muted);">ঠিকানা শব্দভাণ্ডার</div>
            <div id="stat-addresses" style="font-size: 1.1rem; font-weight: 700; color: var(--accent-blue);">--</div>
          </div>
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 8px 10px;">
            <div style="font-size: 0.7rem; color: var(--text-muted);">OCR ভুল সংশোধন ম্যাপ</div>
            <div id="stat-confusions" style="font-size: 1.1rem; font-weight: 700; color: var(--accent-blue);">--</div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button type="button" id="sync-rules-btn" class="btn btn-secondary btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Sync Rules from Google Sheet
          </button>
          <button type="button" id="reset-knowledge-btn" class="btn btn-secondary btn-sm" style="color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.3);">
            Reset Learned Knowledge to Default
          </button>
        </div>
      </div>

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

  // Open Step-by-Step Setup Guide Modal
  const openGuideBtn = container.querySelector('#open-guide-btn');
  if (openGuideBtn) {
    openGuideBtn.onclick = () => openSetupGuideModal();
  }

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
    const ocrLang = container.querySelector('#setting-ocr-lang').value;
    const theme = container.querySelector('#setting-theme').value;
    const uploadImagesToDrive = container.querySelector('#setting-upload-images').checked;

    saveSettings({
      appsScriptUrl: url,
      appToken: token,
      scannedBy,
      mode,
      ocrLang,
      theme,
      uploadImagesToDrive
    });

    // Apply theme
    applyTheme(theme);

    showToast('Settings saved successfully!', 'success');
  };

  // Test Connection
  const testBtn = container.querySelector('#test-connection-btn');
  const testBox = container.querySelector('#test-result-box');

  testBtn.onclick = async () => {
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
    const settings = getSettings();
    const uploadImages = !!settings.uploadImagesToDrive;

    for (const card of pending) {
      try {
        const res = await saveRecord(
          card.record,
          uploadImages ? card.frontBase64 : null,
          uploadImages ? card.backBase64 : null
        );
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

  // Update Knowledge Base Stats
  function updateKnowledgeStats() {
    const summary = getKnowledgeSummary();
    const desigEl = container.querySelector('#stat-designations');
    const compEl = container.querySelector('#stat-companies');
    const addrEl = container.querySelector('#stat-addresses');
    const confEl = container.querySelector('#stat-confusions');

    if (desigEl) desigEl.textContent = summary.designationsCount;
    if (compEl) compEl.textContent = summary.knownCompaniesCount;
    if (addrEl) addrEl.textContent = summary.addressWordsCount;
    if (confEl) confEl.textContent = summary.ocrConfusionsCount;
  }

  updateKnowledgeStats();

  // Sync Rules from Google Sheet button
  const syncRulesBtn = container.querySelector('#sync-rules-btn');
  if (syncRulesBtn) {
    syncRulesBtn.onclick = async () => {
      if (!navigator.onLine) {
        showToast('Device is offline. Connect to internet to sync rules.', 'warning');
        return;
      }
      syncRulesBtn.setAttribute('disabled', 'true');
      syncRulesBtn.textContent = 'Syncing Rules...';
      try {
        const res = await getKnowledgeRules();
        if (res && res.rules) {
          const syncRes = await syncKnowledgeFromBackend(res.rules);
          updateKnowledgeStats();
          showToast(`Synced ${syncRes.added} custom rules from Google Sheet!`, 'success');
        } else {
          showToast('No rules found in Sheet tab "Rules".', 'info');
        }
      } catch (err) {
        console.error(err);
        showToast(`Rule sync failed: ${err.message}`, 'error');
      } finally {
        syncRulesBtn.removeAttribute('disabled');
        syncRulesBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          Sync Rules from Google Sheet
        `;
      }
    };
  }

  // Reset Learned Knowledge button
  const resetKnowledgeBtn = container.querySelector('#reset-knowledge-btn');
  if (resetKnowledgeBtn) {
    resetKnowledgeBtn.onclick = async () => {
      if (confirm('Reset all learned corrections and cached rules back to bundled defaults?')) {
        await resetLearnedKnowledge();
        updateKnowledgeStats();
        showToast('Knowledge Base reset to default.', 'info');
      }
    };
  }

  // Clear Local Data
  const clearBtn = container.querySelector('#clear-local-db-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm('Are you sure? This will delete locally stored cards and reset settings.')) {
        localStorage.clear();
        indexedDB.deleteDatabase('CardScannerDB');
        showToast('Local database cleared. Reloading...', 'info');
        setTimeout(() => window.location.reload(), 1000);
      }
    };
  }
}

/**
 * Interactive Setup Guide Modal with Step-by-Step Instructions
 */
function openSetupGuideModal() {
  openModal({
    title: 'Google Apps Script সেটআপ নির্দেশিকা',
    contentHtml: `
      <div style="font-size: 0.85rem; line-height: 1.6; max-height: 75vh; overflow-y: auto; padding-right: 4px;">
        <!-- CardImages Notice -->
        <div style="background-color: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-md); padding: 12px; margin-bottom: 16px;">
          <div style="font-weight: 700; color: var(--accent-emerald); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
            <span>💡</span> কার্ডের ছবি (CardImages) জমা রাখতে না চাইলে:
          </div>
          <p style="color: var(--text-primary); font-size: 0.8rem; margin: 0;">
            আপনি যদি গুগল ড্রাইভে কোনো ছবি রাখতে না চান, তবে Google Drive-এ <strong>কোনো ফোল্ডার তৈরি করার প্রয়োজন নেই</strong>। নিচের ধাপ ৩-এ <code>DRIVE_FOLDER_ID</code> দেওয়ার দরকার নেই। অ্যাপের সেটিংস থেকে "Upload Photos to Google Drive" সুইচটি বন্ধ রাখলেই চলবে। এতে কার্ডের টেক্সট সরাসরি গুগল শিটে সেভ হবে বিদ্যুৎ গতিতে!
          </p>
        </div>

        <!-- Step 1 -->
        <div style="margin-bottom: 16px;">
          <h4 style="font-size: 0.92rem; font-weight: 700; color: var(--accent-blue); margin-bottom: 6px;">
            ১. Google Sheet তৈরি ও Apps Script খোলা
          </h4>
          <ol style="margin-left: 20px; color: var(--text-secondary); font-size: 0.82rem;">
            <li><a href="https://sheets.new" target="_blank" rel="noreferrer" style="color: var(--accent-blue);">sheets.new</a> এ গিয়ে নতুন গুগল শিট বানান, নাম দিন <strong>Card Scanner</strong>।</li>
            <li>ওপরের মেনু থেকে <strong>Extensions</strong> > <strong>Apps Script</strong> এ ক্লিক করুন।</li>
            <li>বাম পাশে প্রজেক্টের নাম দিন <strong>Card Scanner Backend</strong>।</li>
          </ol>
        </div>

        <!-- Step 2 -->
        <div style="margin-bottom: 16px;">
          <h4 style="font-size: 0.92rem; font-weight: 700; color: var(--accent-blue); margin-bottom: 6px;">
            ২. Code.gs কোড কপি ও পেস্ট করুন
          </h4>
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 8px;">
            কোডটি আপনার লোকাল প্রজেক্টের <code>apps-script/Code.gs</code> ফাইলে রয়েছে। আপনি সরাসরি ফাইল থেকেও কপি করতে পারেন, অথবা নিচের বাটনে এক ক্লিকেই সম্পূর্ণ কোড ক্লিপবোর্ডে কপি করে নিতে পারেন:
          </p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
            <button type="button" id="copy-codegs-btn" class="btn btn-primary btn-sm" style="width: auto; gap: 6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span id="copy-btn-text">📋 সম্পূর্ণ Code.gs কপি করুন</span>
            </button>
            <button type="button" id="toggle-code-preview-btn" class="btn btn-secondary btn-sm" style="width: auto;">
              👁️ কোড প্রিভিউ দেখুন
            </button>
          </div>
          <div id="code-preview-block" style="display: none; margin-top: 8px; max-height: 180px; overflow-y: auto; background: var(--bg-input); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-family: var(--font-mono); font-size: 0.72rem; white-space: pre; user-select: all;"></div>
        </div>

        <!-- Step 3 -->
        <div style="margin-bottom: 16px;">
          <h4 style="font-size: 0.92rem; font-weight: 700; color: var(--accent-blue); margin-bottom: 6px;">
            ৩. Script Properties (গোপন কি) যোগ করুন
          </h4>
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 8px;">
            Apps Script-এর বাম মেনুর <strong>Project Settings (⚙️)</strong> এ যান। নিচে <strong>Script Properties</strong> এ গিয়ে নিচের ৩টি কি দিন:
          </p>
          <div style="background: var(--bg-input); border-radius: var(--radius-sm); padding: 8px; font-family: var(--font-mono); font-size: 0.75rem;">
            • <strong>GEMINI_API_KEY</strong>: (<a href="https://aistudio.google.com" target="_blank" rel="noreferrer" style="color: var(--accent-blue);">Google AI Studio</a> থেকে ফ্রি কি)<br/>
            • <strong>APP_TOKEN</strong>: (আপনার পছন্দের গোপন পাসওয়ার্ড, যেমন: card_sec_123)<br/>
            • <strong>GEMINI_MODEL</strong>: gemini-2.5-flash<br/>
            • <em>(ছবি সেভ করতে চাইলে DRIVE_FOLDER_ID দেবেন, না চাইলে একদম প্রয়োজন নেই)</em>
          </div>
        </div>

        <!-- Step 4 -->
        <div style="margin-bottom: 16px;">
          <h4 style="font-size: 0.92rem; font-weight: 700; color: var(--accent-blue); margin-bottom: 6px;">
            ৪. setup রান ও পারমিশন দেওয়া
          </h4>
          <ol style="margin-left: 20px; color: var(--text-secondary); font-size: 0.82rem;">
            <li>এডিটরে ফিরে ওপরের ফাংশন ড্রপডাউনে <strong>setup</strong> সিলেক্ট করে <strong>Run</strong> চাপুন।</li>
            <li><strong>Review Permissions</strong> আসলে জিমেইল সিলেক্ট করে <strong>Advanced > Go to Card Scanner Backend (unsafe) > Allow</strong> চাপুন।</li>
            <li>আপনার গুগল শিটে <strong>Cards</strong> নামের ট্যাব ও হেডার তৈরি হয়ে যাবে।</li>
          </ol>
        </div>

        <!-- Step 5 -->
        <div style="margin-bottom: 16px;">
          <h4 style="font-size: 0.92rem; font-weight: 700; color: var(--accent-blue); margin-bottom: 6px;">
            ৫. Web App ডেপ্লয় ও URL সংগ্রহ (জরুরি)
          </h4>
          <ol style="margin-left: 20px; color: var(--text-secondary); font-size: 0.82rem;">
            <li>ওপরে ডানে <strong>Deploy</strong> > <strong>New deployment</strong> চাপুন।</li>
            <li>Select type (⚙️) থেকে <strong>Web app</strong> বেছে নিন।</li>
            <li><strong>Execute as:</strong> Me</li>
            <li><strong>Who has access:</strong> <span style="color: var(--accent-amber); font-weight: 700;">Anyone</span> (এটি Anyone না দিলে অ্যাপ শিটে ডেটা পাঠাতে পারবে না!)</li>
            <li><strong>Deploy</strong> বাটনে চাপুন এবং প্রাপ্ত <strong>/exec</strong> URL কপি করুন।</li>
          </ol>
        </div>

        <!-- Step 6 -->
        <div style="margin-bottom: 8px;">
          <h4 style="font-size: 0.92rem; font-weight: 700; color: var(--accent-blue); margin-bottom: 6px;">
            ৬. অ্যাপের Settings-এ বসান
          </h4>
          <p style="font-size: 0.82rem; color: var(--text-secondary);">
            কপি করা URL এবং আপনার APP_TOKEN এই Settings পেজের ফিল্ডে বসিয়ে <strong>Test Connection</strong> চাপুন। সবুজ টিক দেখলেই সেটআপ সম্পন্ন!
          </p>
        </div>
      </div>
    `,
    onRender: (modalContainer) => {
      const copyBtn = modalContainer.querySelector('#copy-codegs-btn');
      const copyBtnText = modalContainer.querySelector('#copy-btn-text');
      if (copyBtn) {
        copyBtn.onclick = async () => {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(APPS_SCRIPT_SOURCE);
            } else {
              const ta = document.createElement('textarea');
              ta.value = APPS_SCRIPT_SOURCE;
              ta.style.position = 'fixed';
              ta.style.left = '-9999px';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            }
            copyBtn.style.backgroundColor = 'var(--accent-emerald)';
            if (copyBtnText) copyBtnText.textContent = '✓ সম্পূর্ণ কোড কপি হয়েছে!';
            showToast('✓ Code.gs সম্পূর্ণ কোড ক্লিপবোর্ডে কপি হয়েছে! Apps Script এডিটরে পেস্ট করুন।', 'success', 4000);
          } catch (err) {
            console.error('Copy failed:', err);
            showToast('ক্লিপবোর্ডে কপি করতে সমস্যা হয়েছে, প্রিভিউ থেকে ম্যানুয়ালি কপি করুন', 'error');
          }
        };
      }

      const previewBtn = modalContainer.querySelector('#toggle-code-preview-btn');
      const previewBlock = modalContainer.querySelector('#code-preview-block');
      if (previewBtn && previewBlock) {
        previewBtn.onclick = () => {
          if (previewBlock.style.display === 'none') {
            previewBlock.textContent = APPS_SCRIPT_SOURCE;
            previewBlock.style.display = 'block';
            previewBtn.textContent = '❌ প্রিভিউ লুকান';
          } else {
            previewBlock.style.display = 'none';
            previewBtn.textContent = '👁️ কোড প্রিভিউ দেখুন';
          }
        };
      }
    }
  });
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
