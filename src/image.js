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
 * Enhances an image for offline OCR by converting to grayscale and applying contrast stretching
 * Significantly improves Tesseract accuracy on patterned or colored business card backgrounds.
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLCanvasElement}
 */
export function makeGrayscaleContrast(canvas) {
  const enhancedCanvas = document.createElement('canvas');
  enhancedCanvas.width = canvas.width;
  enhancedCanvas.height = canvas.height;

  const ctx = enhancedCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, enhancedCanvas.width, enhancedCanvas.height);
  const data = imgData.data;
  const len = data.length;

  // 1. Grayscale conversion using standard luminance weights
  const grays = new Uint8Array(len / 4);
  let minGray = 255;
  let maxGray = 0;

  for (let i = 0, j = 0; i < len; i += 4, j++) {
    // Luminance formula
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grays[j] = gray;
    if (gray < minGray) minGray = gray;
    if (gray > maxGray) maxGray = gray;
  }

  // 2. Contrast stretching (normalize from [minGray, maxGray] to [0, 255])
  const range = maxGray - minGray || 1;

  for (let i = 0, j = 0; i < len; i += 4, j++) {
    const normalized = Math.round(((grays[j] - minGray) / range) * 255);
    // Slight S-curve contrast boost
    const boosted = normalized < 128
      ? Math.round((normalized * normalized) / 128)
      : Math.round(255 - ((255 - normalized) * (255 - normalized)) / 128);

    data[i] = boosted;     // R
    data[i + 1] = boosted; // G
    data[i + 2] = boosted; // B
    // data[i + 3] remains alpha
  }

  ctx.putImageData(imgData, 0, 0);
  return enhancedCanvas;
}
