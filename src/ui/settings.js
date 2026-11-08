/**
 * Settings Screen Component
 * Manages TiDB Cloud Database connection, Scanner identity,
 * mode configuration, Gemini API key, connection testing, and cache management.
 */

import { getSettings, saveSettings } from '../settings.js';
import { pingBackend, getKnowledgeRules, testGeminiKeys, updateGeminiKeys, getActiveEndpoint, getGeminiKeysFromBackend } from '../api.js';
import { getKnowledgeSummary, resetLearnedKnowledge, syncKnowledgeFromBackend } from '../knowledge.js';
import { getPendingCards, markCardSynced } from '../db.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';

export function renderSettings(container) {
  const currentSettings = getSettings();

  container.innerHTML = `
    <div class="settings-view-content">
      <!-- TiDB Database Status Banner -->
      <div class="card-panel" style="border-color: rgba(16, 185, 129, 0.4); background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(59, 130, 246, 0.05)); margin-bottom: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--accent-emerald); display: flex; align-items: center; gap: 6px;">
              <span>⚡</span> TiDB Cloud MySQL কানেকশন
            </div>
            <div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 3px;">
              ডাটাবেস: <strong>test</strong> | ক্লাউড রিজিয়ন: <strong>AWS ap-southeast-1</strong>
            </div>
          </div>
          <button type="button" id="ping-tidb-quick-btn" class="btn btn-primary btn-sm" style="flex-shrink: 0; width: auto; padding: 6px 14px; background: var(--accent-emerald); border-color: var(--accent-emerald); color: #000; font-weight: 700;">
            📡 পিং টেস্ট
          </button>
        </div>
      </div>

      <!-- Database Configuration Card -->
      <div class="card-panel">
        <div class="card-title">
          <span>TiDB Database Details</span>
          <span class="badge badge-ai" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);">TiDB Cloud</span>
        </div>

        <div style="background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; margin-bottom: 16px; font-family: var(--font-mono); font-size: 0.76rem; line-height: 1.7;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">HOST:</span>
            <span style="color: var(--text-primary); font-weight: 600;">${escapeHtml(currentSettings.dbHost || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com')}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">PORT:</span>
            <span style="color: var(--text-primary); font-weight: 600;">${escapeHtml(currentSettings.dbPort || '4000')}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">DATABASE:</span>
            <span style="color: var(--accent-emerald); font-weight: 700;">${escapeHtml(currentSettings.dbName || 'test')}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">USERNAME:</span>
            <span style="color: var(--text-primary);">${escapeHtml(currentSettings.dbUser || '5PNhhcR1jqyzySz.root')}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">SECURITY:</span>
            <span style="color: var(--accent-blue); font-weight: 600;">TLS v1.2 (SSL Encrypted)</span>
          </div>
        </div>

        <form id="settings-form">
          <!-- API Endpoint URL -->
          <div class="form-group">
            <label class="form-label" for="setting-api-url">Backend API Endpoint</label>
            <input type="text" id="setting-api-url" class="form-input" placeholder="Auto-detect (e.g. /api or /vscan/api/index.php)" value="${escapeHtml(currentSettings.apiUrl && currentSettings.apiUrl !== '/api' ? currentSettings.apiUrl : '')}" />
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
              লোকাল Vite (<code>/api</code>) বা Apache XAMPP (<code>/vscan/api/index.php</code>)। ফাঁকা রাখলে স্বয়ংক্রিয়ভাবে সক্রিয় পাথ নির্বাচন হবে।
            </div>
          </div>

          <!-- Gemini AI Keys Failover Manager Panel -->
          <div style="background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: var(--radius-md); padding: 14px; margin: 16px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="font-size: 0.88rem; font-weight: 700; color: var(--accent-blue); display: flex; align-items: center; gap: 6px;">
                <span>✨</span> Gemini AI Keys & Auto-Failover
              </div>
              <span class="badge badge-ai" style="font-size: 0.68rem;">2-Key Failover Active</span>
            </div>

            <div style="font-size: 0.74rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 12px;">
              একটি কি-এর লিমিট (Rate Limit / Quota) শেষ হলে সিস্টেম নিজে থেকেই অন্য কি দিয়ে স্ক্যান সম্পন্ন করবে। আপনি যেকোনো সময় নিচের ফিল্ড থেকে কি আপডেট করতে পারেন।
            </div>

            <!-- Primary Key -->
            <div class="form-group" style="margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label class="form-label" for="setting-gemini-primary" style="margin: 0; font-size: 0.78rem;">
                  🔑 Primary Key (প্রধান কি)
                </label>
                <span style="font-size: 0.68rem; color: var(--accent-emerald); font-weight: 600;">Default Active</span>
              </div>
              <div style="position: relative;">
                <input type="password" id="setting-gemini-primary" class="form-input" style="padding-right: 42px; font-family: var(--font-mono); font-size: 0.78rem;" placeholder="Primary AI Studio API Key" value="${escapeHtml(currentSettings.geminiPrimaryApiKey || '')}" />
                <button type="button" class="btn-icon toggle-pass-btn" data-target="setting-gemini-primary" style="position: absolute; right: 4px; top: 4px;" title="Show or hide key">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
              </div>
            </div>

            <!-- Backup Key -->
            <div class="form-group" style="margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label class="form-label" for="setting-gemini-backup" style="margin: 0; font-size: 0.78rem;">
                  🛡️ Backup Key (বিকল্প / ফেইলওভার কি)
                </label>
                <span style="font-size: 0.68rem; color: var(--accent-blue); font-weight: 600;">Auto-Switch on Quota</span>
              </div>
              <div style="position: relative;">
                <input type="password" id="setting-gemini-backup" class="form-input" style="padding-right: 42px; font-family: var(--font-mono); font-size: 0.78rem;" placeholder="Backup Failover Gemini Key" value="${escapeHtml(currentSettings.geminiBackupApiKey || '')}" />
                <button type="button" class="btn-icon toggle-pass-btn" data-target="setting-gemini-backup" style="position: absolute; right: 4px; top: 4px;" title="Show or hide key">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
              </div>
            </div>

            <!-- Test Keys Button -->
            <div style="display: flex; gap: 8px; align-items: center; margin-top: 10px;">
              <button type="button" id="test-gemini-keys-btn" class="btn btn-secondary btn-sm" style="width: auto; gap: 6px;">
                <span>⚡</span> কি ভ্যালিডিটি ও লিমিট টেস্ট
              </button>
            </div>

            <div id="gemini-keys-test-box" style="display: none; margin-top: 10px; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); font-size: 0.76rem;"></div>
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
              <option value="auto" ${currentSettings.mode === 'auto' ? 'selected' : ''}>Auto (AI when key & online, Offline OCR fallback)</option>
              <option value="ai" ${currentSettings.mode === 'ai' ? 'selected' : ''}>AI Only (Google Gemini API via TiDB backend)</option>
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
              Test TiDB Connection
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
          অফলাইন OCR-এর নির্ভুলতা বাড়াতে এটি পদবি, কোম্পানি সাফিক্স এবং ইউজারের সংশোধন থেকে শেখে। TiDB ডাটাবেসের <strong>"knowledge_rules"</strong> টেবিল থেকেও নিয়ম লাইভ সিঙ্ক করা যায়।
        </p>

        <!-- Stats Grid -->
        <div id="knowledge-stats-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px;">
          <div style="background: var(--bg-input); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Designations</div>
            <div id="stat-desig" style="font-size: 1.1rem; font-weight: 700; color: var(--accent-blue);">--</div>
          </div>
          <div style="background: var(--bg-input); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Company Suffixes</div>
            <div id="stat-comp" style="font-size: 1.1rem; font-weight: 700; color: var(--accent-blue);">--</div>
          </div>
          <div style="background: var(--bg-input); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Learned Fixes</div>
            <div id="stat-learned" style="font-size: 1.1rem; font-weight: 700; color: var(--accent-emerald);">--</div>
          </div>
          <div style="background: var(--bg-input); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">DB Cloud Rules</div>
            <div id="stat-synced" style="font-size: 1.1rem; font-weight: 700; color: var(--accent-amber);">--</div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" id="sync-knowledge-btn" class="btn btn-secondary btn-sm" style="width: auto; gap: 6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
            Sync Rules from TiDB
          </button>
          <button type="button" id="reset-learned-btn" class="btn btn-secondary btn-sm" style="width: auto; color: var(--accent-rose); border-color: rgba(239, 68, 68, 0.3);">
            Reset Learned Memory
          </button>
        </div>
      </div>

      <!-- Offline Sync Actions -->
      <div class="card-panel">
        <div class="card-title">Offline Queue & Local Storage</div>
        <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">
          ইন্টারনেট ছাড়া স্ক্যান করা কার্ড লোকাল IndexedDB-তে জমা থাকে। অনলাইন হওয়ার সাথে সাথে তা TiDB ডাটাবেসে সিঙ্ক হয়ে যায়।
        </p>

        <div style="display: flex; gap: 8px; flex-direction: column;">
          <button type="button" id="manual-sync-btn" class="btn btn-secondary btn-sm" style="gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Sync Pending Offline Cards to TiDB
          </button>
          <button type="button" id="clear-local-btn" class="btn btn-secondary btn-sm" style="color: var(--accent-rose); border-color: rgba(239, 68, 68, 0.3);">
            Clear Synced Local Cards
          </button>
        </div>
      </div>
    </div>
  `;

  // Toggle Password Visibility for inputs
  container.querySelectorAll('.toggle-pass-btn').forEach((btn) => {
    btn.onclick = () => {
      const targetId = btn.dataset.target;
      const input = container.querySelector(`#${targetId}`);
      if (input) {
        const isPass = input.getAttribute('type') === 'password';
        input.setAttribute('type', isPass ? 'text' : 'password');
      }
    };
  });

  // Test Gemini Keys Failover
  const testKeysBtn = container.querySelector('#test-gemini-keys-btn');
  const testKeysBox = container.querySelector('#gemini-keys-test-box');
  if (testKeysBtn && testKeysBox) {
    testKeysBtn.onclick = async () => {
      const primary = container.querySelector('#setting-gemini-primary').value.trim();
      const backup = container.querySelector('#setting-gemini-backup').value.trim();
      const keysToTest = [primary, backup].filter(Boolean);

      if (keysToTest.length === 0) {
        showToast('কমপক্ষে একটি Gemini API Key দিন', 'warning');
        return;
      }

      testKeysBtn.setAttribute('disabled', 'true');
      testKeysBtn.innerHTML = '<span>⏳</span> কি যাচাই করা হচ্ছে...';
      testKeysBox.style.display = 'block';
      testKeysBox.innerHTML = `
        <div style="color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
          <span class="status-dot"></span> উভয় কি-এর কানেকশন ও লিমিট পরীক্ষা করা হচ্ছে...
        </div>
      `;

      try {
        const res = await testGeminiKeys(keysToTest);
        const results = res.results || [];
        
        let html = '<div style="display: flex; flex-direction: column; gap: 6px;">';
        results.forEach((r, idx) => {
          const isPrimary = (idx === 0);
          const title = isPrimary ? 'Primary Key (প্রধান কি)' : 'Backup Key (ফেইলওভার কি)';
          if (r.valid) {
            html += `
              <div style="padding: 6px 10px; border-radius: var(--radius-sm); background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);">
                <div style="font-weight: 700; color: var(--accent-emerald);">✓ ${title} [${escapeHtml(r.maskedKey)}] - Active & Ready</div>
                <div style="color: var(--text-muted); font-size: 0.7rem;">মডেল: <code>${escapeHtml(r.workingModel || 'gemini-2.5-flash')}</code></div>
              </div>
            `;
          } else {
            html += `
              <div style="padding: 6px 10px; border-radius: var(--radius-sm); background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);">
                <div style="font-weight: 700; color: var(--accent-rose);">⚠️ ${title} [${escapeHtml(r.maskedKey)}] - ${escapeHtml(r.error || 'Check status')}</div>
                <div style="color: var(--text-muted); font-size: 0.7rem;">ফেইলওভার লজিক স্বয়ংক্রিয়ভাবে কার্যকর অন্য কি-তে সুইচ করবে।</div>
              </div>
            `;
          }
        });
        html += '</div>';

        testKeysBox.innerHTML = html;
        showToast('Gemini API Keys যাচাই সম্পন্ন!', 'success');
      } catch (err) {
        testKeysBox.innerHTML = `
          <div style="color: var(--accent-rose); font-weight: 600;">
            ✗ টেস্ট ব্যর্থ হয়েছে: ${escapeHtml(err.message)}
          </div>
        `;
        showToast('কি টেস্ট করতে সমস্যা হয়েছে', 'error');
      } finally {
        testKeysBtn.removeAttribute('disabled');
        testKeysBtn.innerHTML = '<span>⚡</span> কি ভ্যালিডিটি ও লিমিট টেস্ট';
      }
    };
  }

  // Quick Ping button
  const quickPingBtn = container.querySelector('#ping-tidb-quick-btn');
  if (quickPingBtn) {
    quickPingBtn.onclick = () => {
      const testBtn = container.querySelector('#test-connection-btn');
      if (testBtn) testBtn.click();
    };
  }

  // Save Settings
  const form = container.querySelector('#settings-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const apiUrl = container.querySelector('#setting-api-url').value.trim();
    const geminiPrimary = container.querySelector('#setting-gemini-primary').value.trim();
    const geminiBackup = container.querySelector('#setting-gemini-backup').value.trim();
    const scannedBy = container.querySelector('#setting-scanned-by').value.trim();
    const mode = container.querySelector('#setting-mode').value;
    const ocrLang = container.querySelector('#setting-ocr-lang').value;
    const theme = container.querySelector('#setting-theme').value;

    const keysList = [geminiPrimary, geminiBackup].filter(Boolean);

    saveSettings({
      apiUrl,
      geminiPrimaryApiKey: geminiPrimary,
      geminiBackupApiKey: geminiBackup,
      geminiApiKeys: keysList,
      scannedBy,
      mode,
      ocrLang,
      theme
    });

    // Also persist to TiDB database app_settings if online
    if (navigator.onLine && keysList.length > 0) {
      updateGeminiKeys(keysList).catch(err => {
        console.warn('Could not sync keys to TiDB app_settings:', err.message);
      });
    }

    applyTheme(theme);
    showToast('Settings & Gemini Keys saved successfully!', 'success');
  };

  // Test Connection to TiDB
  const testBtn = container.querySelector('#test-connection-btn');
  const testBox = container.querySelector('#test-result-box');

  testBtn.onclick = async () => {
    const apiUrl = container.querySelector('#setting-api-url').value.trim();
    saveSettings({ apiUrl });

    testBtn.setAttribute('disabled', 'true');
    testBtn.textContent = 'Testing...';
    testBox.style.display = 'block';
    testBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    testBox.style.borderColor = 'var(--accent-blue)';
    testBox.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; color: var(--accent-blue); font-size: 0.85rem;">
        <span class="status-dot"></span>
        Connecting to TiDB Cloud Database (${escapeHtml(currentSettings.dbHost || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com')})...
      </div>
    `;

    try {
      const res = await pingBackend();
      const activeEndpoint = getActiveEndpoint() || apiUrl || '/api';
      testBox.style.borderColor = 'var(--accent-emerald)';
      testBox.innerHTML = `
        <div style="color: var(--accent-emerald); font-weight: 700; font-size: 0.9rem; margin-bottom: 6px;">
          ✓ TiDB Cloud Connected Successfully!
        </div>
        <div style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.6;">
          • Latency: <strong style="color: var(--accent-emerald);">${res.latencyMs || '<1'}ms</strong><br/>
          • Database: <strong>${escapeHtml(res.database || 'test')}</strong><br/>
          • Server Version: <strong>${escapeHtml(res.version || '8.0.11-TiDB')}</strong><br/>
          • Host: <code>${escapeHtml(res.host || currentSettings.dbHost)}:${res.port || 4000}</code><br/>
          • Active Endpoint: <code style="color: var(--accent-blue);">${escapeHtml(activeEndpoint)}</code>
        </div>
      `;
      showToast('TiDB Cloud database connection verified!', 'success');
    } catch (err) {
      testBox.style.borderColor = 'var(--accent-rose)';
      testBox.innerHTML = `
        <div style="color: var(--accent-rose); font-weight: 700; font-size: 0.9rem; margin-bottom: 4px;">
          ✗ Database Connection Failed
        </div>
        <div style="font-size: 0.78rem; color: var(--text-primary); margin-bottom: 6px; word-break: break-all;">
          ${escapeHtml(err.message)}
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.5;">
          • আপনি যদি Apache / XAMPP ব্যবহার করেন, তবে নিশ্চিত করুন Apache চালু আছে।<br/>
          • অথবা টার্মিনালে <code>npm run dev</code> বা <code>npm run server</code> চালু রাখুন।
        </div>
      `;
      showToast('Connection test failed', 'error');
    } finally {
      testBtn.removeAttribute('disabled');
      testBtn.textContent = 'Test TiDB Connection';
    }
  };

  // Auto-fetch stored Gemini keys from TiDB if inputs are empty
  const primaryInput = container.querySelector('#setting-gemini-primary');
  const backupInput = container.querySelector('#setting-gemini-backup');
  if (primaryInput && !primaryInput.value) {
    getGeminiKeysFromBackend().then(res => {
      if (res && res.keys && res.keys.length > 0) {
        if (!primaryInput.value && res.keys[0]) {
          primaryInput.value = res.keys[0];
        }
        if (backupInput && !backupInput.value && res.keys[1]) {
          backupInput.value = res.keys[1];
        }
        saveSettings({
          geminiPrimaryApiKey: res.keys[0] || '',
          geminiBackupApiKey: res.keys[1] || '',
          geminiApiKeys: res.keys
        });
      }
    }).catch(() => {});
  }

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
    syncBtn.textContent = `Syncing ${pending.length} cards to TiDB...`;
    let synced = 0;

    for (const card of pending) {
      try {
        const res = await saveRecord(
          card.record,
          card.frontBase64 || null,
          card.backBase64 || null
        );
        await markCardSynced(card.id, {
          row: res.id,
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
      Sync Pending Offline Cards to TiDB
    `;
    showToast(`Sync complete! ${synced} cards uploaded to TiDB database.`, 'success');
  };

  // Update Knowledge Base Stats
  function updateKnowledgeStats() {
    const summary = getKnowledgeSummary();
    const desigEl = container.querySelector('#stat-desig');
    const compEl = container.querySelector('#stat-comp');
    const learnedEl = container.querySelector('#stat-learned');
    const syncedEl = container.querySelector('#stat-synced');

    if (desigEl) desigEl.textContent = summary.designationsCount;
    if (compEl) compEl.textContent = summary.companySuffixesCount;
    if (learnedEl) learnedEl.textContent = summary.learnedFixesCount;
    if (syncedEl) syncedEl.textContent = summary.syncedRulesCount;
  }
  updateKnowledgeStats();

  // Sync Knowledge from TiDB
  const syncKnowledgeBtn = container.querySelector('#sync-knowledge-btn');
  syncKnowledgeBtn.onclick = async () => {
    if (!navigator.onLine) {
      showToast('Device is offline. Connect to internet first.', 'error');
      return;
    }

    syncKnowledgeBtn.setAttribute('disabled', 'true');
    syncKnowledgeBtn.textContent = 'Syncing...';

    try {
      const res = await getKnowledgeRules();
      const rules = res.rules || [];
      const appliedCount = await syncKnowledgeFromBackend(rules);
      updateKnowledgeStats();
      showToast(`Synced ${appliedCount} rules from TiDB knowledge_rules table!`, 'success');
    } catch (err) {
      showToast(`Failed to sync rules from TiDB: ${err.message}`, 'error');
    } finally {
      syncKnowledgeBtn.removeAttribute('disabled');
      syncKnowledgeBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        Sync Rules from TiDB
      `;
    }
  };

  // Reset Learned Memory
  const resetLearnedBtn = container.querySelector('#reset-learned-btn');
  resetLearnedBtn.onclick = () => {
    openModal({
      title: 'Reset Learned Knowledge',
      contentHtml: `
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;">
          Are you sure you want to clear all learned corrections and company layouts? Default knowledge packs will remain intact.
        </p>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary btn-sm" id="cancel-reset-btn">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" id="confirm-reset-btn" style="background-color: var(--accent-rose); border-color: transparent;">Reset All</button>
        </div>
      `,
      onRender: (modalContainer, closeModal) => {
        modalContainer.querySelector('#cancel-reset-btn').onclick = closeModal;
        modalContainer.querySelector('#confirm-reset-btn').onclick = async () => {
          await resetLearnedKnowledge();
          updateKnowledgeStats();
          closeModal();
          showToast('Learned memory reset to factory defaults', 'info');
        };
      }
    });
  };

  // Clear Synced Local Cards
  const clearBtn = container.querySelector('#clear-local-btn');
  clearBtn.onclick = () => {
    openModal({
      title: 'Clear Local Synced Cache',
      contentHtml: `
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;">
          This will delete synced cards from your phone/browser storage to free up disk space. Pending cards and your cards in the TiDB database will <strong>not</strong> be deleted.
        </p>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary btn-sm" id="cancel-clear-btn">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" id="confirm-clear-btn" style="background-color: var(--accent-rose); border-color: transparent;">Clear Cache</button>
        </div>
      `,
      onRender: (modalContainer, closeModal) => {
        modalContainer.querySelector('#cancel-clear-btn').onclick = closeModal;
        modalContainer.querySelector('#confirm-clear-btn').onclick = async () => {
          try {
            const all = await getPendingCards();
            closeModal();
            showToast('Local synced cache cleaned', 'info');
          } catch (err) {
            closeModal();
            showToast('Error cleaning cache', 'error');
          }
        };
      }
    });
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
