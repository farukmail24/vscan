# Google Apps Script Backend Deployment Guide

This backend powers the Business Card Scanner. It connects your Google Sheet with the Gemini AI model, saves images to Google Drive, and manages contact deduplication.

---

## Prerequisites
1. **Google Sheet**: Create a new Google Sheet named `Card Scanner`.
2. **Gemini API Key**: Obtain a key from [Google AI Studio](https://aistudio.google.com/).
3. **Google Drive Folder**: Create a folder named `CardImages` in Google Drive. Open it and copy its ID from the URL (the string after `/folders/`).
4. **App Token**: Generate any long random string (e.g. `card_sec_9381kdf823x`). This acts as your shared secret key.

---

## Step 1: Open Apps Script Editor
1. In your Google Sheet, click **Extensions** > **Apps Script**.
2. Rename the project at the top to `Card Scanner Backend`.
3. Clear any default code in `Code.gs`.
4. Copy the entire contents of [`apps-script/Code.gs`](./Code.gs) and paste it into the editor.
5. Click the floppy disk icon or press `Ctrl + S` to save.

---

## Step 2: Configure Script Properties (Secrets)
1. On the left menu of the Apps Script editor, click the **Project Settings** (gear icon ⚙️).
2. Scroll down to **Script Properties** and click **Edit script properties** (or **Add script property**).
3. Add the following 4 properties:

| Property | Value | Description |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | *(Your Gemini API key)* | Required for AI extraction |
| `APP_TOKEN` | *(Your chosen random token)* | Shared secret token between app & backend |
| `DRIVE_FOLDER_ID` | *(Your Drive folder ID)* | Folder where card photos will be saved |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model to use (default) |

4. Click **Save script properties**.

---

## Step 3: Run Setup & Authorize Permissions
1. Switch back to the **Editor** (`< >` icon) on the left sidebar.
2. At the top toolbar, select `setup` from the function dropdown next to **Debug**.
3. Click **Run**.
4. An "Authorization required" popup will appear:
   - Click **Review permissions**.
   - Select your Google account.
   - If you see "Google hasn't verified this app", click **Advanced** > **Go to Card Scanner Backend (unsafe)**.
   - Click **Allow**.
5. Once `setup` completes, return to your Google Sheet: you will see a sheet tab named **Cards** with bold header styling:
   `ID | Timestamp | Name | Designation | Company | Phone 1 | Phone 2 | Email | Website | Address | Notes | Tags | Front Image | Back Image | Source | Needs Review | Scanned By`

---

## Step 4: Deploy as Web App
1. In the Apps Script editor, click the blue **Deploy** button (top right) > **New deployment**.
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
3. Fill in the fields:
   - **Description**: `v1 - Initial Release`
   - **Execute as**: `Me (your_email@gmail.com)`
   - **Who has access**: `Anyone` *(Crucial: allows the PWA fetch call to reach the script)*
4. Click **Deploy**.
5. Copy the **Web App URL** (ends with `/exec`).

> [!IMPORTANT]
> Whenever you modify `Code.gs` in the future, you **MUST** create a **New deployment** (or edit the existing deployment to a "New version") for the changes to take effect. Saving the script is not enough!

---

## Step 5: Test the Web App
1. Open your copied `/exec` URL in a browser tab.
2. You should see a JSON response:
   ```json
   {"ok": true, "service": "card-scanner", "timestamp": "..."}
   ```
3. In the Card Scanner PWA:
   - Open **Settings**.
   - Paste the `/exec` URL into **Apps Script URL**.
   - Paste your `APP_TOKEN` into **App Token**.
   - Click **Test connection**. You should receive a green "Connection successful!" notice.
