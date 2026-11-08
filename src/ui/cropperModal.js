/**
 * Professional Business Card Cropper Modal Component
 * Mobile-first edge alignment, corner/edge drag handles,
 * auto-detection, aspect ratio locking, rotation, and SVG icons.
 * Zero emojis — 100% vector SVG icons and production typography.
 */

import { detectCardBounds, cropCanvas, rotateCanvas, CARD_ASPECT_RATIO } from '../cropper.js';
import { toJpegBlob, toBase64 } from '../image.js';
import { showToast } from './toast.js';

/**
 * Opens the interactive card cropper modal for a given canvas
 * @param {HTMLCanvasElement} originalCanvas - The source full-res canvas
 * @param {object} options
 * @param {string} [options.side] - 'front' | 'back'
 * @param {string} [options.title] - Optional custom title
 * @param {(result: { canvas: HTMLCanvasElement, blob: Blob, base64: string, meta: object }) => void} options.onApply
 * @param {() => void} [options.onCancel]
 */
export function openCardCropper(originalCanvas, { side = 'front', title = '', onApply, onCancel } = {}) {
  // Working canvas copy (supports in-place rotation)
  let currentCanvas = document.createElement('canvas');
  currentCanvas.width = originalCanvas.width;
  currentCanvas.height = originalCanvas.height;
  const initCtx = currentCanvas.getContext('2d');
  initCtx.drawImage(originalCanvas, 0, 0);

  // Normalized relative coordinates (0.0 to 1.0)
  let box = { x: 0.05, y: 0.15, w: 0.90, h: 0.70 };
  let lockAspect = true;
  let isDragging = false;
  let dragType = null; // 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w'
  let startX = 0, startY = 0;
  let startBox = null;

  // Pre-calculate card boundaries automatically
  const initialBounds = detectCardBounds(currentCanvas);
  if (initialBounds && initialBounds.detected) {
    box = {
      x: Math.max(0.01, initialBounds.x / currentCanvas.width),
      y: Math.max(0.01, initialBounds.y / currentCanvas.height),
      w: Math.min(0.98, initialBounds.width / currentCanvas.width),
      h: Math.min(0.98, initialBounds.height / currentCanvas.height)
    };
  }

  const displayTitle = title || (side === 'back' ? 'Card Back Side' : 'Card Front Side');
  const sideLabel = side === 'back' ? 'Back' : 'Front';

  // Create modal backdrop
  const overlay = document.createElement('div');
  overlay.className = 'cropper-modal-overlay';
  overlay.innerHTML = `
    <div class="cropper-modal-container">
      <!-- Header -->
      <div class="cropper-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-blue);">
            <rect x="2" y="4" width="20" height="16" rx="2"></rect>
            <path d="M7 15h0M2 9.5h20"></path>
          </svg>
          <div>
            <div style="font-weight: 700; font-size: 0.95rem; line-height: 1.2; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
              <span>${displayTitle}</span>
              <span class="badge badge-ai" style="font-size: 0.65rem; padding: 2px 6px;">${sideLabel}</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 1px;">
              Align borders to card edges for clean OCR & AI extraction
            </div>
          </div>
        </div>
        <button type="button" class="btn-icon cropper-close-btn" title="Cancel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="18" x2="18" y2="6"></line>
          </svg>
        </button>
      </div>

      <!-- Viewport / Canvas -->
      <div class="cropper-body">
        <div class="cropper-viewport" id="cropper-viewport">
          <canvas id="cropper-canvas" class="cropper-canvas"></canvas>
          
          <div id="cropper-box" class="cropper-selection-box">
            <!-- Rule of thirds grid -->
            <div class="cropper-grid">
              <div class="cropper-grid-line v1"></div>
              <div class="cropper-grid-line v2"></div>
              <div class="cropper-grid-line h1"></div>
              <div class="cropper-grid-line h2"></div>
            </div>

            <!-- Corner brackets (Document scanner aesthetic) -->
            <div class="cropper-corner-bracket nw"></div>
            <div class="cropper-corner-bracket ne"></div>
            <div class="cropper-corner-bracket se"></div>
            <div class="cropper-corner-bracket sw"></div>

            <!-- Corner handles (Touch-optimized) -->
            <div class="cropper-handle nw" data-handle="nw"></div>
            <div class="cropper-handle ne" data-handle="ne"></div>
            <div class="cropper-handle se" data-handle="se"></div>
            <div class="cropper-handle sw" data-handle="sw"></div>

            <!-- Edge handles (For quick vertical/horizontal adjustment) -->
            <div class="cropper-edge-handle n" data-handle="n"></div>
            <div class="cropper-edge-handle s" data-handle="s"></div>
            <div class="cropper-edge-handle w" data-handle="w"></div>
            <div class="cropper-edge-handle e" data-handle="e"></div>
          </div>
        </div>
      </div>

      <!-- Toolbar (Pure SVG Icons, Zero Emojis) -->
      <div class="cropper-toolbar">
        <button type="button" id="crop-auto-btn" class="btn btn-secondary btn-sm" title="Re-detect card boundaries">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>Auto Edge</span>
        </button>

        <button type="button" id="crop-rotate-btn" class="btn btn-secondary btn-sm" title="Rotate clockwise 90 degrees">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
          <span>Rotate 90°</span>
        </button>

        <button type="button" id="crop-aspect-btn" class="btn btn-secondary btn-sm" title="Toggle aspect ratio lock">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="5" width="18" height="14" rx="2"></rect>
            <line x1="3" y1="12" x2="21" y2="12"></line>
          </svg>
          <span id="crop-aspect-label">Card (3.5:2)</span>
        </button>

        <button type="button" id="crop-reset-btn" class="btn btn-secondary btn-sm" title="Reset to full image">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5"></path>
          </svg>
          <span>Full Image</span>
        </button>
      </div>

      <!-- Action Footer -->
      <div class="cropper-footer">
        <button type="button" class="btn btn-secondary cropper-cancel-btn" style="width: auto; gap: 6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="18" x2="18" y2="6"></line>
          </svg>
          <span>Cancel</span>
        </button>

        <button type="button" id="crop-apply-btn" class="btn btn-primary" style="width: auto; min-width: 140px; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Confirm & Use</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // References
  const viewport = overlay.querySelector('#cropper-viewport');
  const displayCanvas = overlay.querySelector('#cropper-canvas');
  const cropBoxEl = overlay.querySelector('#cropper-box');
  const aspectLabel = overlay.querySelector('#crop-aspect-label');
  const applyBtn = overlay.querySelector('#crop-apply-btn');

  function renderView() {
    displayCanvas.width = currentCanvas.width;
    displayCanvas.height = currentCanvas.height;
    const ctx = displayCanvas.getContext('2d');
    ctx.drawImage(currentCanvas, 0, 0);

    updateBoxElement();
  }

  function updateBoxElement() {
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    if (!vpW || !vpH) return;

    const imgAspect = currentCanvas.width / currentCanvas.height;
    const vpAspect = vpW / vpH;

    let renderW, renderH, offsetX, offsetY;
    if (imgAspect > vpAspect) {
      renderW = vpW;
      renderH = vpW / imgAspect;
      offsetX = 0;
      offsetY = (vpH - renderH) / 2;
    } else {
      renderH = vpH;
      renderW = vpH * imgAspect;
      offsetX = (vpW - renderW) / 2;
      offsetY = 0;
    }

    const pixelX = offsetX + (box.x * renderW);
    const pixelY = offsetY + (box.y * renderH);
    const pixelW = box.w * renderW;
    const pixelH = box.h * renderH;

    cropBoxEl.style.left = `${pixelX}px`;
    cropBoxEl.style.top = `${pixelY}px`;
    cropBoxEl.style.width = `${pixelW}px`;
    cropBoxEl.style.height = `${pixelH}px`;
  }

  // Window resize observer
  const resizeObserver = new ResizeObserver(() => {
    updateBoxElement();
  });
  resizeObserver.observe(viewport);

  // Pointer dragging and resizing logic
  function onPointerDown(e) {
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const targetHandle = e.target.dataset.handle;
    if (targetHandle) {
      dragType = targetHandle;
    } else if (e.target.closest('#cropper-box')) {
      dragType = 'move';
    } else {
      return;
    }

    isDragging = true;
    startX = clientX;
    startY = clientY;
    startBox = { ...box };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    const imgAspect = currentCanvas.width / currentCanvas.height;
    const vpAspect = vpW / vpH;

    let renderW = vpW;
    let renderH = vpH;
    if (imgAspect > vpAspect) {
      renderH = vpW / imgAspect;
    } else {
      renderW = vpH * imgAspect;
    }

    const dx = (clientX - startX) / renderW;
    const dy = (clientY - startY) / renderH;

    if (dragType === 'move') {
      let newX = startBox.x + dx;
      let newY = startBox.y + dy;
      newX = Math.max(0, Math.min(1 - startBox.w, newX));
      newY = Math.max(0, Math.min(1 - startBox.h, newY));
      box.x = newX;
      box.y = newY;
    } else if (dragType === 'se') {
      let newW = Math.max(0.12, Math.min(1 - startBox.x, startBox.w + dx));
      let newH = startBox.h + dy;
      if (lockAspect) {
        newH = (newW * currentCanvas.width) / (CARD_ASPECT_RATIO * currentCanvas.height);
      }
      newH = Math.max(0.08, Math.min(1 - startBox.y, newH));
      box.w = newW;
      box.h = newH;
    } else if (dragType === 'nw') {
      let newW = Math.max(0.12, startBox.w - dx);
      let newX = startBox.x + (startBox.w - newW);
      let newH = startBox.h - dy;
      if (lockAspect) {
        newH = (newW * currentCanvas.width) / (CARD_ASPECT_RATIO * currentCanvas.height);
      }
      let newY = startBox.y + (startBox.h - newH);

      if (newX >= 0 && newY >= 0) {
        box.x = newX;
        box.y = newY;
        box.w = newW;
        box.h = newH;
      }
    } else if (dragType === 'ne') {
      let newW = Math.max(0.12, Math.min(1 - startBox.x, startBox.w + dx));
      let newH = startBox.h - dy;
      if (lockAspect) {
        newH = (newW * currentCanvas.width) / (CARD_ASPECT_RATIO * currentCanvas.height);
      }
      let newY = startBox.y + (startBox.h - newH);

      if (newY >= 0) {
        box.y = newY;
        box.w = newW;
        box.h = newH;
      }
    } else if (dragType === 'sw') {
      let newW = Math.max(0.12, startBox.w - dx);
      let newX = startBox.x + (startBox.w - newW);
      let newH = startBox.h + dy;
      if (lockAspect) {
        newH = (newW * currentCanvas.width) / (CARD_ASPECT_RATIO * currentCanvas.height);
      }
      if (newX >= 0 && (startBox.y + newH) <= 1) {
        box.x = newX;
        box.w = newW;
        box.h = newH;
      }
    } else if (dragType === 's') {
      let newH = Math.max(0.08, Math.min(1 - startBox.y, startBox.h + dy));
      box.h = newH;
    } else if (dragType === 'n') {
      let newH = Math.max(0.08, startBox.h - dy);
      let newY = startBox.y + (startBox.h - newH);
      if (newY >= 0) {
        box.y = newY;
        box.h = newH;
      }
    } else if (dragType === 'e') {
      let newW = Math.max(0.12, Math.min(1 - startBox.x, startBox.w + dx));
      box.w = newW;
    } else if (dragType === 'w') {
      let newW = Math.max(0.12, startBox.w - dx);
      let newX = startBox.x + (startBox.w - newW);
      if (newX >= 0) {
        box.x = newX;
        box.w = newW;
      }
    }

    updateBoxElement();
  }

  function onPointerUp() {
    isDragging = false;
    dragType = null;
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
  }

  cropBoxEl.addEventListener('mousedown', onPointerDown);
  cropBoxEl.addEventListener('touchstart', onPointerDown, { passive: false });

  // Toolbar Actions
  overlay.querySelector('#crop-auto-btn').onclick = () => {
    const detected = detectCardBounds(currentCanvas);
    if (detected && detected.detected) {
      box = {
        x: Math.max(0, detected.x / currentCanvas.width),
        y: Math.max(0, detected.y / currentCanvas.height),
        w: Math.min(1, detected.width / currentCanvas.width),
        h: Math.min(1, detected.height / currentCanvas.height)
      };
      updateBoxElement();
      showToast('Card edges detected automatically', 'success', 2000);
    } else {
      showToast('Could not cleanly detect card edges. Adjust manually.', 'info', 2500);
    }
  };

  overlay.querySelector('#crop-rotate-btn').onclick = () => {
    currentCanvas = rotateCanvas(currentCanvas, 90);
    box = { x: 0.05, y: 0.15, w: 0.90, h: 0.70 };
    renderView();
    showToast('Image rotated 90°', 'info', 1500);
  };

  overlay.querySelector('#crop-aspect-btn').onclick = () => {
    lockAspect = !lockAspect;
    aspectLabel.textContent = lockAspect ? 'Card (3.5:2)' : 'Freeform';
    showToast(`Aspect ratio: ${lockAspect ? 'Locked to Card' : 'Freeform'}`, 'info', 1500);
  };

  overlay.querySelector('#crop-reset-btn').onclick = () => {
    box = { x: 0.02, y: 0.02, w: 0.96, h: 0.96 };
    updateBoxElement();
  };

  function closeModal() {
    resizeObserver.disconnect();
    overlay.remove();
  }

  overlay.querySelector('.cropper-close-btn').onclick = () => {
    closeModal();
    if (onCancel) onCancel();
  };

  overlay.querySelector('.cropper-cancel-btn').onclick = () => {
    closeModal();
    if (onCancel) onCancel();
  };

  applyBtn.onclick = async () => {
    try {
      applyBtn.setAttribute('disabled', 'true');
      applyBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        <span>Processing...</span>
      `;

      const cropPixelBox = {
        x: Math.round(box.x * currentCanvas.width),
        y: Math.round(box.y * currentCanvas.height),
        width: Math.round(box.w * currentCanvas.width),
        height: Math.round(box.h * currentCanvas.height)
      };

      const croppedCanvas = cropCanvas(currentCanvas, cropPixelBox);
      const blob = await toJpegBlob(croppedCanvas, 0.88);
      const base64 = await toBase64(blob);

      const meta = {
        width: croppedCanvas.width,
        height: croppedCanvas.height,
        sizeKb: Math.round(blob.size / 1024),
        canvas: croppedCanvas
      };

      closeModal();

      if (onApply) {
        onApply({ canvas: croppedCanvas, blob, base64, meta });
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to apply crop: ' + err.message, 'error');
      applyBtn.removeAttribute('disabled');
      applyBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Confirm & Use</span>
      `;
    }
  };

  // Initial draw
  requestAnimationFrame(() => {
    renderView();
  });
}
