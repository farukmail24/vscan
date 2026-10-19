# Business Card Scanner (PWA) - PROJECT BRIEF
Goal: Mobile-first web app. User photographs a business/visiting card (front, optional back); the app extracts contact data; user reviews/edits; data is saved to a Google Sheet.

## Modes
- AI mode (online): image -> Google Apps Script -> Gemini API (structured JSON) -> app.
- Offline mode (no AI): in-browser OCR (tesseract.js, eng+ben, self-hosted assets) + rule-based parser (regex + keyword heuristics) + QR/vCard detection.
- Auto mode: AI if online, else offline. Setting: Auto | AI | Offline.

## Stack
- Frontend: Vite + vanilla JavaScript (ES modules), plain CSS (mobile-first), vite-plugin-pwa, idb, libphonenumber-js, tesseract.js v5, jsQR. Vitest for unit tests.
- Backend: Google Apps Script Web App (apps-script/Code.gs) bound to the Google Sheet. No other server.
- Secrets: GEMINI_API_KEY, APP_TOKEN, DRIVE_FOLDER_ID, GEMINI_MODEL (default gemini-2.5-flash) live ONLY in Apps Script Script Properties. Never in frontend code or git.

## Rules
- Bangladesh context: cards are English, Bangla or mixed. Phones look like +8801XXXXXXXXX, 01XXXXXXXXX, 02-XXXXXXXX. Default country BD.
- Always show a Review screen before saving. Highlight uncertain fields.
- Frontend calls Apps Script with fetch POST, Content-Type text/plain;charset=utf-8 (avoids CORS preflight), JSON string body, include "token".
- Every card gets a client-generated UUID `id`; backend must be idempotent (no duplicate rows on retry).
- Keep code small and modular: src/api.js, src/image.js, src/ocr.js, src/parser.js, src/db.js, src/settings.js, src/ui/*. No UI frameworks. Comment non-obvious parts.
- After each task run `npm run build` (and `npm test` if tests exist) and fix errors.

## Sheet (tab "Cards", row 1 headers)
ID | Timestamp | Name | Designation | Company | Phone 1 | Phone 2 | Email | Website | Address | Notes | Tags | Front Image | Back Image | Source | Needs Review | Scanned By

## Sheet (tab "Rules", row 1 headers)
Type | Value | Extra
(Supported Types: designation, company, company_suffix, address_word, ocr_confusion)

## Extracted JSON shape
{ name, designation, company, phones[], emails[], websites[], address, notes, uncertain_fields[] }

## Knowledge Pack & Self-Learning Engine (Step 11)
- Modular JSON vocabularies in `src/knowledge/`: `designations.json`, `company_suffixes.json`, `address_words.json`, `ocr_confusions.json`, `known_companies.json`.
- Merged with dynamic overrides in IndexedDB store `knowledge` and live synced from Google Sheet tab `Rules` via backend action `getKnowledge`.
- High-precision Fuse.js fuzzy matching auto-corrects recognized company and designation typos.
- Review screen learning loop automatically records user edits (designations, companies, Levenshtein OCR typos) to enhance subsequent scans.

