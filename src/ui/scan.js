/**
 * Scan Screen Component
 * Mobile-first business card capture, camera/gallery selection,
 * image preprocessing, and extraction pipeline.
 */

import { loadImage, resizeToMax, toJpegBlob, toBase64 } from '../image.js';
import { extractWithAI } from '../api.js';
import { extractOffline } from '../ocr.js';
import { getSettings, updateSetting } from '../settings.js';
import { setCurrentScan, getState } from '../store.js';
import { showToast } from './toast.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function renderScan(container) {
  const settings = getSettings();
  const state = getState();

  let frontBlob = null;
  let frontBase64 = null;
  let frontMeta = null;

  let backBlob = null;
  let backBase64 = null;
  let backMeta = null;

  let isExtracting = false;

  container.innerHTML = `
    <div class="scan-view-content">
      <!-- Mode & Batch Bar -->
      <div class="card-panel" style="padding: 12px 16px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <label class="form-label" style="margin: 0; font-size: 0.75rem;">Mode:</label>
              <select id="scan-mode-select" class="form-select" style="padding: 4px 8px; width: auto; font-size: 0.82rem;">
                <option value="auto" ${settings.mode === 'auto' ? 'selected' : ''}>Auto (AI / Offline)</option>
                <option value="ai" ${settings.mode === 'ai' ? 'selected' : ''}>Gemini AI Only</option>
                <option value="offline" ${settings.mode === 'offline' ? 'selected' : ''}>Offline OCR Only</option>
              </select>
            </div>

            <div style="display: flex; align-items: center; gap: 6px;" title="Language engine for Offline OCR">
              <label class="form-label" style="margin: 0; font-size: 0.75rem;">OCR:</label>
              <select id="scan-ocr-lang-select" class="form-select" style="padding: 4px 8px; width: auto; font-size: 0.82rem;">
                <option value="auto" ${(settings.ocrLang || 'auto') === 'auto' ? 'selected' : ''}>⚡ Auto (Fast)</option>
                <option value="eng" ${settings.ocrLang === 'eng' ? 'selected' : ''}>English</option>
                <option value="ben" ${settings.ocrLang === 'ben' ? 'selected' : ''}>বাংলা</option>
                <option value="eng+ben" ${settings.ocrLang === 'eng+ben' ? 'selected' : ''}>Eng + বাংলা</option>
              </select>
            </div>
          </div>

          <div class="switch-container" title="Continuous batch scan mode">
            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-right: 8px;">Batch Mode</span>
            <label class="switch">
              <input type="checkbox" id="batch-mode-toggle" ${settings.batchMode ? 'checked' : ''} />
              <span class="slider"></span>
            </label>
          </div>
        </div>

        ${state.batchCount > 0 ? `
          <div style="margin-top: 8px; font-size: 0.78rem; color: var(--accent-blue); font-weight: 600; display: flex; align-items: center; gap: 4px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Batch active: ${state.batchCount} card${state.batchCount > 1 ? 's' : ''} saved in this session
          </div>
        ` : ''}
      </div>

      <!-- Front Capture Card -->
      <div class="card-panel">
        <div class="card-title">
          <span>Card Front <span style="color: var(--accent-rose); font-size: 0.8rem;">*Required</span></span>
          <span id="front-meta-pill" style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);"></span>
        </div>

        <!-- Hidden Inputs for Front -->
        <input type="file" id="front-camera-input" accept="image/*" capture="environment" style="display: none;" />
        <input type="file" id="front-gallery-input" accept="image/*" style="display: none;" />

        <div id="front-capture-box" class="capture-box">
          <div id="front-placeholder">
            <div style="display: flex; justify-content: center; margin-bottom: 8px; color: var(--accent-blue);">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </div>
            <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 4px;">Take Photo of Front Side</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 14px;">Align card within the frame</div>
            
            <div style="display: flex; gap: 8px; justify-content: center;">
              <button type="button" id="front-snap-btn" class="btn btn-primary btn-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                Camera
              </button>
              <button type="button" id="front-gallery-btn" class="btn btn-secondary btn-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Gallery
              </button>
            </div>
          </div>

          <div id="front-preview-container" style="display: none; position: relative;">
            <img id="front-preview-img" class="capture-preview-img" alt="Card front preview" />
            <div class="capture-overlay">
              <span id="front-info-text" class="capture-meta-text"></span>
              <div class="capture-actions">
                <button type="button" id="front-retake-btn" class="btn btn-secondary btn-sm">Retake</button>
                <button type="button" id="front-clear-btn" class="btn btn-danger btn-sm">Clear</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Back Capture Card (Optional) -->
      <div class="card-panel">
        <div class="card-title">
          <span>Card Back <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">(Optional)</span></span>
          <span id="back-meta-pill" style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);"></span>
        </div>

        <!-- Hidden Inputs for Back -->
        <input type="file" id="back-camera-input" accept="image/*" capture="environment" style="display: none;" />
        <input type="file" id="back-gallery-input" accept="image/*" style="display: none;" />

        <div id="back-capture-box" class="capture-box">
          <div id="back-placeholder">
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">Flip card to capture additional details or QR code</div>
            <div style="display: flex; gap: 8px; justify-content: center;">
              <button type="button" id="back-snap-btn" class="btn btn-secondary btn-sm">Camera</button>
              <button type="button" id="back-gallery-btn" class="btn btn-secondary btn-sm">Gallery</button>
            </div>
          </div>

          <div id="back-preview-container" style="display: none; position: relative;">
            <img id="back-preview-img" class="capture-preview-img" alt="Card back preview" />
            <div class="capture-overlay">
              <span id="back-info-text" class="capture-meta-text"></span>
              <div class="capture-actions">
                <button type="button" id="back-retake-btn" class="btn btn-secondary btn-sm">Retake</button>
                <button type="button" id="back-clear-btn" class="btn btn-danger btn-sm">Clear</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Progress / Status Overlay -->
      <div id="scan-progress-box" class="card-panel" style="display: none; border-color: var(--accent-blue);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: 600; font-size: 0.9rem;" id="progress-status-text">Processing card...</div>
          <span id="progress-percent" style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--accent-blue); font-weight: 700;">0%</span>
        </div>
        <div class="progress-bar-container">
          <div id="progress-bar-fill" class="progress-bar-fill"></div>
        </div>
        <div id="progress-sub-text" style="font-size: 0.75rem; color: var(--text-muted);">Please keep the app open</div>
      </div>

      <!-- Action Extract Button -->
      <div style="margin-top: 20px;">
        <button type="button" id="extract-btn" class="btn btn-primary" disabled>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
          <span id="extract-btn-label">Extract Details</span>
        </button>
      </div>
    </div>
  `;

  // Element handles
  const modeSelect = container.querySelector('#scan-mode-select');
  const batchToggle = container.querySelector('#batch-mode-toggle');
  const extractBtn = container.querySelector('#extract-btn');
  const progressBox = container.querySelector('#scan-progress-box');
  const progressStatusText = container.querySelector('#progress-status-text');
  const progressPercent = container.querySelector('#progress-percent');
  const progressBarFill = container.querySelector('#progress-bar-fill');
  const progressSubText = container.querySelector('#progress-sub-text');

  // Front elements
  const frontCamInput = container.querySelector('#front-camera-input');
  const frontGalInput = container.querySelector('#front-gallery-input');
  const frontBox = container.querySelector('#front-capture-box');
  const frontPlaceholder = container.querySelector('#front-placeholder');
  const frontPreviewContainer = container.querySelector('#front-preview-container');
  const frontPreviewImg = container.querySelector('#front-preview-img');
  const frontInfoText = container.querySelector('#front-info-text');

  // Back elements
  const backCamInput = container.querySelector('#back-camera-input');
  const backGalInput = container.querySelector('#back-gallery-input');
  const backBox = container.querySelector('#back-capture-box');
  const backPlaceholder = container.querySelector('#back-placeholder');
  const backPreviewContainer = container.querySelector('#back-preview-container');
  const backPreviewImg = container.querySelector('#back-preview-img');
  const backInfoText = container.querySelector('#back-info-text');

  // Mode & Batch event listeners
  const ocrLangSelect = container.querySelector('#scan-ocr-lang-select');
  modeSelect.addEventListener('change', () => {
    updateSetting('mode', modeSelect.value);
    showToast(`Mode set to ${modeSelect.value.toUpperCase()}`, 'info', 2000);
  });

  if (ocrLangSelect) {
    ocrLangSelect.addEventListener('change', () => {
      updateSetting('ocrLang', ocrLangSelect.value);
      showToast(`OCR Engine: ${ocrLangSelect.options[ocrLangSelect.selectedIndex].text}`, 'info', 2000);
    });
  }

  batchToggle.addEventListener('change', () => {
    updateSetting('batchMode', batchToggle.checked);
    showToast(`Batch mode ${batchToggle.checked ? 'enabled' : 'disabled'}`, 'info', 2000);
  });

  // Front file triggers
  container.querySelector('#front-snap-btn').onclick = () => frontCamInput.click();
  container.querySelector('#front-gallery-btn').onclick = () => frontGalInput.click();
  container.querySelector('#front-retake-btn').onclick = () => frontCamInput.click();
  container.querySelector('#front-clear-btn').onclick = () => clearFront();

  // Back file triggers
  container.querySelector('#back-snap-btn').onclick = () => backCamInput.click();
  container.querySelector('#back-gallery-btn').onclick = () => backGalInput.click();
  container.querySelector('#back-retake-btn').onclick = () => backCamInput.click();
  container.querySelector('#back-clear-btn').onclick = () => clearBack();

  frontCamInput.onchange = (e) => handleImageUpload(e.target.files[0], 'front');
  frontGalInput.onchange = (e) => handleImageUpload(e.target.files[0], 'front');
  backCamInput.onchange = (e) => handleImageUpload(e.target.files[0], 'back');
  backGalInput.onchange = (e) => handleImageUpload(e.target.files[0], 'back');

  async function handleImageUpload(file, side) {
    if (!file) return;

    try {
      showToast(`Optimizing ${side} image...`, 'info', 1500);

      const img = await loadImage(file);
      const canvas = resizeToMax(img, 1600);
      const blob = await toJpegBlob(canvas, 0.85);
      const base64 = await toBase64(blob);

      const meta = {
        width: canvas.width,
        height: canvas.height,
        sizeKb: Math.round(blob.size / 1024),
        canvas
      };

      if (side === 'front') {
        frontBlob = blob;
        frontBase64 = base64;
        frontMeta = meta;

        frontPreviewImg.src = base64;
        frontPlaceholder.style.display = 'none';
        frontPreviewContainer.style.display = 'block';
        frontBox.classList.add('has-preview');
        frontInfoText.textContent = `${meta.width}x${meta.height} · ${meta.sizeKb} KB`;

        extractBtn.removeAttribute('disabled');
      } else {
        backBlob = blob;
        backBase64 = base64;
        backMeta = meta;

        backPreviewImg.src = base64;
        backPlaceholder.style.display = 'none';
        backPreviewContainer.style.display = 'block';
        backBox.classList.add('has-preview');
        backInfoText.textContent = `${meta.width}x${meta.height} · ${meta.sizeKb} KB`;
      }
    } catch (err) {
      console.error(err);
      showToast(`Failed to process ${side} image: ${err.message}`, 'error');
    }
  }

  function clearFront() {
    frontBlob = null;
    frontBase64 = null;
    frontMeta = null;
    frontPreviewImg.src = '';
    frontPreviewContainer.style.display = 'none';
    frontPlaceholder.style.display = 'block';
    frontBox.classList.remove('has-preview');
    extractBtn.setAttribute('disabled', 'true');
  }

  function clearBack() {
    backBlob = null;
    backBase64 = null;
    backMeta = null;
    backPreviewImg.src = '';
    backPreviewContainer.style.display = 'none';
    backPlaceholder.style.display = 'block';
    backBox.classList.remove('has-preview');
  }

  function updateProgress(percent, status, sub = '') {
    progressBox.style.display = 'block';
    progressPercent.textContent = `${percent}%`;
    progressBarFill.style.width = `${percent}%`;
    progressStatusText.textContent = status;
    if (sub) progressSubText.textContent = sub;
  }

  // Extract workflow
  extractBtn.onclick = async () => {
    if (!frontBase64 || isExtracting) return;

    isExtracting = true;
    extractBtn.setAttribute('disabled', 'true');
    progressBox.style.display = 'block';

    const currentMode = modeSelect.value;
    const isOnline = navigator.onLine;

    let extractedData = null;
    let source = 'AI';
    let ocrLines = [];
    let ocrText = '';

    try {
      const shouldUseAI = currentMode === 'ai' || (currentMode === 'auto' && isOnline);

      if (shouldUseAI) {
        updateProgress(20, 'Reading card with Gemini AI...', 'Connecting to Apps Script backend');
        try {
          const aiResponse = await extractWithAI(frontBase64, backBase64);
          updateProgress(90, 'Gemini analysis complete', 'Normalizing contact records');
          extractedData = aiResponse.data;
          source = 'AI';
        } catch (aiErr) {
          console.warn('AI Extraction error:', aiErr);
          if (currentMode === 'auto') {
            showToast(`AI extraction failed (${aiErr.message}). Falling back to Offline OCR...`, 'warning', 4000);
            updateProgress(30, 'Falling back to offline OCR...', 'Initializing local models');
            const chosenLang = ocrLangSelect ? ocrLangSelect.value : (settings.ocrLang || 'auto');
            const offlineRes = await extractOffline(frontMeta.canvas, (pct, msg) => {
              updateProgress(pct, msg, 'Self-hosted Tesseract & jsQR');
            }, chosenLang);
            extractedData = offlineRes.data;
            source = offlineRes.source;
            ocrLines = offlineRes.lines;
            ocrText = offlineRes.text;
          } else {
            throw aiErr;
          }
        }
      } else {
        // Offline OCR mode
        const chosenLang = ocrLangSelect ? ocrLangSelect.value : (settings.ocrLang || 'auto');
        updateProgress(10, `Running offline OCR engine (${chosenLang})...`, 'Self-hosted Tesseract.js & jsQR');
        const offlineRes = await extractOffline(frontMeta.canvas, (pct, msg) => {
          updateProgress(pct, msg, 'Self-hosted Tesseract & jsQR');
        }, chosenLang);
        extractedData = offlineRes.data;
        source = offlineRes.source;
        ocrLines = offlineRes.lines;
        ocrText = offlineRes.text;
      }

      // Step: Normalize extracted contacts per specification
      // 1. Phones: Normalize with libphonenumber-js (default country BD)
      const normalizedPhones = [];
      const uncertainList = new Set(extractedData.uncertain_fields || []);

      (extractedData.phones || []).forEach((rawPhone) => {
        try {
          const parsed = parsePhoneNumberFromString(rawPhone, 'BD');
          if (parsed && parsed.isValid()) {
            normalizedPhones.push(parsed.format('E.164'));
          } else {
            normalizedPhones.push(rawPhone);
            uncertainList.add('phone1');
          }
        } catch (_) {
          normalizedPhones.push(rawPhone);
          uncertainList.add('phone1');
        }
      });

      // 2. Emails: Lowercase & trim
      const normalizedEmails = (extractedData.emails || []).map(e => (e || '').trim().toLowerCase()).filter(Boolean);

      // 3. Websites: Lowercase & ensure https://
      const normalizedWebsites = (extractedData.websites || []).map(w => {
        let clean = (w || '').trim().toLowerCase();
        if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
          clean = 'https://' + clean;
        }
        return clean;
      }).filter(Boolean);

      extractedData.phones = normalizedPhones;
      extractedData.emails = normalizedEmails;
      extractedData.websites = normalizedWebsites;
      extractedData.uncertain_fields = Array.from(uncertainList);

      // Save into store and navigate to Review
      const scanId = 'card_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      setCurrentScan({
        id: scanId,
        record: extractedData,
        frontBase64,
        backBase64,
        frontBlob,
        backBlob,
        ocrLines,
        ocrText,
        source
      });

      updateProgress(100, 'Opening Review screen...');
      showToast('Card extracted! Please review and verify details.', 'success', 2500);

      window.location.hash = '#/review';
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Extraction failed', 'error', 5000);
      progressBox.style.display = 'none';
    } finally {
      isExtracting = false;
      extractBtn.removeAttribute('disabled');
    }
  };
}
