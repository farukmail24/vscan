/**
 * Review Screen Component
 * Allows user verification, editing, tap-to-assign OCR lines, duplicate checks,
 * and saving to Google Sheet and local IndexedDB.
 */

import { getState, clearCurrentScan, incrementBatchCount } from '../store.js';
import { saveRecord, checkDuplicate } from '../api.js';
import { saveCardLocal, saveCompanyLayout, getCompanyLayout } from '../db.js';
import { getSettings } from '../settings.js';
import { openImageZoomModal } from './modal.js';
import { showToast } from './toast.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function renderReview(container) {
  const state = getState();
  const settings = getSettings();
  const currentScan = state.currentScan;

  if (!currentScan || !currentScan.record) {
    container.innerHTML = `
      <div class="card-panel" style="text-align: center; padding: 40px 20px;">
        <div style="color: var(--text-muted); margin-bottom: 16px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="5" width="20" height="14" rx="2"></rect>
            <line x1="2" y1="10" x2="22" y2="10"></line>
          </svg>
        </div>
        <h2 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 8px;">No Card to Review</h2>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px;">
          Photograph or upload a business card from the Scan tab to review and edit its extracted details.
        </p>
        <a href="#/scan" class="btn btn-primary" style="max-width: 240px; margin: 0 auto; text-decoration: none;">
          Go to Scan
        </a>
      </div>
    `;
    return;
  }

  const { id, record, frontBase64, backBase64, ocrLines, source } = currentScan;
  const originalRecord = { ...record }; // Copy to check if user edited uncertain fields

  const phones = Array.isArray(record.phones) ? record.phones : [];
  const emails = Array.isArray(record.emails) ? record.emails : [];
  const websites = Array.isArray(record.websites) ? record.websites : [];
  const uncertainFields = new Set(record.uncertain_fields || []);

  let selectedOcrLineText = '';

  const sourceBadgeClass = source === 'AI' ? 'badge-ai' : (source === 'vCard' ? 'badge-vcard' : 'badge-offline');

  container.innerHTML = `
    <div class="review-view-content">
      <!-- Duplicate Warning Banner (hidden by default) -->
      <div id="duplicate-banner" class="card-panel" style="display: none; background-color: rgba(245, 158, 11, 0.15); border-color: var(--accent-amber); margin-bottom: 14px;">
        <div style="display: flex; gap: 10px; align-items: flex-start;">
          <div style="color: var(--accent-amber); margin-top: 2px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 0.9rem; color: var(--accent-amber); margin-bottom: 4px;">Possible Duplicate Card</div>
            <div id="duplicate-info-text" style="font-size: 0.8rem; color: var(--text-primary); margin-bottom: 10px;"></div>
            <div style="display: flex; gap: 8px;">
              <button type="button" id="dup-save-btn" class="btn btn-secondary btn-sm">Save Anyway</button>
              <button type="button" id="dup-skip-btn" class="btn btn-danger btn-sm">Skip / Discard</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Card Previews (Tap to zoom) -->
      <div class="card-panel" style="padding: 12px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">Card Photos (Tap to Zoom)</span>
          <span class="badge ${sourceBadgeClass}">Source: ${source}</span>
        </div>

        <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px;">
          ${frontBase64 ? `
            <div id="front-zoom-trigger" style="flex: 1; cursor: pointer; position: relative;">
              <img src="${frontBase64}" alt="Card Front" style="width: 100%; height: 120px; object-fit: cover; border-radius: var(--radius-md); border: 1px solid var(--border-color);" />
              <span style="position: absolute; bottom: 6px; left: 6px; background: rgba(0,0,0,0.6); color: #fff; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px;">Front</span>
            </div>
          ` : ''}

          ${backBase64 ? `
            <div id="back-zoom-trigger" style="flex: 1; cursor: pointer; position: relative;">
              <img src="${backBase64}" alt="Card Back" style="width: 100%; height: 120px; object-fit: cover; border-radius: var(--radius-md); border: 1px solid var(--border-color);" />
              <span style="position: absolute; bottom: 6px; left: 6px; background: rgba(0,0,0,0.6); color: #fff; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px;">Back</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Tap to Assign Section (For Offline Extracted Cards) -->
      ${ocrLines && ocrLines.length > 0 ? `
        <div class="card-panel" style="margin-bottom: 14px; border-color: rgba(59, 130, 246, 0.4);">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--accent-blue);">
              ⚡ Tap-to-Assign OCR Lines
            </div>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${ocrLines.length} lines detected</span>
          </div>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; margin-bottom: 8px;">
            Tap a recognized line below, then tap any field's "Assign" button to fix errors with zero typing.
          </p>

          <div id="ocr-chips-list" class="ocr-chips-container">
            ${ocrLines.map(l => `
              <button type="button" class="ocr-chip" data-text="${escapeHtml(l.text)}">
                ${escapeHtml(l.text)}
              </button>
            `).join('')}
          </div>

          <div id="selected-chip-bar" style="display: none; margin-top: 10px; padding: 8px 12px; background: rgba(59, 130, 246, 0.1); border-radius: var(--radius-md); font-size: 0.8rem;">
            Selected: <strong id="selected-chip-text" style="color: var(--accent-blue);"></strong>
          </div>
        </div>
      ` : ''}

      <!-- Editable Contact Form -->
      <form id="review-form" class="card-panel">
        <!-- Name -->
        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="form-label" for="field-name" style="margin: 0;">Full Name</label>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="btn-icon btn-assign" data-target="field-name" title="Assign selected text">
                <span style="font-size: 0.75rem; color: var(--accent-blue); font-weight: 600;">+ Assign</span>
              </button>
              <button type="button" class="btn-icon btn-clear" data-target="field-name" title="Clear field">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Clear</span>
              </button>
            </div>
          </div>
          <input type="text" id="field-name" class="form-input ${uncertainFields.has('name') ? 'is-uncertain' : ''}" value="${escapeHtml(record.name || '')}" placeholder="e.g. Tanvir Ahmed" />
          ${uncertainFields.has('name') ? '<div class="field-hint">⚠️ Please verify extracted name</div>' : ''}
        </div>

        <!-- Designation -->
        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="form-label" for="field-designation" style="margin: 0;">Designation / Title</label>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="btn-icon btn-assign" data-target="field-designation" title="Assign selected text">
                <span style="font-size: 0.75rem; color: var(--accent-blue); font-weight: 600;">+ Assign</span>
              </button>
              <button type="button" class="btn-icon btn-clear" data-target="field-designation" title="Clear field">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Clear</span>
              </button>
            </div>
          </div>
          <input type="text" id="field-designation" class="form-input ${uncertainFields.has('designation') ? 'is-uncertain' : ''}" value="${escapeHtml(record.designation || '')}" placeholder="e.g. Managing Director" />
          ${uncertainFields.has('designation') ? '<div class="field-hint">⚠️ Please verify designation</div>' : ''}
        </div>

        <!-- Company -->
        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="form-label" for="field-company" style="margin: 0;">Company Name</label>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="btn-icon btn-assign" data-target="field-company" title="Assign selected text">
                <span style="font-size: 0.75rem; color: var(--accent-blue); font-weight: 600;">+ Assign</span>
              </button>
              <button type="button" class="btn-icon btn-clear" data-target="field-company" title="Clear field">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Clear</span>
              </button>
            </div>
          </div>
          <input type="text" id="field-company" class="form-input ${uncertainFields.has('company') ? 'is-uncertain' : ''}" value="${escapeHtml(record.company || '')}" placeholder="e.g. Apex Technologies Ltd." />
          ${uncertainFields.has('company') ? '<div class="field-hint">⚠️ Please verify company</div>' : ''}
        </div>

        <!-- Phone 1 & Phone 2 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label class="form-label" for="field-phone1" style="margin: 0;">Phone 1</label>
              <button type="button" class="btn-icon btn-assign" data-target="field-phone1" title="Assign selected text">
                <span style="font-size: 0.7rem; color: var(--accent-blue);">+ Assign</span>
              </button>
            </div>
            <input type="tel" id="field-phone1" class="form-input ${uncertainFields.has('phone1') ? 'is-uncertain' : ''}" value="${escapeHtml(phones[0] || '')}" placeholder="+8801XXXXXXXXX" />
            ${uncertainFields.has('phone1') ? '<div class="field-hint">⚠️ Invalid BD phone</div>' : ''}
          </div>

          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label class="form-label" for="field-phone2" style="margin: 0;">Phone 2</label>
              <button type="button" class="btn-icon btn-assign" data-target="field-phone2" title="Assign selected text">
                <span style="font-size: 0.7rem; color: var(--accent-blue);">+ Assign</span>
              </button>
            </div>
            <input type="tel" id="field-phone2" class="form-input" value="${escapeHtml(phones[1] || '')}" placeholder="02-XXXXXXX / Alt" />
          </div>
        </div>

        <!-- Email & Website -->
        <div class="form-group">
          <label class="form-label" for="field-email">Email Address</label>
          <input type="email" id="field-email" class="form-input" value="${escapeHtml(emails[0] || '')}" placeholder="e.g. name@company.com" />
        </div>

        <div class="form-group">
          <label class="form-label" for="field-website">Website URL</label>
          <input type="url" id="field-website" class="form-input" value="${escapeHtml(websites[0] || '')}" placeholder="https://www.example.com" />
        </div>

        <!-- Address -->
        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="form-label" for="field-address" style="margin: 0;">Physical Address</label>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="btn-icon btn-assign" data-target="field-address" title="Assign selected text">
                <span style="font-size: 0.75rem; color: var(--accent-blue); font-weight: 600;">+ Assign</span>
              </button>
              <button type="button" class="btn-icon btn-clear" data-target="field-address" title="Clear field">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Clear</span>
              </button>
            </div>
          </div>
          <textarea id="field-address" class="form-textarea ${uncertainFields.has('address') ? 'is-uncertain' : ''}" rows="2" placeholder="House, Road, Area, City">${escapeHtml(record.address || '')}</textarea>
          ${uncertainFields.has('address') ? '<div class="field-hint">⚠️ Please verify address</div>' : ''}
        </div>

        <!-- Notes -->
        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="form-label" for="field-notes" style="margin: 0;">Notes / Remaining OCR</label>
            <button type="button" class="btn-icon btn-assign" data-target="field-notes" title="Assign selected text">
              <span style="font-size: 0.75rem; color: var(--accent-blue); font-weight: 600;">+ Append</span>
            </button>
          </div>
          <textarea id="field-notes" class="form-textarea" rows="2" placeholder="Services, branches, slogans...">${escapeHtml(record.notes || '')}</textarea>
        </div>

        <!-- Tags -->
        <div class="form-group">
          <label class="form-label" for="field-tags">Tags (Comma-separated)</label>
          <input type="text" id="field-tags" class="form-input" value="${escapeHtml(record.tags ? (Array.isArray(record.tags) ? record.tags.join(', ') : record.tags) : 'Client, Business Card')}" placeholder="e.g. VIP, Tech, Dhaka, Expo" />
        </div>

        <!-- Action Buttons -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px;">
          <button type="button" id="discard-btn" class="btn btn-secondary">
            Discard
          </button>
          <button type="submit" id="save-btn" class="btn btn-primary">
            Save to Sheet
          </button>
        </div>
      </form>
    </div>
  `;

  // Attach Zoom modals
  const frontZoom = container.querySelector('#front-zoom-trigger');
  if (frontZoom) {
    frontZoom.onclick = () => openImageZoomModal(frontBase64, 'Card Front');
  }
  const backZoom = container.querySelector('#back-zoom-trigger');
  if (backZoom) {
    backZoom.onclick = () => openImageZoomModal(backBase64, 'Card Back');
  }

  // Duplicate Check on Open (if online)
  const dupBanner = container.querySelector('#duplicate-banner');
  const dupInfoText = container.querySelector('#duplicate-info-text');

  if (navigator.onLine && (emails.length > 0 || phones.length > 0)) {
    checkDuplicate(emails, phones).then((res) => {
      if (res && res.ok && res.duplicates && res.duplicates.length > 0) {
        const dup = res.duplicates[0];
        dupInfoText.innerHTML = `Found existing card: <strong>${escapeHtml(dup.name || 'Unknown')}</strong> (${escapeHtml(dup.company || 'No Company')}). ${escapeHtml(dup.reason || '')}`;
        dupBanner.style.display = 'block';
      }
    }).catch((err) => {
      console.warn('Duplicate check skipped:', err);
    });
  }

  container.querySelector('#dup-save-btn')?.addEventListener('click', () => {
    dupBanner.style.display = 'none';
  });

  container.querySelector('#dup-skip-btn')?.addEventListener('click', () => {
    clearCurrentScan();
    showToast('Card skipped', 'info');
    window.location.hash = '#/scan';
  });

  // Tap-to-assign handlers
  const chipsList = container.querySelector('#ocr-chips-list');
  const selectedBar = container.querySelector('#selected-chip-bar');
  const selectedTextEl = container.querySelector('#selected-chip-text');

  if (chipsList) {
    chipsList.querySelectorAll('.ocr-chip').forEach((chip) => {
      chip.onclick = () => {
        chipsList.querySelectorAll('.ocr-chip').forEach(c => c.classList.remove('is-selected'));
        chip.classList.add('is-selected');
        selectedOcrLineText = chip.dataset.text || '';
        selectedBar.style.display = 'block';
        selectedTextEl.textContent = `"${selectedOcrLineText}"`;
      };
    });
  }

  // Field assign & clear buttons
  container.querySelectorAll('.btn-assign').forEach((btn) => {
    btn.onclick = () => {
      if (!selectedOcrLineText) {
        showToast('First tap an OCR line chip above to select text', 'warning', 2500);
        return;
      }
      const targetId = btn.dataset.target;
      const inputEl = container.querySelector(`#${targetId}`);
      if (inputEl) {
        if (targetId === 'field-notes' || targetId === 'field-address') {
          inputEl.value = inputEl.value ? `${inputEl.value}, ${selectedOcrLineText}` : selectedOcrLineText;
        } else {
          inputEl.value = selectedOcrLineText;
        }
        inputEl.classList.remove('is-uncertain');
        showToast(`Assigned to ${targetId.replace('field-', '')}!`, 'success', 1500);
      }
    };
  });

  container.querySelectorAll('.btn-clear').forEach((btn) => {
    btn.onclick = () => {
      const targetId = btn.dataset.target;
      const inputEl = container.querySelector(`#${targetId}`);
      if (inputEl) {
        inputEl.value = '';
        inputEl.classList.remove('is-uncertain');
      }
    };
  });

  // Discard handler
  container.querySelector('#discard-btn').onclick = () => {
    if (confirm('Discard this card scan?')) {
      clearCurrentScan();
      showToast('Scan discarded', 'info');
      window.location.hash = '#/scan';
    }
  };

  // Save handler
  const form = container.querySelector('#review-form');
  const saveBtn = container.querySelector('#save-btn');

  form.onsubmit = async (e) => {
    e.preventDefault();
    saveBtn.setAttribute('disabled', 'true');
    saveBtn.textContent = 'Saving...';

    const nameVal = container.querySelector('#field-name').value.trim();
    const desigVal = container.querySelector('#field-designation').value.trim();
    const compVal = container.querySelector('#field-company').value.trim();
    const phone1Val = container.querySelector('#field-phone1').value.trim();
    const phone2Val = container.querySelector('#field-phone2').value.trim();
    const emailVal = container.querySelector('#field-email').value.trim();
    const webVal = container.querySelector('#field-website').value.trim();
    const addrVal = container.querySelector('#field-address').value.trim();
    const notesVal = container.querySelector('#field-notes').value.trim();
    const tagsVal = container.querySelector('#field-tags').value.trim();

    // Determine Needs Review status:
    // If any field was originally uncertain and user did not alter it
    let needsReview = false;
    if (uncertainFields.has('name') && nameVal === (originalRecord.name || '').trim()) needsReview = true;
    if (uncertainFields.has('company') && compVal === (originalRecord.company || '').trim()) needsReview = true;
    if (uncertainFields.has('designation') && desigVal === (originalRecord.designation || '').trim()) needsReview = true;
    if (uncertainFields.has('phone1') && phone1Val === (phones[0] || '').trim()) needsReview = true;

    const compiledPhones = [phone1Val, phone2Val].filter(Boolean);
    const compiledEmails = [emailVal].filter(Boolean);
    const compiledWebsites = [webVal].filter(Boolean);

    const compiledRecord = {
      id: id,
      timestamp: new Date().toISOString(),
      name: nameVal,
      designation: desigVal,
      company: compVal,
      phones: compiledPhones,
      emails: compiledEmails,
      websites: compiledWebsites,
      address: addrVal,
      notes: notesVal,
      tags: tagsVal,
      source: source,
      needsReview: needsReview,
      scannedBy: settings.scannedBy || 'Mobile User'
    };

    // Save learned company layout if company exists and ocrLines were used
    if (compVal) {
      saveCompanyLayout(compVal, {
        savedAt: new Date().toISOString()
      }).catch(console.warn);
    }

    try {
      if (navigator.onLine && settings.appsScriptUrl) {
        // Online Save: Post to Google Apps Script
        const backendResult = await saveRecord(compiledRecord, frontBase64, backBase64);
        
        // Save local copy with status synced
        await saveCardLocal({
          id,
          record: compiledRecord,
          frontBase64,
          backBase64,
          source,
          status: 'synced',
          row: backendResult.row,
          frontImageUrl: backendResult.frontImageUrl,
          backImageUrl: backendResult.backImageUrl,
          createdAt: compiledRecord.timestamp
        });

        showToast('Saved successfully to Google Sheet!', 'success', 3000);
      } else {
        // Offline Save: Store pending in IndexedDB
        await saveCardLocal({
          id,
          record: compiledRecord,
          frontBase64,
          backBase64,
          source,
          status: 'pending',
          createdAt: compiledRecord.timestamp
        });

        showToast('Saved offline. Will sync when connection is restored.', 'warning', 3500);
      }

      // Check Batch mode
      if (settings.batchMode) {
        incrementBatchCount();
        clearCurrentScan();
        showToast('Ready for next card (Batch mode)', 'info', 2000);
        window.location.hash = '#/scan';
      } else {
        clearCurrentScan();
        window.location.hash = '#/history';
      }
    } catch (err) {
      console.error('Save failed:', err);
      // Fallback: Save locally as pending so data is never lost!
      await saveCardLocal({
        id,
        record: compiledRecord,
        frontBase64,
        backBase64,
        source,
        status: 'pending',
        createdAt: compiledRecord.timestamp
      });

      showToast(`Sheet save failed (${err.message}). Saved offline safely!`, 'warning', 5000);
      clearCurrentScan();
      window.location.hash = '#/history';
    } finally {
      saveBtn.removeAttribute('disabled');
      saveBtn.textContent = 'Save to Sheet';
    }
  };
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
