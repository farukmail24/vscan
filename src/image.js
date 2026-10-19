/**
 * Image processing pipeline
 * Handles EXIF orientation, proportional resizing to 1600px max,
 * JPEG compression, Base64 conversion, and grayscale/contrast enhancement for OCR.
 */

/**
 * Loads an image from a File or Blob with automatic orientation handling
 * @param {File|Blob} file
 * @returns {Promise<HTMLImageElement|ImageBitmap>}
 */
export async function loadImage(file) {
  // Modern browsers handle EXIF orientation natively in createImageBitmap
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return bitmap;
    } catch (_) {
      // Fallback to standard Image loading if createImageBitmap option fails
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image: ' + (err.message || 'corrupt file')));
    };
    img.src = url;
  });
}

/**
 * Resizes an image or bitmap so its largest dimension is at most maxDimension (default 1600px)
 * @param {HTMLImageElement|ImageBitmap|HTMLCanvasElement} img
 * @param {number} maxDimension
 * @returns {HTMLCanvasElement}
 */
export function resizeToMax(img, maxDimension = 1600) {
  const originalWidth = img.width;
  const originalHeight = img.height;

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (originalWidth > maxDimension || originalHeight > maxDimension) {
    if (originalWidth > originalHeight) {
      targetWidth = maxDimension;
      targetHeight = Math.round((originalHeight * maxDimension) / originalWidth);
    } else {
      targetHeight = maxDimension;
      targetWidth = Math.round((originalWidth * maxDimension) / originalHeight);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return canvas;
}

/**
 * Converts a canvas element to a JPEG Blob
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality (0.0 to 1.0, default 0.85)
 * @returns {Promise<Blob>}
 */
export function toJpegBlob(canvas, quality = 0.85) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas toBlob conversion failed'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Converts a Blob to a Base64 data URL string
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Enhances an image for offline OCR:
 * 1. Converts to grayscale using standard luminance weights
 * 2. Auto-detects dark-background cards and inverts them (Tesseract requires dark text on light background)
 * 3. Robust percentile-based contrast stretching (clips 1% noise)
 * 4. Crisp edge sharpening for micro business card typography
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLCanvasElement}
 */
export function makeGrayscaleContrast(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return canvas;

  const enhancedCanvas = document.createElement('canvas');
  enhancedCanvas.width = width;
  enhancedCanvas.height = height;

  const ctx = enhancedCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const totalPixels = width * height;

  // 1. Grayscale conversion & histogram calculation
  const grays = new Uint8Array(totalPixels);
  const histogram = new Uint32Array(256);
  let sumGray = 0;

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grays[j] = gray;
    histogram[gray]++;
    sumGray += gray;
  }

  // 2. Detect dark-background cards (e.g. black / dark navy business cards with light text)
  const avgLuminance = sumGray / totalPixels;
  const isDarkCard = avgLuminance < 115;

  if (isDarkCard) {
    for (let j = 0; j < totalPixels; j++) {
      grays[j] = 255 - grays[j];
    }
    // Recompute histogram for inverted image
    histogram.fill(0);
    for (let j = 0; j < totalPixels; j++) {
      histogram[grays[j]]++;
    }
  }

  // 3. Percentile-based contrast stretch (p1 to p99) to reject glare / outlier pixels
  const lowThreshold = Math.floor(totalPixels * 0.015);
  const highThreshold = Math.floor(totalPixels * 0.985);

  let pLow = 0;
  let pHigh = 255;
  let cumulative = 0;

  for (let g = 0; g < 256; g++) {
    cumulative += histogram[g];
    if (cumulative >= lowThreshold && pLow === 0) {
      pLow = g;
    }
    if (cumulative >= highThreshold) {
      pHigh = g;
      break;
    }
  }

  const range = pHigh - pLow || 1;
  const stretched = new Uint8Array(totalPixels);

  for (let j = 0; j < totalPixels; j++) {
    const g = grays[j];
    let norm = 0;
    if (g <= pLow) norm = 0;
    else if (g >= pHigh) norm = 255;
    else norm = Math.round(((g - pLow) / range) * 255);

    // Sigmoid contrast curve boost
    stretched[j] = norm < 128
      ? Math.round((norm * norm) / 128)
      : Math.round(255 - ((255 - norm) * (255 - norm)) / 128);
  }

  // 4. Subtle 3x3 unsharp mask sharpening to clarify small fonts/digits
  for (let y = 0; y < height; y++) {
    const yOffset = y * width;
    const yTop = Math.max(0, y - 1) * width;
    const yBottom = Math.min(height - 1, y + 1) * width;

    for (let x = 0; x < width; x++) {
      const idx = yOffset + x;
      const xLeft = Math.max(0, x - 1);
      const xRight = Math.min(width - 1, x + 1);

      const center = stretched[idx];
      const top = stretched[yTop + x];
      const bottom = stretched[yBottom + x];
      const left = stretched[yOffset + xLeft];
      const right = stretched[yOffset + xRight];

      // Sharpen kernel: center * 2 - (top + bottom + left + right) * 0.25
      const sharpVal = Math.round(center * 1.7 - (top + bottom + left + right) * 0.175);
      const clamped = Math.max(0, Math.min(255, sharpVal));

      const pixelIdx = idx * 4;
      data[pixelIdx] = clamped;
      data[pixelIdx + 1] = clamped;
      data[pixelIdx + 2] = clamped;
      // alpha data[pixelIdx + 3] preserved
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return enhancedCanvas;
}

