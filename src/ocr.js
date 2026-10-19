/**
 * Offline OCR & QR Recognition Engine
 * Combines jsQR (vCard/MECARD instant parse) and self-hosted Tesseract.js v5 (eng+ben).
 */

import { createWorker } from 'tesseract.js';
import jsQR from 'jsqr';
import { makeGrayscaleContrast } from './image.js';
import { parseCardText, parseVCard } from './parser.js';

let tesseractWorker = null;
let isInitializingWorker = false;
let initPromise = null;

/**
 * Initializes and caches the Tesseract worker with self-hosted assets
 * @param {Function} onProgress - Progress reporting callback (0 - 100)
 */
async function getWorker(onProgress) {
  if (tesseractWorker) return tesseractWorker;

  if (isInitializingWorker && initPromise) {
    return initPromise;
  }

  isInitializingWorker = true;
  initPromise = (async () => {
    try {
      if (onProgress) onProgress(10, 'Loading OCR models...');

      const worker = await createWorker('eng+ben', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
        langPath: '/tesseract/lang-data',
        gzip: true,
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            const pct = Math.min(99, Math.round(30 + m.progress * 65));
            onProgress(pct, `Recognizing text... ${Math.round(m.progress * 100)}%`);
          } else if (onProgress && m.status) {
            onProgress(20, `${m.status}...`);
          }
        }
      });

      tesseractWorker = worker;
      isInitializingWorker = false;
      return worker;
    } catch (err) {
      isInitializingWorker = false;
      console.warn('Local tesseract assets failed, falling back to standard CDN configuration:', err);

      // Graceful fallback to default CDN if local wasm environment has strict MIME requirements
      const fallbackWorker = await createWorker('eng+ben', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            const pct = Math.min(99, Math.round(30 + m.progress * 65));
            onProgress(pct, `Recognizing text... ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      tesseractWorker = fallbackWorker;
      return fallbackWorker;
    }
  })();

  return initPromise;
}

/**
 * Attempt to scan QR code on canvas for vCard or MeCard
 * @param {HTMLCanvasElement} canvas
 * @returns {object|null}
 */
export function scanQrCode(canvas) {
  try {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imgData.data, imgData.width, imgData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code && code.data) {
      const vcard = parseVCard(code.data);
      if (vcard) {
        return {
          qrRaw: code.data,
          data: vcard,
          isQr: true
        };
      }
    }
  } catch (err) {
    console.warn('QR scan error:', err);
  }
  return null;
}

/**
 * Perform offline extraction on an image canvas
 * First checks QR for vCard, then runs enhanced Tesseract OCR
 * @param {HTMLCanvasElement} originalCanvas
 * @param {Function} onProgress - (percent: number, message: string) => void
 * @returns {Promise<{ data: object, text: string, lines: Array, source: string, isQr: boolean }>}
 */
export async function extractOffline(originalCanvas, onProgress = () => {}) {
  // Step 1: Scan for QR / vCard
  onProgress(5, 'Checking for QR code / vCard...');
  const qrResult = scanQrCode(originalCanvas);
  if (qrResult) {
    onProgress(100, 'vCard recognized successfully!');
    return {
      data: qrResult.data,
      text: qrResult.qrRaw,
      lines: [],
      source: 'vCard',
      isQr: true
    };
  }

  // Step 2: Preprocess canvas for Tesseract (grayscale + contrast stretch)
  onProgress(15, 'Enhancing image contrast...');
  const enhancedCanvas = makeGrayscaleContrast(originalCanvas);

  // Step 3: Run Tesseract OCR
  const worker = await getWorker(onProgress);

  onProgress(30, 'Recognizing card text (English + Bengali)...');
  const ret = await worker.recognize(enhancedCanvas);

  const rawText = ret.data.text || '';

  // Extract line bounding boxes for Step 8 Tap-to-assign
  const lines = (ret.data.lines || []).map((line, idx) => ({
    id: `line_${idx}`,
    text: line.text.trim(),
    confidence: line.confidence,
    bbox: line.bbox // { x0, y0, x1, y1 }
  })).filter(l => l.text.length > 0);

  // Step 4: Parse with heuristic rules
  onProgress(95, 'Structuring extracted contacts...');
  const parsedData = parseCardText(rawText);

  onProgress(100, 'Done!');
  return {
    data: parsedData,
    text: rawText,
    lines,
    source: 'Offline',
    isQr: false
  };
}

/**
 * Terminate worker if necessary to free up memory
 */
export async function terminateWorker() {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}
