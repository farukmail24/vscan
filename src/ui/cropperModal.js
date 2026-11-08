/**
 * Interactive Business Card Cropper Modal Component
 * Supports mobile touch dragging, corner handles, auto-detection, aspect ratio locking, and rotation.
 */

import { detectCardBounds, cropCanvas, rotateCanvas, CARD_ASPECT_RATIO } from '../cropper.js';
import { toJpegBlob, toBase64 } from '../image.js';
import { showToast } from './toast.js';

/**
 * Opens an interactive crop modal for a given canvas
 * @param {HTMLCanvasElement} originalCanvas - The source full-res canvas
 * @param {object} options
 * @param {(result: { canvas: HTMLCanvasElement, blob: Blob, base64: string, meta: object }) => void} options.onApply
 * @param {() => void} [options.onCancel]
 */
export function openCardCropper(originalCanvas, { onApply, onCancel } = {}) {
  // Working canvas copy (may be rotated)
  let currentCanvas = document.createElement('canvas');
  currentCanvas.width = originalCanvas.width;
  currentCanvas.height = originalCanvas.height;
  const initCtx = currentCanvas.getContext('2d');
  initCtx.drawImage(originalCanvas, 0, 0);

  // Crop box in relative coordinates (0.0 to 1.0)
  let box = { x: 0.05, y: 0.15, w: 0.90, h: 0.70 };
  let lockAspect = true;
  let isDragging = false;
  let dragType = null; // 'move' | 'nw' | 'ne' | 'se' | 'sw'
  let startX = 0, startY = 0;
  let startBox = null;

  // Run initial auto-detection
  const initialBounds = detectCardBounds(currentCanvas);
  if (initialBounds && initialBounds.detected) {
    box = {
      x: Math.max(0.01, initialBounds.x / currentCanvas.width),
      y: Math.max(0.01, initialBounds.y / currentCanvas.height),
      w: Math.min(0.98, initialBounds.width / currentCanvas.width),
      h: Math.min(0.98, initialBounds.height / currentCanvas.height)
    };
  }

  // Create modal backdrop
  const overlay = document.createElement('div');
  overlay.className = 'cropper-modal-overlay';
  overlay.innerHTML = `
    <div class="cropper-modal-container">
      <div class="cropper-header">
        <div style="font-weight: 700; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"></path><path d="M18 22V8a2 2 0 0 0-2-2H2"></path></svg>
          Crop Business Card
        </div>
        <button type="button" class="btn-icon cropper-close-btn" title="Cancel">✕</button>
      </div>

      <div class="cropper-body">
        <div class="cropper-viewport" id="cropper-viewport">
          <canvas id="cropper-canvas" class="cropper-canvas"></canvas>
          
          <div id="cropper-box" class="cropper-selection-box">
            <div class="cropper-grid">
              <div class="cropper-grid-line v1"></div>
              <div class="cropper-grid-line v2"></div>
              <div class="cropper-grid-line h1"></div>
              <div class="cropper-grid-line h2"></div>
            </div>

            <div class="cropper-handle corner nw" data-handle="nw"></div>
            <div class="cropper-handle corner ne" data-handle="ne"></div>
            <div class="cropper-handle corner se" data-handle="se"></div>
            <div class="cropper-handle corner sw" data-handle="sw"></div>
          </div>
        </div>
      </div>

      <div class="cropper-toolbar">
        <button type="button" id="crop-auto-btn" class="btn btn-secondary btn-sm" title="Auto-detect card edges">
          <span>⚡</span> Auto Detect
        </button>
        <button type="button" id="crop-rotate-btn" class="btn btn-secondary btn-sm" title="Rotate 90 degrees">
          <span>🔄</span> Rotate
        </button>
        <button type="button" id="crop-aspect-btn" class="btn btn-secondary btn-sm" title="Toggle card aspect ratio lock">
          <span>📐</span> <span id="crop-aspect-label">Card Ratio (3.5:2)</span>
        </button>
        <button type="button" id="crop-reset-btn" class="btn btn-secondary btn-sm" title="Reset selection">
          <span>↺</span> Reset
        </button>
      </div>

      <div class="cropper-footer">
        <button type="button" class="btn btn-secondary cropper-cancel-btn" style="width: auto;">Cancel</button>
        <button type="button" id="crop-apply-btn" class="btn btn-primary" style="width: auto; min-width: 130px; gap: 6px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Apply Crop
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

    // Canvas fitted dimensions inside viewport (contain)
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

  // Resize observer to re-render box on window/orientation change
  const resizeObserver = new ResizeObserver(() => {
    updateBoxElement();
  });
  resizeObserver.observe(viewport);

  // Event handlers for dragging and resizing
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
      let newW = Math.max(0.15, Math.min(1 - startBox.x, startBox.w + dx));
      let newH = startBox.h + dy;
      if (lockAspect) {
        newH = (newW * currentCanvas.width) / (CARD_ASPECT_RATIO * currentCanvas.height);
      }
      newH = Math.max(0.10, Math.min(1 - startBox.y, newH));
      box.w = newW;
      box.h = newH;
    } else if (dragType === 'nw') {
      let newW = Math.max(0.15, startBox.w - dx);
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
      let newW = Math.max(0.15, Math.min(1 - startBox.x, startBox.w + dx));
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
      let newW = Math.max(0.15, startBox.w - dx);
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

  // Buttons
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
      showToast('Card detected automatically!', 'success', 2000);
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
    aspectLabel.textContent = lockAspect ? 'Card Ratio (3.5:2)' : 'Freeform';
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
      applyBtn.textContent = 'Processing...';

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
      showToast('Card cropped successfully!', 'success');

      if (onApply) {
        onApply({ canvas: croppedCanvas, blob, base64, meta });
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to apply crop: ' + err.message, 'error');
      applyBtn.removeAttribute('disabled');
      applyBtn.textContent = 'Apply Crop';
    }
  };

  // Initial draw
  requestAnimationFrame(() => {
    renderView();
  });
}
