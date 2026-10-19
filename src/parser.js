/**
 * Rule-based Business Card Text Parser
 * Optimized for Bangladesh & South Asian business cards (English & Bengali).
 * Extracts structured JSON matching Gemini AI output shape.
 */

// Bengali to English digit translation map
const BENGALI_DIGITS = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
};

// Company indicators in English & Bengali
const COMPANY_PATTERNS = [
  /\b(Ltd|Limited|Corporation|Corp|Enterprise|Enterprises|Trading|Industries|Industry|Group|Solutions|& Co|Pvt|Private|Holdings|Agency|Associates|International|Technologies|Tech|Consultancy|Bank|Hospital|Pharmaceuticals|Pharma|Telecom|Logistics|Engineering)\b/i,
  /(লিমিটেড|লিঃ|এন্টারপ্রাইজ|ট্রেডিং|ইন্ডাস্ট্রিজ|গ্রুপ|সলিউশন|কোম্পানী|কর্পোরেশন|ফার্মা|টেকনোলজি|কনসালটেন্সি|হসপিটাল|ব্যাংক)/
];

// Designation indicators in English & Bengali
const DESIGNATION_PATTERNS = [
  /\b(Chief Executive Officer|CEO|Managing Director|MD|General Manager|GM|Assistant General Manager|AGM|Deputy General Manager|DGM|Executive Director|Director|Assistant Manager|Branch Manager|Manager|Senior Executive|Executive|Senior Officer|Officer|Proprietor|Chairman|Chairperson|Vice Chairman|Partner|Founder|Co-Founder|Chief Technology Officer|CTO|Chief Operating Officer|COO|Chief Financial Officer|CFO|Software Engineer|Senior Engineer|Lead Engineer|Civil Engineer|Electrical Engineer|Engineer|Consultant|Advisor|Principal|Doctor|Advocate|Barrister|Head of [A-Za-z\s]+|Team Lead|Marketing Executive|Sales Executive)\b/i,
  /(ব্যবস্থাপনা পরিচালক|উপ-ব্যবস্থাপনা পরিচালক|পরিচালক|ম্যানেজার|সহকারী ম্যানেজার|নির্বাহী|কর্মকর্তা|চেয়ারম্যান|ভাইস চেয়ারম্যান|স্বত্বাধিকারী|প্রোপাইটার|প্রতিষ্ঠাতা|প্রকৌশলী|প্রধান নির্বাহী|পরামর্শক|আইনজীবী|ডাক্তার)/
];

// Address indicators in English & Bengali
const ADDRESS_PATTERNS = [
  /\b(Road|Rd\.?|House|H#|Block|Sector|Floor|Level|Avenue|Ave\.?|Plot|Lane|Dhaka|Chattogram|Chittagong|Uttara|Gulshan|Banani|Dhanmondi|Motijheel|Mirpur|Mohakhali|Sylhet|Khulna|Rajshahi|Barishal|Rangpur|Mymensingh|Gazipur|Narayanganj|Tejgaon|Badda|Khilkhet|Agrabad|Post Code|ZIP)\b/i,
  /(সড়ক|রোড|বাড়ি|বাসা|হোল্ডিং|ব্লক|সেক্টর|তলা|লেভেল|প্লট|এভিনিউ|ঢাকা|চট্টগ্রাম|উত্তরা|গুলশান|বনানী|ধানমন্ডি|মতিঝিল|মিরপুর|মহাখালী|সিলেট|খুলনা|রাজশাহী|বরিশাল|রংপুর|ময়মনসিংহ|গাজীপুর|নারায়ণগঞ্জ|তেজগাঁও|আগ্রাবাদ|পোস্ট কোড)/
];

/**
 * Normalizes Bengali digits to ASCII digits
 */
export function convertBengaliDigitsToAscii(str) {
  if (!str) return '';
  return str.replace(/[০-৯]/g, (ch) => BENGALI_DIGITS[ch] || ch);
}

/**
 * Clean OCR character confusion in phone-like strings
 */
export function fixPhoneOcrConfusions(token) {
  if (!token) return '';
  // Convert any Bengali digits first
  let cleaned = convertBengaliDigitsToAscii(token);

  // If token has digits or phone symbols (+, -, space), fix common letter confusions
  if (/[0-9+]/.test(cleaned)) {
    cleaned = cleaned
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-') // Normalize dashes
      .replace(/[oO]/g, '0')
      .replace(/[lI|]/g, '1')
      .replace(/S/g, '5')
      .replace(/B/g, '8');
  }
  return cleaned;
}

/**
 * Extract phone numbers from card text with Bangladesh format recognition
 */
export function extractPhones(text) {
  const phones = [];
  const normalizedText = convertBengaliDigitsToAscii(text);
  const lines = normalizedText.split('\n');

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Check if line indicates phone
    const hasPhoneLabel = /(?:phone|tel|mob|cell|hotline|ph|মোবাইল|ফোন|টেলিফোন)[\s.:/–-]*([^\n]+)/i.test(line);

    // Look for tokens resembling phone numbers
    // BD patterns: +8801[3-9]\d{8}, 8801[3-9]\d{8}, 01[3-9]\d{8}, 02-xxxxxxx, etc.
    const tokens = line.split(/[,;/|]+/).map(t => t.trim()).filter(Boolean);

    for (let token of tokens) {
      // Clean OCR misreadings
      const cleaned = fixPhoneOcrConfusions(token);

      // Search for mobile numbers
      const mobileMatch = cleaned.match(/(?:\+?88\s*[-.]?)?0?1[3-9][\d\s.-]{8,11}\b/);
      if (mobileMatch) {
        const rawNum = mobileMatch[0].replace(/[^\d+]/g, '');
        const digits = rawNum.replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('01')) {
          phones.push('+88' + digits);
        } else if (digits.length === 13 && digits.startsWith('8801')) {
          phones.push('+' + digits);
        } else if (rawNum.startsWith('+8801') && digits.length === 13) {
          phones.push(rawNum);
        } else if (digits.length >= 10) {
          phones.push(rawNum);
        }
        continue;
      }

      // Search for landlines (e.g. 02-8888888, +8802999999)
      const landlineMatch = cleaned.match(/(?:\+?88\s*[-.]?)?0[2-9][\d\s.-]{6,10}\b/);
      if (landlineMatch) {
        const rawLandline = landlineMatch[0].trim();
        phones.push(rawLandline);
        continue;
      }

      // If labeled phone line had a number
      if (hasPhoneLabel) {
        const digitSeq = cleaned.replace(/\D/g, '');
        if (digitSeq.length >= 7 && digitSeq.length <= 14) {
          phones.push(cleaned.replace(/^[^\d+]+/, '').trim());
        }
      }
    }
  }

  // Deduplicate preserving order
  return Array.from(new Set(phones));
}

/**
 * Extract email addresses from card text
 */
export function extractEmails(text) {
  const emails = [];
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  let match;
  while ((match = emailRegex.exec(text)) !== null) {
    emails.push(match[0].toLowerCase());
  }
  return Array.from(new Set(emails));
}

/**
 * Extract websites from card text
 */
export function extractWebsites(text) {
  const websites = [];
  const webRegex = /\b(?:https?:\/\/)?(?:www\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s,;]*)?|\b[A-Za-z0-9.-]+\.(?:com\.bd|gov\.bd|edu\.bd|org\.bd|com|net|org|xyz|io|biz|me)(?:\/[^\s,;]*)?\b/gi;
  let match;
  while ((match = webRegex.exec(text)) !== null) {
    const candidate = match[0].trim();
    // Exclude if it is an email
    if (candidate.includes('@')) continue;
    let formatted = candidate.toLowerCase();
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      formatted = 'https://' + formatted;
    }
    websites.push(formatted);
  }
  return Array.from(new Set(websites));
}

/**
 * Parse card text and return structured JSON
 * @param {string} rawText - OCR output
 * @returns {object} Extracted card data
 */
export function parseCardText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      name: null,
      designation: null,
      company: null,
      phones: [],
      emails: [],
      websites: [],
      address: null,
      notes: null,
      uncertain_fields: ['name', 'company', 'designation', 'address']
    };
  }

  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const emails = extractEmails(rawText);
  const websites = extractWebsites(rawText);
  const phones = extractPhones(rawText);

  let name = null;
  let designation = null;
  let company = null;
  let addressLines = [];
  const uncertain_fields = [];

  // Helper to test regex patterns
  const matchesPatterns = (line, patterns) => patterns.some(p => p.test(line));

  // Classified line indices
  const lineTypes = new Array(lines.length).fill(null);

  // Pass 1: Identify Designation, Company, Address, Contact lines
  lines.forEach((line, idx) => {
    // Check if line contains email or website or majority digits (phone)
    if (emails.some(e => line.toLowerCase().includes(e)) ||
        websites.some(w => line.toLowerCase().includes(w.replace(/^https?:\/\//, '')))) {
      lineTypes[idx] = 'contact';
      return;
    }

    const digitCount = (line.match(/\d/g) || []).length;
    if (digitCount >= 6 && digitCount / line.length > 0.4) {
      lineTypes[idx] = 'phone';
      return;
    }

    // Designation check
    if (!designation && matchesPatterns(line, DESIGNATION_PATTERNS)) {
      designation = line;
      lineTypes[idx] = 'designation';
      return;
    }

    // Address check
    if (matchesPatterns(line, ADDRESS_PATTERNS)) {
      addressLines.push(line);
      lineTypes[idx] = 'address';
      return;
    }

    // Company check
    if (!company && matchesPatterns(line, COMPANY_PATTERNS)) {
      company = line;
      lineTypes[idx] = 'company';
      return;
    }
  });

  // Pass 2: Identify Name
  // Top-most 2-4 word line without digits that isn't classified
  for (let idx = 0; idx < lines.length; idx++) {
    if (lineTypes[idx] !== null) continue;

    const line = lines[idx];
    const words = line.split(/\s+/).filter(Boolean);
    const hasDigits = /\d/.test(line);

    // Business card names are usually 2 to 4 words (or single prominent name), without punctuation heavy symbols
    if (!hasDigits && words.length >= 1 && words.length <= 5 && !/[@/:=]/.test(line)) {
      name = line;
      lineTypes[idx] = 'name';
      break;
    }
  }

  // Pass 3: If company still missing, look for prominent unclassified lines
  if (!company) {
    for (let idx = 0; idx < lines.length; idx++) {
      if (lineTypes[idx] === null && lines[idx] !== name) {
        company = lines[idx];
        lineTypes[idx] = 'company';
        break;
      }
    }
  }

  // Build full address string
  const address = addressLines.length > 0 ? addressLines.join(', ') : null;

  // Unclassified remaining lines form Notes
  const remainingNotes = lines
    .filter((_, idx) => lineTypes[idx] === null)
    .join('; ');

  // Per specification: all heuristically derived fields in offline mode go into uncertain_fields
  if (name) uncertain_fields.push('name');
  if (designation) uncertain_fields.push('designation');
  if (company) uncertain_fields.push('company');
  if (address) uncertain_fields.push('address');
  if (phones.length === 0) uncertain_fields.push('phone1');

  return {
    name: name || null,
    designation: designation || null,
    company: company || null,
    phones,
    emails,
    websites,
    address,
    notes: remainingNotes || null,
    uncertain_fields
  };
}

/**
 * Parse vCard / MeCard text from QR code scan
 * High confidence extraction
 */
export function parseVCard(qrText) {
  if (!qrText || typeof qrText !== 'string') return null;

  const isVCard = qrText.includes('BEGIN:VCARD');
  const isMeCard = qrText.startsWith('MECARD:');

  if (!isVCard && !isMeCard) return null;

  const result = {
    name: null,
    designation: null,
    company: null,
    phones: [],
    emails: [],
    websites: [],
    address: null,
    notes: null,
    uncertain_fields: [] // vCard is high confidence!
  };

  if (isVCard) {
    const lines = qrText.split(/\r?\n/);
    lines.forEach((line) => {
      const upper = line.toUpperCase();
      if (upper.startsWith('FN:') || upper.startsWith('FN;')) {
        result.name = line.split(':')[1]?.trim() || result.name;
      } else if (upper.startsWith('TITLE:')) {
        result.designation = line.split(':')[1]?.trim() || null;
      } else if (upper.startsWith('ORG:')) {
        result.company = line.split(':')[1]?.split(';')[0]?.trim() || null;
      } else if (upper.startsWith('TEL') && line.includes(':')) {
        const phone = line.split(':')[1]?.trim();
        if (phone) result.phones.push(phone);
      } else if (upper.startsWith('EMAIL') && line.includes(':')) {
        const email = line.split(':')[1]?.trim().toLowerCase();
        if (email) result.emails.push(email);
      } else if (upper.startsWith('URL') && line.includes(':')) {
        const url = line.substring(line.indexOf(':') + 1).trim();
        if (url) result.websites.push(url.startsWith('http') ? url : 'https://' + url);
      } else if (upper.startsWith('ADR') && line.includes(':')) {
        const parts = line.split(':')[1]?.split(';').filter(Boolean).map(p => p.trim());
        if (parts && parts.length > 0) result.address = parts.join(', ');
      } else if (upper.startsWith('NOTE:')) {
        result.notes = line.split(':')[1]?.trim() || null;
      }
    });
  } else if (isMeCard) {
    // MECARD:N:Name;ORG:Company;TEL:01700000000;EMAIL:abc@xyz.com;ADR:Dhaka;;
    const content = qrText.substring(7);
    const fields = content.split(';');
    fields.forEach((f) => {
      const idx = f.indexOf(':');
      if (idx === -1) return;
      const key = f.substring(0, idx).toUpperCase();
      const val = f.substring(idx + 1).trim();
      if (!val) return;

      if (key === 'N') result.name = val.replace(/,/g, ' ');
      else if (key === 'ORG') result.company = val;
      else if (key === 'TEL') result.phones.push(val);
      else if (key === 'EMAIL') result.emails.push(val.toLowerCase());
      else if (key === 'URL') result.websites.push(val.startsWith('http') ? val : 'https://' + val);
      else if (key === 'ADR') result.address = val;
      else if (key === 'NOTE') result.notes = val;
    });
  }

  return result;
}
