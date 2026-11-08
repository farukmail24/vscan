# Card Scanner (PWA) 📱📇
> Mobile-first Progressive Web App with Google Gemini AI + Offline OCR (Tesseract.js eng+ben) + TiDB Cloud Serverless MySQL Database.

---

## 🌟 Key Features

1. **Dual Extraction Engines**:
   - **Gemini AI Mode (Online)**: Sends card photos via TiDB backend to the Gemini REST API (`gemini-2.5-flash`), extracting highly accurate structured JSON.
   - **Offline OCR Mode (No AI)**: In-browser self-hosted Tesseract.js v5 with bilingual support (`eng + ben`) and rule-based heuristic parser for Bangladeshi & international cards.
   - **QR / vCard Detection**: Scans QR codes with `jsQR` to instantly parse `BEGIN:VCARD` and `MECARD` contacts with 100% confidence.
   - **Auto Mode**: Intelligently uses AI when online and seamlessly falls back to offline OCR if offline or if rate limits occur.
2. **Mandatory Review & Tap-to-Assign**:
   - Visual verification screen with zoomable card photo previews.
   - Uncertain or unverified fields highlighted in amber.
   - **Tap-to-Assign**: For offline OCR cards, tap any detected text line chip and assign it to any field with zero manual typing.
   - Learned company layout memory in IndexedDB.
3. **TiDB Cloud Database Backend (MySQL Protocol)**:
   - Client-generated UUID `id` ensures idempotent saving (`INSERT ... ON DUPLICATE KEY UPDATE`).
   - Cards stored with high availability in AWS Singapore (`ap-southeast-1`).
   - Encrypted in transit via **TLS v1.2 SSL**.
   - Pre-save duplicate contact check (by email or phone).
4. **Offline Queue & Resilient Sync**:
   - IndexedDB local storage (`CardScannerDB`).
   - Cards captured in airplane mode are saved locally with `pending` status.
   - Automatic background upload to TiDB as soon as internet connection is restored.
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

# 3. Start local development server (Frontend + TiDB API)
npm run dev
```

Open `http://localhost:3000` in your browser (or open the network URL on your phone).

---

## 🗄️ TiDB Cloud Database Credentials

The app is pre-configured with the following TiDB Cloud Serverless credentials:

- **HOST**: `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`
- **PORT**: `4000`
- **USERNAME**: `5PNhhcR1jqyzySz.root`
- **DATABASE**: `test`
- **SSL / TLS**: Required (TLS v1.2)

### Table Schema

- `cards`: Stores all scanned card contacts with indexes on `name`, `company`, `email`, and `phone1`.
- `knowledge_rules`: Dynamic parsing vocabularies and rules.
- `app_settings`: Key-value application configurations.

To re-run migrations anytime:
```bash
npm run init-db
```

---

## 🌐 Running on Apache / XAMPP

Since the project is inside `htdocs/vscan`, you can also run it directly via Apache:
- Access `http://localhost/vscan` or `http://localhost/vscan/dist`.
- Apache uses the PHP backend located at [`api/index.php`](./api/index.php) and [`api/config.php`](./api/config.php) which connects to TiDB with MySQLi and SSL.

---

## 🧪 Testing Checklist

- [x] **TiDB Connection**: Successfully connected and pinged TiDB Serverless (Latency: ~600ms, Server: 8.0.11-TiDB-v8.5.3).
- [x] **Database Tables**: Tables `cards`, `knowledge_rules`, `app_settings` created and verified.
- [x] **CRUD Operations**: Verified inserting, reading, and updating test records with TLS encryption.
- [x] **Unit Tests**: All 20 parser tests pass (`npm test`).
- [x] **Production Build**: Zero build errors (`npm run build`).
