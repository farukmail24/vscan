# Business Card Scanner (PWA) - PROJECT BRIEF
Goal: Mobile-first web app. User photographs a business/visiting card (front, optional back); the app extracts contact data; user reviews/edits; data is saved directly to TiDB Cloud Serverless MySQL Database.

## Modes
- AI mode (online): image -> TiDB API backend -> Gemini REST API (structured JSON) -> app.
- Offline mode (no AI): in-browser OCR (tesseract.js, eng+ben, self-hosted assets) + rule-based parser (regex + keyword heuristics) + QR/vCard detection.
- Auto mode: AI if online, else offline. Setting: Auto | AI | Offline.

## Stack
- Frontend: Vite + vanilla JavaScript (ES modules), plain CSS (mobile-first), vite-plugin-pwa, idb, libphonenumber-js, tesseract.js v5, jsQR. Vitest for unit tests.
- Backend Database: TiDB Cloud Serverless MySQL (Port 4000, TLS v1.2 SSL).
  - HOST: `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`
  - PORT: 4000
  - DATABASE: `test`
  - USER: `5PNhhcR1jqyzySz.root`
- API Layer:
  - Node.js API (`server/db.js`, `server/apiHandler.js`) integrated via Vite dev middleware and standalone server (`server/index.js`).
  - PHP API (`api/index.php`, `api/config.php`) with mysqli SSL for native Apache / XAMPP execution.

## Rules
- Bangladesh context: cards are English, Bangla or mixed. Phones look like +8801XXXXXXXXX, 01XXXXXXXXX, 02-XXXXXXXX. Default country BD.
- Always show a Review screen before saving. Highlight uncertain fields.
- Frontend calls API with JSON POST.
- Every card gets a client-generated UUID `id`; backend is idempotent (INSERT ... ON DUPLICATE KEY UPDATE).
- Keep code small and modular: src/api.js, src/image.js, src/ocr.js, src/parser.js, src/db.js, src/settings.js, src/ui/*. No UI frameworks.

## Database Tables (TiDB Cloud `test`)
- `cards`: id, timestamp, name, designation, company, phone1, phone2, email, website, address, notes, tags, front_image, back_image, source, needs_review, scanned_by, created_at, updated_at
- `knowledge_rules`: id, type, value, extra, created_at (types: designation, company, company_suffix, address_word, ocr_confusion)
- `app_settings`: setting_key, setting_value, updated_at

## Extracted JSON shape
{ name, designation, company, phones[], emails[], websites[], address, notes, uncertain_fields[] }

## Knowledge Pack & Self-Learning Engine
- Modular JSON vocabularies in `src/knowledge/`: `designations.json`, `company_suffixes.json`, `address_words.json`, `ocr_confusions.json`, `known_companies.json`.
- Merged with dynamic overrides in IndexedDB store `knowledge` and live synced from TiDB table `knowledge_rules` via backend action `getKnowledge`.
- High-precision Fuse.js fuzzy matching auto-corrects recognized company and designation typos.
- Review screen learning loop automatically records user edits (designations, companies, Levenshtein OCR typos) to enhance subsequent scans.
