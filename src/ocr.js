/**
 * Offline OCR & QR Recognition Engine
 * Combines jsQR (vCard/MECARD instant parse) and self-hosted Tesseract.js v5 (eng+ben).
 */

import { createWorker } from 'tesseract.js';
import jsQR from 'jsqr';
import { makeGrayscaleContrast } from './image.js';
import { parseCardText, parseVCard } from './parser.js';

const workers = {};
const workerInitPromises = {};

/**
 * Initializes and caches the Tesseract worker with self-hosted assets for a specific language
 * @param {string} lang - 'eng' | 'ben' | 'eng+ben'
 * @param {Function} onProgress - Progress reporting callback (0 - 100)
 */
async function getWorker(lang = 'eng', onProgress) {
  if (workers[lang]) return workers[lang];

  if (workerInitPromises[lang]) {
    return workerInitPromises[lang];
  }

  workerInitPromises[lang] = (async () => {
    try {
      if (onProgress) onProgress(10, `Loading OCR models (${lang})...`);

      const worker = await createWorker(lang, 1, {
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

      workers[lang] = worker;
      return worker;
    } catch (err) {
      console.warn(`Local tesseract assets failed for ${lang}, falling back to standard CDN configuration:`, err);

      const fallbackWorker = await createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            const pct = Math.min(99, Math.round(30 + m.progress * 65));
            onProgress(pct, `Recognizing text... ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      workers[lang] = fallbackWorker;
      return fallbackWorker;
    } finally {
      delete workerInitPromises[lang];
    }
  })();

  return workerInitPromises[lang];
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
 * Spatially reconstructs logical lines and columns from OCR word bounding boxes.
 * Solves multi-column card layout issues, filters out drawing/logo noise,
 * and fixes kerning/letter spacing issues.
 * @param {Array} words - Array of word objects from Tesseract ({ text, bbox, confidence })
 * @returns {Array} - Array of logical line objects ({ id, text, confidence, bbox, columnIndex })
 */
export function reconstructLayoutLines(words) {
  if (!Array.isArray(words) || words.length === 0) return [];

  // 1. Filter out low-confidence noise, isolated drawing artifacts and icon symbols
  const cleanWords = words.filter(w => {
    const txt = (w.text || '').trim();
    if (!txt) return false;
    if (w.confidence < 45) return false;
    if (w.confidence < 75 && txt.length <= 2 && !/[0-9]/.test(txt)) return false;
    // Discard tokens starting with bracket and mixed alphanumeric (e.g. '(DP4', '(2', 'AS')
    if (/^[(\[{\\|][a-zA-Z0-9]{1,3}$/.test(txt)) return false;
    // Skip small isolated icon symbols (envelope, location pin, bullets, copyright)
    if (/^[©®@•*~০oO()[\]>|:;,\-\\/!]$/.test(txt) && w.bbox && (w.bbox.x1 - w.bbox.x0) < 35 && (w.bbox.y1 - w.bbox.y0) < 35) {
      return false;
    }
    return true;
  });

  if (cleanWords.length === 0) return [];

  // Find horizontal span of all words
  const minX = Math.min(...cleanWords.map(w => w.bbox.x0));
  const maxX = Math.max(...cleanWords.map(w => w.bbox.x1));
  const totalWidth = Math.max(1, maxX - minX);

  // 2. Build 1D horizontal interval coverage to detect vertical gutters (multi-column layouts)
  const occupancy = new Uint8Array(Math.ceil(totalWidth) + 1);
  cleanWords.forEach(w => {
    const start = Math.max(0, Math.floor(w.bbox.x0 - minX));
    const end = Math.min(occupancy.length - 1, Math.ceil(w.bbox.x1 - minX));
    for (let x = start; x <= end; x++) occupancy[x] = 1;
  });

  const gutters = [];
  let gapStart = null;
  for (let x = 0; x < occupancy.length; x++) {
    if (occupancy[x] === 0) {
      if (gapStart === null) gapStart = x;
    } else {
      if (gapStart !== null) {
        const gapWidth = x - gapStart;
        if (gapWidth >= 35) {
          gutters.push({ center: minX + (gapStart + x) / 2 });
        }
        gapStart = null;
      }
    }
  }

  // 3. Partition words into columns based on detected gutters
  let columns = [];
  if (gutters.length > 0) {
    const splitX = gutters.map(g => g.center);
    splitX.unshift(0);
    splitX.push(Infinity);
    for (let c = 0; c < splitX.length - 1; c++) {
      const colWords = cleanWords.filter(w => {
        const midX = (w.bbox.x0 + w.bbox.x1) / 2;
        return midX >= splitX[c] && midX < splitX[c + 1];
      });
      if (colWords.length > 0) columns.push(colWords);
    }
  } else {
    columns = [cleanWords];
  }

  // 4. Assemble lines top-to-bottom within each column
  const allLines = [];
  columns.forEach((colWords, colIdx) => {
    colWords.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

    const colLines = [];
    for (const word of colWords) {
      const wordMidY = (word.bbox.y0 + word.bbox.y1) / 2;
      const wordHeight = word.bbox.y1 - word.bbox.y0;

      let targetLine = null;
      for (const line of colLines) {
        const lineMidY = (line.bbox.y0 + line.bbox.y1) / 2;
        const avgHeight = (line.height + wordHeight) / 2;
        if (Math.abs(lineMidY - wordMidY) < avgHeight * 0.6) {
          targetLine = line;
          break;
        }
      }

      if (targetLine) {
        targetLine.words.push(word);
        targetLine.bbox.x1 = Math.max(targetLine.bbox.x1, word.bbox.x1);
        targetLine.bbox.y0 = Math.min(targetLine.bbox.y0, word.bbox.y0);
        targetLine.bbox.y1 = Math.max(targetLine.bbox.y1, word.bbox.y1);
        targetLine.height = targetLine.bbox.y1 - targetLine.bbox.y0;
        targetLine.confidence = Math.min(targetLine.confidence, word.confidence);
      } else {
        colLines.push({
          words: [word],
          bbox: { ...word.bbox },
          height: wordHeight,
          confidence: word.confidence
        });
      }
    }

    colLines.forEach((line, lineIdx) => {
      line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      let text = '';
      for (let i = 0; i < line.words.length; i++) {
        const w = line.words[i];
        if (i > 0) {
          const prev = line.words[i - 1];
          const gap = w.bbox.x0 - prev.bbox.x1;
          const avgWordHeight = (line.height + (w.bbox.y1 - w.bbox.y0)) / 2;
          if (gap > avgWordHeight * 0.22) {
            text += ' ';
          }
        }
        text += w.text;
      }
      line.text = text.replace(/^[|/\\:;!~•*©®€><০,\-–_]+\s*/, '').trim();
      line.id = `line_c${colIdx}_${lineIdx}`;
      line.columnIndex = colIdx;
    });

    const validColLines = colLines.filter(l => l.text.length > 0);
    allLines.push(...validColLines);
  });

  return allLines;
}

/**
 * Perform offline extraction on an image canvas
 * First checks QR for vCard, then runs enhanced Tesseract OCR with intelligent language selection
 * @param {HTMLCanvasElement} originalCanvas
 * @param {Function} onProgress - (percent: number, message: string) => void
 * @param {string} ocrLang - 'auto' | 'eng' | 'ben' | 'eng+ben'
 * @returns {Promise<{ data: object, text: string, lines: Array, source: string, isQr: boolean }>}
 */
export async function extractOffline(originalCanvas, onProgress = () => {}, ocrLang = 'auto') {
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

  // Step 2: Preprocess canvas for Tesseract (grayscale + linear contrast stretch)
  onProgress(15, 'Enhancing image contrast...');
  const enhancedCanvas = makeGrayscaleContrast(originalCanvas);

  // Step 3: Run OCR with intelligent language selection
  const primaryLang = ocrLang === 'auto' ? 'eng' : ocrLang;
  const worker = await getWorker(primaryLang, onProgress);

  onProgress(30, `Recognizing card text (${primaryLang === 'eng' ? 'English' : primaryLang})...`);
  let ret = await worker.recognize(enhancedCanvas);

  // Auto-detect check: if in auto mode and 'eng' yielded poor confidence (< 60) or detected Bengali characters,
  // fall back to 'eng+ben' so Bengali cards are never missed!
  if (ocrLang === 'auto' && (ret.data.confidence < 60 || /[\u0980-\u09FF]/.test(ret.data.text || ''))) {
    onProgress(55, 'Analyzing multilingual text (English + Bengali)...');
    try {
      const bothWorker = await getWorker('eng+ben', onProgress);
      const bothRet = await bothWorker.recognize(enhancedCanvas);
      if (bothRet.data.confidence > ret.data.confidence || /[\u0980-\u09FF]/.test(bothRet.data.text || '')) {
        ret = bothRet;
      }
    } catch (_) {}
  }

  // Step 4: Reconstruct lines with column & spatial layout analysis
  onProgress(85, 'Analyzing card layout & columns...');
  const structuredLines = reconstructLayoutLines(ret.data.words || []);

  const lines = structuredLines.length > 0 ? structuredLines : (ret.data.lines || []).map((line, idx) => ({
    id: `line_${idx}`,
    text: line.text.trim(),
    confidence: line.confidence,
    bbox: line.bbox // { x0, y0, x1, y1 }
  })).filter(l => l.text.length > 0);

  const rawText = lines.map(l => l.text).join('\n') || ret.data.text || '';

  // Step 5: Parse with enhanced heuristic rules
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
 * Terminate all active workers to free up memory
 */
export async function terminateWorker() {
  for (const lang of Object.keys(workers)) {
    try {
      await workers[lang].terminate();
    } catch (_) {}
    delete workers[lang];
  }
}
