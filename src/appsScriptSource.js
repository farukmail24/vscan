/**
 * Raw Source of Google Apps Script Backend (apps-script/Code.gs)
 * Exported for 1-click clipboard copying directly inside the Settings UI.
 */

export const APPS_SCRIPT_SOURCE = `/**
 * Business Card Scanner - Google Apps Script Backend
 * Handles Gemini AI extraction, Google Sheet persistence, Drive storage, and duplicate checks.
 */

// Headers for the "Cards" sheet
const HEADERS = [
  'ID',
  'Timestamp',
  'Name',
  'Designation',
  'Company',
  'Phone 1',
  'Phone 2',
  'Email',
  'Website',
  'Address',
  'Notes',
  'Tags',
  'Front Image',
  'Back Image',
  'Source',
  'Needs Review',
  'Scanned By'
];

/**
 * Health check endpoint
 */
function doGet(e) {
  return createJsonResponse({
    ok: true,
    service: 'card-scanner',
    timestamp: new Date().toISOString()
  });
}

/**
 * Main webhook handler for all POST actions
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ ok: false, error: 'Empty request body' });
    }

    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({ ok: false, error: 'Invalid JSON payload' });
    }

    const scriptProps = PropertiesService.getScriptProperties();
    const appToken = scriptProps.getProperty('APP_TOKEN');

    // Token verification
    if (!appToken || body.token !== appToken) {
      return createJsonResponse({ ok: false, error: 'unauthorized' });
    }

    const action = body.action;

    switch (action) {
      case 'ping':
        return createJsonResponse({ ok: true, pong: true, timestamp: new Date().toISOString() });

      case 'extract':
        return handleExtract(body, scriptProps);

      case 'checkDuplicate':
        return handleCheckDuplicate(body);

      case 'save':
        return handleSave(body, scriptProps);

      case 'update':
        return handleUpdate(body);

      default:
        return createJsonResponse({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return createJsonResponse({ ok: false, error: err.message || err.toString() });
  }
}

/**
 * Gemini AI Extraction via REST API
 */
function handleExtract(body, scriptProps) {
  const apiKey = scriptProps.getProperty('GEMINI_API_KEY');
  const modelName = scriptProps.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';

  if (!apiKey) {
    return createJsonResponse({ ok: false, error: 'GEMINI_API_KEY is not configured in Script Properties' });
  }

  if (!body.imageBase64) {
    return createJsonResponse({ ok: false, error: 'Missing imageBase64' });
  }

  const mimeType = body.mimeType || 'image/jpeg';
  const cleanFront = body.imageBase64.replace(/^data:[^;]+;base64,/, '');

  const parts = [
    {
      inline_data: {
        mime_type: mimeType,
        data: cleanFront
      }
    }
  ];

  if (body.backImageBase64) {
    const cleanBack = body.backImageBase64.replace(/^data:[^;]+;base64,/, '');
    const backMime = body.backMimeType || 'image/jpeg';
    parts.push({
      inline_data: {
        mime_type: backMime,
        data: cleanBack
      }
    });
  }

  const promptText =
    'Carefully extract all visiting/business card details from this card image. ' +
    'The card may be in English, Bengali (বাংলা), or bilingual. ' +
    'Guidelines for highest accuracy: ' +
    '1. name: The individual person full name printed on the card (e.g. "Md. Tanvir Hasan", "মোঃ রফিকুল ইসলাম"). Exclude company name or tagline. ' +
    '2. designation: Job title or role (e.g. "Managing Director", "ব্যবস্থাপনা পরিচালক", "CEO", "Proprietor", "Executive"). ' +
    '3. company: The organization, company, institution, or business name. Do not confuse slogans or brand mottos with the company name. ' +
    '4. phones: Extract all telephone, mobile, WhatsApp, and hotline numbers as an array of strings exactly as printed. ' +
    '5. emails: Extract all valid email addresses. ' +
    '6. websites: Extract official websites or URLs. ' +
    '7. address: The physical office/store address including road, house, area (e.g., Gulshan, Dhanmondi, Agrabad) and city/district. ' +
    '8. notes: Any remaining printed services, branches, or slogans. ' +
    '9. uncertain_fields: Add any field names whose text is blurry, truncated, or ambiguous. ' +
    'Strictly extract only what is physically printed on the card. Do not invent or assume data.';

  parts.push({ text: promptText });

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(modelName) + ':generateContent?key=' + encodeURIComponent(apiKey);

  const payload = {
    system_instruction: {
      parts: [
        {
          text:
            'You are an expert OCR and contact information extraction system for business/visiting cards, ' +
            'specialized in South Asian (especially Bangladeshi) and international business cards. ' +
            'Cards may contain Bengali, English, or bilingual typography. ' +
            'Extract strictly the physical printed details. Do not fabricate data. ' +
            'Use null or empty arrays when fields are absent. ' +
            'List any uncertain, blurred, or guessed fields in uncertain_fields. ' +
            'Output must adhere strictly to the JSON schema.'
        }
      ]
    },
    contents: [
      {
        role: 'user',
        parts: parts
      }
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', nullable: true },
          designation: { type: 'STRING', nullable: true },
          company: { type: 'STRING', nullable: true },
          phones: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          emails: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          websites: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          address: { type: 'STRING', nullable: true },
          notes: { type: 'STRING', nullable: true },
          uncertain_fields: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          }
        },
        required: ['phones', 'emails', 'websites', 'uncertain_fields']
      }
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode === 429) {
    return createJsonResponse({
      ok: false,
      error: 'Gemini API rate limit reached (429). Please wait a moment or try again.'
    });
  }

  if (responseCode !== 200) {
    let errMessage = 'Gemini API error (Status ' + responseCode + ')';
    try {
      const errObj = JSON.parse(responseText);
      if (errObj.error && errObj.error.message) {
        errMessage += ': ' + errObj.error.message;
      }
    } catch (_) {
      errMessage += ': ' + responseText;
    }
    return createJsonResponse({ ok: false, error: errMessage });
  }

  try {
    const data = JSON.parse(responseText);
    const candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
      return createJsonResponse({ ok: false, error: 'Empty response from Gemini AI' });
    }

    const structuredJsonText = candidate.content.parts[0].text;
    const extractedData = JSON.parse(structuredJsonText);

    return createJsonResponse({
      ok: true,
      data: {
        name: extractedData.name || null,
        designation: extractedData.designation || null,
        company: extractedData.company || null,
        phones: Array.isArray(extractedData.phones) ? extractedData.phones : [],
        emails: Array.isArray(extractedData.emails) ? extractedData.emails : [],
        websites: Array.isArray(extractedData.websites) ? extractedData.websites : [],
        address: extractedData.address || null,
        notes: extractedData.notes || null,
        uncertain_fields: Array.isArray(extractedData.uncertain_fields) ? extractedData.uncertain_fields : []
      }
    });
  } catch (parseErr) {
    return createJsonResponse({
      ok: false,
      error: 'Failed to parse Gemini output: ' + parseErr.message
    });
  }
}

/**
 * Check for existing records by phone or email in the "Cards" sheet
 */
function handleCheckDuplicate(body) {
  const sheet = getOrCreateCardsSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return createJsonResponse({ ok: true, duplicates: [] });
  }

  const emailsToCheck = (body.emails || []).map(function(e) { return (e || '').trim().toLowerCase(); }).filter(Boolean);
  const phonesToCheck = (body.phones || []).map(function(p) { return normalizePhoneForMatch(p); }).filter(Boolean);

  const emailColIdx = HEADERS.indexOf('Email');
  const phone1ColIdx = HEADERS.indexOf('Phone 1');
  const phone2ColIdx = HEADERS.indexOf('Phone 2');
  const idColIdx = HEADERS.indexOf('ID');
  const nameColIdx = HEADERS.indexOf('Name');
  const companyColIdx = HEADERS.indexOf('Company');

  const matches = [];
  const matchedIds = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowId = row[idColIdx];
    const rowName = row[nameColIdx];
    const rowCompany = row[companyColIdx];
    const rowEmail = (row[emailColIdx] || '').toString().trim().toLowerCase();
    const rowPhone1 = normalizePhoneForMatch(row[phone1ColIdx]);
    const rowPhone2 = normalizePhoneForMatch(row[phone2ColIdx]);

    let matched = false;
    let matchReason = '';

    if (rowEmail && emailsToCheck.indexOf(rowEmail) !== -1) {
      matched = true;
      matchReason = 'Email matched (' + rowEmail + ')';
    } else if (phonesToCheck.some(function(p) { return p === rowPhone1 || p === rowPhone2; })) {
      matched = true;
      matchReason = 'Phone matched';
    }

    if (matched && !matchedIds[rowId]) {
      matchedIds[rowId] = true;
      matches.push({
        id: rowId,
        name: rowName,
        company: rowCompany,
        email: row[emailColIdx],
        phone1: row[phone1ColIdx],
        reason: matchReason
      });
    }
  }

  return createJsonResponse({ ok: true, duplicates: matches });
}

/**
 * Save record and upload images to Google Drive (Idempotent with LockService)
 */
function handleSave(body, scriptProps) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return createJsonResponse({ ok: false, error: 'Could not acquire lock. Please try again.' });
  }

  try {
    const record = body.record;
    if (!record || !record.id) {
      return createJsonResponse({ ok: false, error: 'Record with client UUID id is required' });
    }

    const sheet = getOrCreateCardsSheet();
    const data = sheet.getDataRange().getValues();
    const idColIdx = HEADERS.indexOf('ID');

    // Idempotency check: see if row already exists
    for (let i = 1; i < data.length; i++) {
      if (data[i][idColIdx] === record.id) {
        return createJsonResponse({ ok: true, duplicate: true, row: i + 1, id: record.id });
      }
    }

    // Save images to Google Drive if folder is configured
    const driveFolderId = scriptProps.getProperty('DRIVE_FOLDER_ID');
    let frontImageUrl = '';
    let backImageUrl = '';

    if (driveFolderId) {
      try {
        const folder = DriveApp.getFolderById(driveFolderId);

        if (body.frontImageBase64) {
          const cleanFront = body.frontImageBase64.replace(/^data:[^;]+;base64,/, '');
          const frontBlob = Utilities.newBlob(Utilities.base64Decode(cleanFront), 'image/jpeg', 'card_' + record.id + '_front.jpg');
          const frontFile = folder.createFile(frontBlob);
          frontFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          frontImageUrl = frontFile.getUrl();
        }

        if (body.backImageBase64) {
          const cleanBack = body.backImageBase64.replace(/^data:[^;]+;base64,/, '');
          const backBlob = Utilities.newBlob(Utilities.base64Decode(cleanBack), 'image/jpeg', 'card_' + record.id + '_back.jpg');
          const backFile = folder.createFile(backBlob);
          backFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          backImageUrl = backFile.getUrl();
        }
      } catch (driveErr) {
        frontImageUrl = 'Drive Error: ' + driveErr.message;
      }
    }

    const timestamp = record.timestamp || new Date().toISOString();
    const phones = Array.isArray(record.phones) ? record.phones : [];
    const phone1 = phones[0] || record.phone1 || '';
    const phone2 = phones[1] || record.phone2 || '';
    const email = Array.isArray(record.emails) ? record.emails[0] : (record.email || '');
    const website = Array.isArray(record.websites) ? record.websites[0] : (record.website || '');
    const tags = Array.isArray(record.tags) ? record.tags.join(', ') : (record.tags || '');

    const rowData = [
      record.id,
      timestamp,
      record.name || '',
      record.designation || '',
      record.company || '',
      phone1,
      phone2,
      email,
      website,
      record.address || '',
      record.notes || '',
      tags,
      frontImageUrl || record.frontImageUrl || '',
      backImageUrl || record.backImageUrl || '',
      record.source || 'AI',
      record.needsReview ? 'TRUE' : 'FALSE',
      record.scannedBy || ''
    ];

    sheet.appendRow(rowData);
    const newRowNum = sheet.getLastRow();

    return createJsonResponse({
      ok: true,
      row: newRowNum,
      id: record.id,
      frontImageUrl: frontImageUrl,
      backImageUrl: backImageUrl
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update an existing record by ID
 */
function handleUpdate(body) {
  const id = body.id;
  const record = body.record;

  if (!id || !record) {
    return createJsonResponse({ ok: false, error: 'id and record are required' });
  }

  const sheet = getOrCreateCardsSheet();
  const data = sheet.getDataRange().getValues();
  const idColIdx = HEADERS.indexOf('ID');

  let targetRowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idColIdx] === id) {
      targetRowIndex = i + 1;
      break;
    }
  }

  if (targetRowIndex === -1) {
    return createJsonResponse({ ok: false, error: 'Record with id not found: ' + id });
  }

  const phones = Array.isArray(record.phones) ? record.phones : [];
  const phone1 = phones[0] || record.phone1 || '';
  const phone2 = phones[1] || record.phone2 || '';
  const email = Array.isArray(record.emails) ? record.emails[0] : (record.email || '');
  const website = Array.isArray(record.websites) ? record.websites[0] : (record.website || '');
  const tags = Array.isArray(record.tags) ? record.tags.join(', ') : (record.tags || '');

  const existingRow = data[targetRowIndex - 1];
  const frontImage = record.frontImageUrl || existingRow[HEADERS.indexOf('Front Image')] || '';
  const backImage = record.backImageUrl || existingRow[HEADERS.indexOf('Back Image')] || '';

  const rowData = [
    id,
    existingRow[HEADERS.indexOf('Timestamp')] || new Date().toISOString(),
    record.name !== undefined ? record.name : existingRow[HEADERS.indexOf('Name')],
    record.designation !== undefined ? record.designation : existingRow[HEADERS.indexOf('Designation')],
    record.company !== undefined ? record.company : existingRow[HEADERS.indexOf('Company')],
    phone1 !== '' ? phone1 : existingRow[HEADERS.indexOf('Phone 1')],
    phone2 !== '' ? phone2 : existingRow[HEADERS.indexOf('Phone 2')],
    email !== '' ? email : existingRow[HEADERS.indexOf('Email')],
    website !== '' ? website : existingRow[HEADERS.indexOf('Website')],
    record.address !== undefined ? record.address : existingRow[HEADERS.indexOf('Address')],
    record.notes !== undefined ? record.notes : existingRow[HEADERS.indexOf('Notes')],
    tags !== '' ? tags : existingRow[HEADERS.indexOf('Tags')],
    frontImage,
    backImage,
    record.source || existingRow[HEADERS.indexOf('Source')],
    record.needsReview !== undefined ? (record.needsReview ? 'TRUE' : 'FALSE') : existingRow[HEADERS.indexOf('Needs Review')],
    record.scannedBy !== undefined ? record.scannedBy : existingRow[HEADERS.indexOf('Scanned By')]
  ];

  sheet.getRange(targetRowIndex, 1, 1, HEADERS.length).setValues([rowData]);

  return createJsonResponse({ ok: true, id: id, row: targetRowIndex });
}

/**
 * Setup function: Creates or validates the "Cards" tab with header row
 */
function setup() {
  const sheet = getOrCreateCardsSheet();
  const range = sheet.getRange(1, 1, 1, HEADERS.length);
  range.setValues([HEADERS]);
  range.setFontWeight('bold');
  range.setBackground('#f3f4f6');
  sheet.setFrozenRows(1);
  Logger.log('Cards sheet setup complete with headers: ' + HEADERS.join(', '));
}

/**
 * Helper to get or create the "Cards" sheet
 */
function getOrCreateCardsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Cards');
  if (!sheet) {
    sheet = ss.insertSheet('Cards');
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Normalizes phone numbers for duplicate checking
 */
function normalizePhoneForMatch(phone) {
  if (!phone) return '';
  const digits = phone.toString().replace(/\\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Helper to build JSON ContentService response
 */
function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
