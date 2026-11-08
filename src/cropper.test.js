import { describe, it, expect } from 'vitest';
import { detectCardPixelBounds, CARD_ASPECT_RATIO } from './cropper.js';

// Helper to create synthetic RGBA pixel buffer
function createMockPixelBuffer(width, height, bg = [139, 90, 43], drawCard = true) {
  const total = width * height * 4;
  const data = new Uint8ClampedArray(total);

  // Fill background
  for (let i = 0; i < total; i += 4) {
    data[i] = bg[0];
    data[i + 1] = bg[1];
    data[i + 2] = bg[2];
    data[i + 3] = 255;
  }

  // Draw bright business card in the middle
  if (drawCard) {
    const cardW = Math.round(width * 0.7);
    const cardH = Math.round(cardW / CARD_ASPECT_RATIO);
    const startX = Math.round((width - cardW) / 2);
    const startY = Math.round((height - cardH) / 2);

    for (let y = startY; y < startY + cardH; y++) {
      for (let x = startX; x < startX + cardW; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = 245;     // White card
        data[idx + 1] = 245;
        data[idx + 2] = 245;
        data[idx + 3] = 255;
      }
    }
  }

  return { width, height, data };
}

describe('Smart Card Edge Detection & Auto-Cropping Suite', () => {
  it('detects card bounding box placed on a wooden/colored surface', () => {
    const buffer = createMockPixelBuffer(300, 400, [139, 90, 43], true);
    const bounds = detectCardPixelBounds(buffer);

    expect(bounds).toBeDefined();
    expect(bounds.detected).toBe(true);
    expect(bounds.width).toBeGreaterThan(150);
    expect(bounds.height).toBeGreaterThan(80);
    expect(bounds.confidence).toBeGreaterThan(0.8);
    // Detected box should remove at least 20% of background
    expect(bounds.width * bounds.height).toBeLessThan(300 * 400 * 0.85);
  });

  it('rejects card detection when image is uniform (no background card contrast)', () => {
    const buffer = createMockPixelBuffer(300, 300, [255, 255, 255], false); // all white
    const bounds = detectCardPixelBounds(buffer);

    expect(bounds).toBeNull();
  });

  it('detects card with high confidence when card aspect ratio matches ~1.75:1', () => {
    const buffer = createMockPixelBuffer(320, 240, [40, 40, 40], true);
    const bounds = detectCardPixelBounds(buffer);

    expect(bounds).toBeDefined();
    expect(bounds.confidence).toBeGreaterThanOrEqual(0.9);
  });
});
