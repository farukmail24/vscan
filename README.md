# Card Scanner (PWA) 📱📇
> Mobile-first Progressive Web App with Google Gemini AI + Offline OCR (Tesseract.js eng+ben) + Google Sheet Cloud Sync.

---

## 🌟 Key Features

1. **Dual Extraction Engines**:
   - **Gemini AI Mode (Online)**: Sends card photos via Google Apps Script to the Gemini REST API (`gemini-2.5-flash`), extracting highly accurate structured JSON.
   - **Offline OCR Mode (No AI)**: In-browser self-hosted Tesseract.js v5 with bilingual support (`eng + ben`) and rule-based heuristic parser for Bangladeshi & international cards.
   - **QR / vCard Detection**: Scans QR codes with `jsQR` to instantly parse `BEGIN:VCARD` and `MECARD` contacts with 100% confidence.
   - **Auto Mode**: Intelligently uses AI when online and seamlessly falls back to offline OCR if offline or if rate limits occur.
2. **Mandatory Review & Tap-to-Assign**:
   - Visual verification screen with zoomable card photo previews.
   - Uncertain or unverified fields highlighted in amber.
   - **Tap-to-Assign**: For offline OCR cards, tap any detected text line chip and assign it to any field with zero manual typing.
   - Learned company layout memory in IndexedDB.
3. **Google Sheet & Drive Backend**:
   - Client-generated UUID `id` ensures idempotent saving (no duplicates on retry).
   - Card images automatically uploaded to Google Drive.
   - Contact rows inserted using `LockService` to prevent race conditions.
   - Pre-save duplicate contact check (by email or phone).
4. **Offline Queue & Resilient Sync**:
   - IndexedDB local storage (`CardScannerDB`).
   - Cards captured in airplane mode are saved locally with `pending` status.
   - Automatic background upload as soon as internet connection is restored.
5. **Continuous Batch Scan Mode**:
   - Capture card after card without losing momentum.
6. **Data Exporting**:
   - **CSV Export**: Formatted with **UTF-8 BOM (`\uFEFF`)** so Bengali names and addresses open flawlessly in Microsoft Excel and Google Sheets without font garbling.
   - **vCard (.vcf) Export**: Multi-contact export for 1-tap phonebook import.

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Run unit tests
npm test

# 3. Start local development server
npm run dev
```

Open `http://localhost:3000` in your browser (or open the network URL on your phone).

---

## ☁️ Google Apps Script Backend Setup

1. **Create a Google Sheet**:
   - Go to [Google Sheets](https://sheets.new) and create a sheet named `Card Scanner`.
2. **Open Apps Script**:
   - Click **Extensions** > **Apps Script**.
   - Copy the entire code from [`apps-script/Code.gs`](./apps-script/Code.gs) into the editor.
3. **Configure Script Properties (Secrets)**:
   - Click the gear icon ⚙️ (**Project Settings**) on the left.
   - Under **Script Properties**, add:
     - `GEMINI_API_KEY`: Your key from [Google AI Studio](https://aistudio.google.com/)
     - `APP_TOKEN`: Any secret string (e.g. `card_sec_9481kdf823x`)
     - `DRIVE_FOLDER_ID`: ID of your `CardImages` folder in Google Drive
     - `GEMINI_MODEL`: `gemini-2.5-flash`
4. **Run Setup**:
   - In the Apps Script toolbar, select `setup` and click **Run**.
   - Authorize permissions when prompted. The `Cards` sheet tab will be created with headers.
5. **Deploy as Web App**:
   - Click **Deploy** > **New deployment** > **Web app**.
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` *(Crucial!)*
   - Copy the `/exec` URL and paste it into the Card Scanner app **Settings** tab.

---

## 📦 Deployment to HTTPS (Netlify / Cloudflare / Vercel)

> [!IMPORTANT]
> Mobile browsers require **HTTPS** to allow camera access and Service Worker PWA installation. `localhost` is also permitted for local testing.

### Option A: Netlify / Vercel
1. Build production static bundle:
   ```bash
   npm run build
   ```
2. Deploy the `dist/` folder via Git or drag-and-drop to Netlify / Vercel.

### Option B: Cloudflare Pages
- Connect repository, set build command to `npm run build`, and output directory to `dist`.

---

## 🧪 Testing Checklist

- [x] **Scaffold & Build**: Zero build errors (`npm run build`).
- [x] **Unit Tests**: All 11 parser test cases pass (`npm test`).
- [x] **PWA Assets**: Precached 43 entries (~32MB) including self-hosted Tesseract worker, WASM, and language models (`eng + ben`).
- [x] **CORS Preflight Prevention**: Requests use `fetch` with `Content-Type: text/plain;charset=utf-8`.
- [x] **Idempotency**: UUID `id` prevents duplicate rows in Google Sheet on network retries.
- [x] **Excel Bangla Compatibility**: CSV exports include `\uFEFF` UTF-8 BOM.
