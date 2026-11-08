/**
 * Smart Business Card Detection, Auto-Cropping & Interactive Cropper
 * Analyzes contrast, edge gradients, and background differences to isolate business cards.
 */

export const CARD_ASPECT_RATIO = 1.75; // Standard business card ratio (3.5" x 2")

/**
 * Pure mathematical card detection on raw image RGBA buffer.
 * Decoupled from DOM so it can run in Web Worker, Node test, or Browser.
 * 
 * @param {{ width: number, height: number, data: Uint8ClampedArray | Uint8Array }} imageData
 * @returns {{ x: number, y: number, width: number, height: number, detected: boolean, confidence: number } | null}
 */
export function detectCardPixelBounds({ width: sw, height: sh, data }) {
  if (!sw || !sh || !data || data.length < sw * sh * 4) return null;

  // 1. Sample perimeter border pixels (outer 5%) to calculate background surface color profile
  const borderPixels = [];
  const insetX = Math.max(2, Math.floor(sw * 0.05));
  const insetY = Math.max(2, Math.floor(sh * 0.05));

  for (let x = 0; x < sw; x += 2) {
    // Top border
    for (let y = 0; y < insetY; y++) {
      const idx = (y * sw + x) * 4;
      borderPixels.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
    // Bottom border
    for (let y = sh - insetY; y < sh; y++) {
      const idx = (y * sw + x) * 4;
      borderPixels.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  }

  for (let y = 0; y < sh; y += 2) {
    // Left border
    for (let x = 0; x < insetX; x++) {
      const idx = (y * sw + x) * 4;
      borderPixels.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
    // Right border
    for (let x = sw - insetX; x < sw; x++) {
      const idx = (y * sw + x) * 4;
      borderPixels.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  }

  if (borderPixels.length === 0) return null;

  // Compute average background color
  let bgR = 0, bgG = 0, bgB = 0;
  for (let i = 0; i < borderPixels.length; i++) {
    bgR += borderPixels[i][0];
    bgG += borderPixels[i][1];
    bgB += borderPixels[i][2];
  }
  bgR = Math.round(bgR / borderPixels.length);
  bgG = Math.round(bgG / borderPixels.length);
  bgB = Math.round(bgB / borderPixels.length);

  // Background luminance
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

  // 2. Binary mask based on Euclidean color difference and luminance difference from background
  const rowCounts = new Uint32Array(sh);
  const colCounts = new Uint32Array(sw);
  let totalCardPixels = 0;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = (y * sw + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const lumDiff = Math.abs(lum - bgLum);
      const colorDist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

      // Card pixel threshold (card stands out from background surface)
      if (colorDist > 25 || lumDiff > 22) {
        rowCounts[y]++;
        colCounts[x]++;
        totalCardPixels++;
      }
    }
  }

  const minCardArea = (sw * sh) * 0.10; // Card should occupy at least 10% of photo
  const maxCardArea = (sw * sh) * 0.96; // If it's >96%, image is already tightly cropped

  if (totalCardPixels < minCardArea || totalCardPixels > maxCardArea) {
    return null; // Not enough contrast or already cropped
  }

  // 3. Scan profiles to locate card boundaries [minY, maxY] and [minX, maxX]
  // Row threshold: row must have at least 12% card pixels
  const rowThreshold = Math.max(8, Math.floor(sw * 0.12));
  let minY = -1;
  let maxY = -1;

  for (let y = 0; y < sh; y++) {
    if (rowCounts[y] >= rowThreshold) {
      if (minY === -1) minY = y;
      maxY = y;
    }
  }

  // Column threshold: col must have at least 12% card pixels
  const colThreshold = Math.max(8, Math.floor(sh * 0.12));
  let minX = -1;
  let maxX = -1;

  for (let x = 0; x < sw; x++) {
    if (colCounts[x] >= colThreshold) {
      if (minX === -1) minX = x;
      maxX = x;
    }
  }

  if (minX === -1 || maxX === -1 || minY === -1 || maxY === -1) {
    return null;
  }

  const detectedW = maxX - minX;
  const detectedH = maxY - minY;

  // Sanity check dimensions
  if (detectedW < sw * 0.20 || detectedH < sh * 0.12) {
    return null;
  }

  // 4. Add a comfortable 3% safety margin around card so borders aren't clipped
  const padX = Math.round(detectedW * 0.035);
  const padY = Math.round(detectedH * 0.035);

  const realX = Math.max(0, minX - padX);
  const realY = Math.max(0, minY - padY);
  const realW = Math.min(sw - realX, detectedW + (padX * 2));
  const realH = Math.min(sh - realY, detectedH + (padY * 2));

  // Check aspect ratio
  const ratio = realW / realH;
  const isReasonableAspect = (ratio >= 1.15 && ratio <= 2.4) || (ratio >= 0.42 && ratio <= 0.88);

  return {
    x: realX,
    y: realY,
    width: realW,
    height: realH,
    detected: true,
    confidence: isReasonableAspect ? 0.92 : 0.65
  };
}

/**
 * Detects the bounding rectangle of a business card placed on a background surface.
 * @param {HTMLCanvasElement} canvas - Source image canvas
 * @returns {{ x: number, y: number, width: number, height: number, detected: boolean, confidence: number } | null}
 */
export function detectCardBounds(canvas) {
  const origW = canvas.width;
  const origH = canvas.height;
  if (!origW || !origH) return null;

  // Downsample to fast analysis resolution (~360px max dimension)
  const maxDim = 360;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const sw = Math.round(origW * scale);
  const sh = Math.round(origH * scale);

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sw;
  sampleCanvas.height = sh;
  const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, sw, sh);

  const imgData = ctx.getImageData(0, 0, sw, sh);
  const sampleBounds = detectCardPixelBounds(imgData);

  if (!sampleBounds) return null;

  // Scale coordinates back to original high-res canvas
  const scaleBack = 1 / scale;
  return {
    x: Math.round(sampleBounds.x * scaleBack),
    y: Math.round(sampleBounds.y * scaleBack),
    width: Math.min(origW, Math.round(sampleBounds.width * scaleBack)),
    height: Math.min(origH, Math.round(sampleBounds.height * scaleBack)),
    detected: true,
    confidence: sampleBounds.confidence
  };
}

/**
 * Crops a canvas to a specific bounding box
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {{ x: number, y: number, width: number, height: number }} box
 * @returns {HTMLCanvasElement}
 */
export function cropCanvas(sourceCanvas, box) {
  const { x, y, width, height } = box;
  const targetW = Math.max(10, Math.min(sourceCanvas.width - x, Math.round(width)));
  const targetH = Math.max(10, Math.min(sourceCanvas.height - y, Math.round(height)));

  const cropped = document.createElement('canvas');
  cropped.width = targetW;
  cropped.height = targetH;

  const ctx = cropped.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, x, y, targetW, targetH, 0, 0, targetW, targetH);

  return cropped;
}

/**
 * Rotates a canvas by 90, 180, or 270 degrees
 * @param {HTMLCanvasElement} canvas
 * @param {number} degrees (90 | 180 | 270)
 * @returns {HTMLCanvasElement}
 */
export function rotateCanvas(canvas, degrees = 90) {
  const angle = ((degrees % 360) + 360) % 360;
  if (angle === 0) return canvas;

  const rotated = document.createElement('canvas');
  const isPerpendicular = angle === 90 || angle === 270;

  rotated.width = isPerpendicular ? canvas.height : canvas.width;
  rotated.height = isPerpendicular ? canvas.width : canvas.height;

  const ctx = rotated.getContext('2d');
  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return rotated;
}

/**
 * Orchestrates automatic card edge detection and crop.
 * If a card is cleanly detected against background, returns cropped canvas.
 * Otherwise returns original canvas safely.
 * 
 * @param {HTMLCanvasElement} canvas
 * @returns {{ canvas: HTMLCanvasElement, wasCropped: boolean, box: object|null }}
 */
export function autoDetectAndCrop(canvas) {
  try {
    const bounds = detectCardBounds(canvas);
    if (bounds && bounds.detected && bounds.confidence >= 0.6) {
      // Ensure the crop removes at least 10% of background noise
      const cropArea = bounds.width * bounds.height;
      const origArea = canvas.width * canvas.height;
      if (cropArea < origArea * 0.90) {
        const cropped = cropCanvas(canvas, bounds);
        return {
          canvas: cropped,
          wasCropped: true,
          box: bounds
        };
      }
    }
  } catch (err) {
    console.warn('Auto card detection failed, keeping original image:', err);
  }

  return {
    canvas,
    wasCropped: false,
    box: null
  };
}
