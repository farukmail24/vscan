/**
 * Rule-based Business Card Text Parser
 * Optimized for Bangladesh & South Asian business cards (English & Bengali).
 * Extracts structured JSON matching Gemini AI output shape.
 * Powered by dynamic Knowledge Packs and Fuse.js fuzzy entity matching.
 */

import {
  applyOcrWordCorrections,
  fuzzyMatchCompany,
  fuzzyMatchDesignation,
  getDesignations,
  getCompanySuffixes,
  getAddressWords
} from './knowledge.js';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Bengali to English digit translation map
const BENGALI_DIGITS = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
};

// Company indicators in English & Bengali
// Non-name slogans, certifications and greetings to skip during Name identification
const SLOGAN_PATTERNS = [
  /\b(ISO\s*\d+|Quality\s+First|Excellence(?:\s+in\s+[A-Za-z]+)?|Certified|Since\s+\d+|Established|Welcome|Service|Solutions|Trust|Integrity|Leading|Innovation|Global|Official|Bismillah|Alhamdulillah|World\s*Class)\b/i,
  /(বিসমিল্লাহ|আলহামদুলিল্লাহ|স্বাগতম|আন্তরিক|বিশ্বস্ততা|গুণগত মান|প্রতিষ্ঠিত|কোয়ালিটি)/
];

// Company indicators in English & Bengali
const COMPANY_PATTERNS = [
  /\b(Ltd|Limited|Corporation|Corp|Enterprise|Enterprises|Trading|Traders|Industries|Industry|Group|Solutions|& Co|Pvt|Private|Pte\s*Ltd|Holdings|Agency|Associates|International|Technologies|Tech|Consultancy|Bank|Hospital|Pharmaceuticals|Pharma|Telecom|Logistics|Engineering|Textiles|Garments|Apparels|Diagnostic|Chamber|Federation|Foundation|Institute|Academy|School|College|University|Centre|Center)\b/i,
  /(লিমিটেড|লিঃ|প্রাঃ\s*লিঃ|এন্টারপ্রাইজ|ট্রেডিং|ট্রেডার্স|ইন্ডাস্ট্রিজ|গ্রুপ|সলিউশন|কোম্পানী|কর্পোরেশন|ফার্মা|টেকনোলজি|কনসালটেন্সি|হসপিটাল|হাসপাতাল|ডায়াগনস্টিক|ব্যাংক|টেক্সটাইল|গার্মেন্টস|ফাউন্ডেশন|একাডেমি)/
];

// Standalone company suffix indicators (e.g. when 'LIMITED' is on its own line below brand name)
const COMPANY_SUFFIX_ONLY = /^(?:Ltd\.?|Limited|Pvt\.?\s*Ltd\.?|Private\s*Limited|Corporation|Corp\.?|Group|Industries|Enterprises|Holdings|Technologies|Solutions|Diagnostic|Hospital|College|University|লিমিটেড|লিঃ|ইন্ডাস্ট্রিজ|গ্রুপ)$/i;

// Designation indicators in English & Bengali (Note: 'MD' acronym handled separately to avoid matching 'Md.' name prefix)
const DESIGNATION_PATTERNS = [
  /\b(Chief Executive Officer|CEO|Managing Director|General Manager|GM|Assistant General Manager|AGM|Deputy General Manager|DGM|Executive Director|Director|Assistant Manager|Branch Manager|Manager|Senior Executive|Executive|Senior Officer|Officer|Proprietor|Chairman|Chairperson|Vice Chairman|Partner|Founder|Co-Founder|Chief Technology Officer|CTO|Chief Operating Officer|COO|Chief Financial Officer|CFO|Software Engineer|Senior Engineer|Lead Engineer|Civil Engineer|Electrical Engineer|Mechanical Engineer|Engineer|Consultant|Advisor|Principal|Doctor|Physician|Surgeon|Advocate|Barrister|Lecturer|Professor|Assistant Professor|Associate Professor|Head of [A-Za-z\s]+|Team Lead|Marketing Executive|Sales Executive|Accountant|Accounts Officer|Merchandiser)\b/i,
  /(ব্যবস্থাপনা পরিচালক|উপ-ব্যবস্থাপনা পরিচালক|পরিচালক|ম্যানেজার|ব্যবস্থাপক|সহকারী ম্যানেজার|নির্বাহী|কর্মকর্তা|হিসাবরক্ষণ কর্মকর্তা|চেয়ারম্যান|ভাইস চেয়ারম্যান|স্বত্বাধিকারী|প্রোপাইটার|প্রতিষ্ঠাতা|প্রকৌশলী|প্রধান নির্বাহী|পরামর্শক|আইনজীবী|অ্যাডভোকেট|ডাক্তার|অধ্যাপক|সহকারী অধ্যাপক|প্রভাষক|মার্চেন্ডাইজার)/
];

// Name honorifics/prefixes common in Bangladesh & South Asia (requires dot or subsequent name for Md to distinguish from standalone MD acronym)
const NAME_PREFIX_PATTERN = /^(?:Md\.|Md\s+[A-Za-z]|Mohammad\b|Mohammed\b|Muhammad\b|Mostafa\b|Mustafa\b|Mr\.\s*|Mrs\.\s*|Ms\.\s*|Dr\.\s*|Engr\.\s*|Advocate\b|Adv\.\s*|Barrister\b|Alhaj\b|Al-Haj\b|Haji\b|অধ্যাপক|ডাক্তার|প্রকৌশলী|জনাব)/i;

// Popular free email domains that must NEVER be extracted as company websites
const POPULAR_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com',
  'mail.com', 'zoho.com', 'yandex.com', 'proton.me', 'protonmail.com', 'aol.com'
]);

// Address indicators in English & Bengali
const ADDRESS_PATTERNS = [
  /\b(Road|Rd\.?|House|H#|Block|Sector|Floor|Level|Avenue|Ave\.?|Plot|Lane|Dhaka|Chattogram|Chittagong|Uttara|Gulshan|Banani|Dhanmondi|Motijheel|Mirpur|Mohakhali|Sylhet|Khulna|Rajshahi|Barishal|Rangpur|Mymensingh|Gazipur|Narayanganj|Tejgaon|Badda|Khilkhet|Agrabad|Nasirabad|Kawran Bazar|Wari|Baridhara|Post Code|ZIP)\b/i,
  /(সড়ক|রোড|বাড়ি|বাসা|হোল্ডিং|ব্লক|সেক্টর|তলা|লেভেল|প্লট|এভিনিউ|ঢাকা|চট্টগ্রাম|উত্তরা|গুলশান|বনানী|ধানমন্ডি|মতিঝিল|মিরপুর|মহাখালী|সিলেট|খুলনা|রাজশাহী|বরিশাল|রংপুর|ময়মনসিংহ|গাজীপুর|নারায়ণগঞ্জ|তেজগাঁও|আগ্রাবাদ|কাওরান বাজার|বারিধারা|পোস্ট কোড)/
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
    const hasPhoneLabel = /(?:phone|tel|mob|cell|hotline|ph|contact|ফোন|মোবাইল|টেলিফোন)[\s.:/–-]*([^\n]+)/i.test(line);

    // Split tokens on commas, slashes, pipes, semicolons, and "and/or"
    const tokens = line.split(/[,;/|]+|\s+(?:and|or|&)\s+/i).map(t => t.trim()).filter(Boolean);

    for (let token of tokens) {
      const cleaned = fixPhoneOcrConfusions(token);

      // Match all mobile numbers in the token (handles spaced formatting like "01711 223344" or "+880 1711-223344")
      const mobileRegex = /(?:\+?88\s*[-.]?)?0?1[3-9][\d\s.-]{8,15}\b/g;
      let m;
      let matchedInToken = false;
      while ((m = mobileRegex.exec(cleaned)) !== null) {
        const rawNum = m[0].replace(/[^\d+]/g, '');
        const digits = rawNum.replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('01')) {
          phones.push('+88' + digits);
          matchedInToken = true;
        } else if (digits.length === 13 && digits.startsWith('8801')) {
          phones.push('+' + digits);
          matchedInToken = true;
        } else if (rawNum.startsWith('+8801') && digits.length === 13) {
          phones.push(rawNum);
          matchedInToken = true;
        } else if (digits.length >= 10 && digits.length <= 13) {
          phones.push(rawNum);
          matchedInToken = true;
        }
      }

      if (matchedInToken) continue;

      // Match landlines (e.g. 02-8888888, 031-123456, +8802999999)
      const landlineMatch = cleaned.match(/(?:\+?88\s*[-.]?)?0[2-9][\d\s.-]{6,12}\b/);
      if (landlineMatch) {
        const rawLandline = landlineMatch[0].trim();
        phones.push(rawLandline);
        continue;
      }

      // If labeled phone line had a raw digit sequence
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
 * Extract websites from card text, avoiding free email domains like gmail.com
 */
export function extractWebsites(text) {
  const websites = [];
  const webRegex = /\b(?:https?:\/\/)?(?:www\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s,;]*)?|\b[A-Za-z0-9.-]+\.(?:com\.bd|gov\.bd|edu\.bd|org\.bd|com|net|org|xyz|io|biz|me)(?:\/[^\s,;]*)?\b/gi;
  let match;
  while ((match = webRegex.exec(text)) !== null) {
    const candidate = match[0].trim();
    // Exclude if it is immediately preceded by @ (part of an email address)
    if (match.index > 0 && text[match.index - 1] === '@') continue;
    if (candidate.includes('@')) continue;

    let formatted = candidate.toLowerCase();
    const cleanDomain = formatted.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

    // Exclude free public email providers (gmail.com, yahoo.com, etc.)
    if (POPULAR_EMAIL_DOMAINS.has(cleanDomain)) continue;

    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      formatted = 'https://' + formatted;
    }
    websites.push(formatted);
  }
  return Array.from(new Set(websites));
}

/**
 * Strips OCR noise artifacts, isolated stray non-Latin symbols, and punctuation debris from a line
 */
export function cleanArtifactsFromLine(line) {
  if (!line || typeof line !== 'string') return '';
  let cleaned = line.trim();
  // 1. Strip leading pipes, slashes, bullets, icons, brackets, colons
  cleaned = cleaned.replace(/^[|/\\:;!~•*©®€><০,\-–_]+\s*/, '');
  // 2. Strip isolated stray Bengali glyphs before English text (e.g. '২, Md. Abul' -> 'Md. Abul')
  cleaned = cleaned.replace(/^[০-৯অ-হ][,\s|/\\–-]+(?=[A-Za-z])/g, '');
  // 3. Strip bracketed digits or stray 1-2 char fragments followed by whitespace EXCEPT protected honorifics (Md, Dr, Mr, Ms)
  cleaned = cleaned.replace(/^(?!(?:Md|Dr|Mr|Ms)\b)[(\[{\\|]?[0-9a-zA-Z২-৯]{1,2}[)\]},.:;\-\\|/]+\s+/i, '');
  // 4. Strip stray non-honorific 1-2 chars before capitalized names (e.g. 'AS Md. Abul' -> 'Md. Abul')
  cleaned = cleaned.replace(/^(?!(?:Md|Dr|Mr|Ms)\b)[A-Za-z0-9]{1,2}\s+(?=[A-Z])/i, '');
  // 5. Strip isolated bracketed single digit (e.g. '(2 Kashem' -> 'Kashem')
  cleaned = cleaned.replace(/^[(\[{\\|]?[0-9২-৯][)\]}]?\s+(?=[A-Z])/i, '');
  // 6. Strip isolated junk noise words like 'iy ', 'll ', 'ii '
  cleaned = cleaned.replace(/^(?:iy|ii|ll|il)\s+/i, '');
  // 7. Strip leading non-alphanumeric chars
  cleaned = cleaned.replace(/^[^\w\u0980-\u09FF+]+/, '');
  // 8. Strip trailing punctuation symbols
  cleaned = cleaned.replace(/\s*[|:;!~•*©®€><()[\]/\\_–-]+$/, '');
  return cleaned.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Splits lines where inline contact/address labels were merged horizontally across columns
 */
export function splitCombinedLine(line) {
  if (!line || typeof line !== 'string') return [];
  const splitRegex = /(?<=\S\s+)(?=[©®•*~০>\-–|]*\s*(?:mobile|phone|tel|mob|cell|mail|email|contact|web|website|address|addr|office|ঠিকানা|মোবাইল|ফোন|ইমেইল)[\s.:–-])/i;
  return line.split(splitRegex).map(s => s.trim()).filter(Boolean);
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

  // Pre-clean and split lines: clean leading icon bullets, quotes, and column-merged labels
  const lines = [];
  rawText.split('\n').forEach(rawL => {
    const parts = splitCombinedLine(rawL);
    parts.forEach(p => {
      let cleaned = cleanArtifactsFromLine(p);
      cleaned = applyOcrWordCorrections(cleaned);
      if (cleaned.length > 0) lines.push(cleaned);
    });
  });

  const emails = extractEmails(rawText);
  const websites = extractWebsites(rawText);
  const phones = extractPhones(rawText);

  let name = null;
  let designation = null;
  let company = null;
  let addressLines = [];
  const notesLines = [];
  const uncertain_fields = [];

  // Helper to test regex patterns
  const matchesPatterns = (line, patterns) => patterns.some(p => p.test(line));

  // Classified line indices
  const lineTypes = new Array(lines.length).fill(null);

  // Dynamic knowledge vocabularies
  const dynDesigs = getDesignations().allList;
  const dynSuffixes = getCompanySuffixes().allList;

  // Pass 1: Identify Contact lines (phone, email, website)
  lines.forEach((line, idx) => {
    if (emails.some(e => line.toLowerCase().includes(e)) ||
        websites.some(w => line.toLowerCase().includes(w.replace(/^https?:\/\//, '')))) {
      lineTypes[idx] = 'contact';
      return;
    }

    if (/^(?:mobile|phone|tel|mail|email|contact|web|website|মোবাইল|ফোন|ইমেইল):/i.test(line)) {
      lineTypes[idx] = 'contact';
      return;
    }

    const digitCount = (line.match(/\d/g) || []).length;
    if (digitCount >= 6 && digitCount / line.length > 0.4) {
      lineTypes[idx] = 'phone';
      return;
    }
  });

  // Pass 2: Identify Non-name Slogans & Certifications
  lines.forEach((line, idx) => {
    if (lineTypes[idx] !== null) return;
    if (matchesPatterns(line, SLOGAN_PATTERNS) && !NAME_PREFIX_PATTERN.test(line)) {
      if (!matchesPatterns(line, COMPANY_PATTERNS) || /^(?:Excellence|Quality|Leading|World\s*Class)/i.test(line)) {
        lineTypes[idx] = 'slogan';
        notesLines.push(line);
      }
    }
  });

  // Pass 3: Identify Designation (handling acronyms like MD/CEO carefully)
  lines.forEach((line, idx) => {
    if (lineTypes[idx] !== null) return;
    if (NAME_PREFIX_PATTERN.test(line)) return; // Name prefix like 'Md.' is never a designation!

    const isExplicitDesignation = matchesPatterns(line, DESIGNATION_PATTERNS) ||
      dynDesigs.some(d => new RegExp(`\\b${escapeRegExp(d)}\\b`, 'i').test(line));
    const isAcronymDesignation = /^(?:MD|M\.D\.|M\/D|CEO|GM|AGM|DGM|CTO|COO|CFO)$/.test(line.trim());

    if (!designation && (isExplicitDesignation || isAcronymDesignation)) {
      designation = line;
      lineTypes[idx] = 'designation';
      return;
    }
  });

  // Pass 4: Identify Company (supporting multi-line combinations like 'PROVISE' + 'LIMITED')
  lines.forEach((line, idx) => {
    if (lineTypes[idx] !== null) return;
    const isDynSuffix = dynSuffixes.some(s => new RegExp(`\\b${escapeRegExp(s)}\\b`, 'i').test(line));
    if (matchesPatterns(line, COMPANY_PATTERNS) || isDynSuffix) {
      let comp = line;
      // If line is just a suffix (e.g. 'LIMITED' or 'GROUP') and preceding line is an unclassified title
      const isSuffixOnly = COMPANY_SUFFIX_ONLY.test(line.trim()) ||
        dynSuffixes.some(s => s.toLowerCase() === line.trim().toLowerCase());
      if (isSuffixOnly && idx > 0 && lineTypes[idx - 1] === null) {
        comp = lines[idx - 1] + ' ' + line;
        lineTypes[idx - 1] = 'company';
      }
      if (!company) {
        company = comp;
        lineTypes[idx] = 'company';
        return;
      }
    }
  });

  // Pass 5: Identify Address lines & strip label prefixes
  lines.forEach((line, idx) => {
    if (lineTypes[idx] !== null) return;
    const hasAddressPattern = matchesPatterns(line, ADDRESS_PATTERNS);
    const hasAddressPrefix = /^(?:Address|Addr|Office|Corporate Office|Factory|Head Office|ঠিকানা|Location)[\s.:–-]+/i.test(line);

    if (hasAddressPattern || hasAddressPrefix) {
      const cleanAddressLine = line.replace(/^(?:Address|Addr|Office|Corporate Office|Factory|Head Office|ঠিকানা|Location)[\s.:–-]+/i, '').trim();
      addressLines.push(cleanAddressLine || line);
      lineTypes[idx] = 'address';
      return;
    }
  });

  // Pass 6: Identify Name using smart candidate scoring (proximity to designation, name prefixes, word count)
  let bestNameCandidate = null;
  let bestNameScore = -999;
  let bestNameIdx = -1;

  const designationIdx = lineTypes.indexOf('designation');

  for (let idx = 0; idx < lines.length; idx++) {
    if (lineTypes[idx] !== null) continue;

    const line = lines[idx];
    const words = line.split(/\s+/).filter(Boolean);
    const hasDigits = /\d/.test(line);

    if (hasDigits || words.length === 0 || words.length > 5 || /[@/:=]/.test(line)) {
      continue;
    }

    let score = 0;

    // 1. Name prefix bonus (e.g. 'Md.', 'Mohammad', 'Dr.', 'Mr.', 'Engr.')
    if (NAME_PREFIX_PATTERN.test(line)) {
      score += 120;
    }

    // 2. Proximity to Designation (person name is almost always directly adjacent to designation)
    if (designationIdx !== -1) {
      const dist = Math.abs(idx - designationIdx);
      if (dist === 1) score += 90;
      else if (dist === 2) score += 60;
      else if (dist === 3) score += 30;
      else score -= 30;
    }

    // 3. Proper 2 to 4 word personal name
    if (words.length >= 2 && words.length <= 4) {
      score += 40;
    }

    // 4. Single all-caps word is usually a brand/company name (e.g. 'PROVISE', 'SONY')
    if (words.length === 1 && line === line.toUpperCase() && line.length > 2) {
      score -= 60;
    }

    // 5. Penalize lines with known company indicators that missed Pass 4
    if (matchesPatterns(line, COMPANY_PATTERNS)) {
      score -= 70;
    }

    if (score > bestNameScore) {
      bestNameScore = score;
      bestNameCandidate = line;
      bestNameIdx = idx;
    }
  }

  if (bestNameCandidate && bestNameIdx !== -1) {
    let fullName = bestNameCandidate.replace(/,\s*(?:MBBS|FCPS|MD|PhD|PMP|MBA|B\.?Sc|M\.?Sc|CPA|FCA)\b/gi, '').trim();
    lineTypes[bestNameIdx] = 'name';

    // Check if subsequent line completes the name (e.g. 'Md. Abul' followed by 'Kashem Akash')
    if (bestNameIdx + 1 < lines.length && lineTypes[bestNameIdx + 1] === null) {
      const nextLine = lines[bestNameIdx + 1];
      const nextWords = nextLine.split(/\s+/).filter(Boolean);
      const nextHasDigits = /\d/.test(nextLine);

      if (!nextHasDigits && nextWords.length >= 1 && nextWords.length <= 3 && !/[@/:=]/.test(nextLine)) {
        const afterNextIsDesignationOrContact = (bestNameIdx + 2 < lines.length) && 
          (lineTypes[bestNameIdx + 2] === 'designation' || lineTypes[bestNameIdx + 2] === 'contact');
        if (NAME_PREFIX_PATTERN.test(bestNameCandidate) || afterNextIsDesignationOrContact || (designationIdx !== -1 && bestNameIdx + 2 === designationIdx)) {
          fullName += ' ' + nextLine;
          lineTypes[bestNameIdx + 1] = 'name';
        }
      }
    }

    name = fullName || bestNameCandidate;
  }

  // Pass 7: If company still missing, look for prominent unclassified line
  if (!company) {
    for (let idx = 0; idx < lines.length; idx++) {
      if (lineTypes[idx] === null && lines[idx] !== name) {
        company = lines[idx];
        lineTypes[idx] = 'company';
        break;
      }
    }
  }

  // Build clean address string (normalize double commas and whitespace)
  let address = addressLines.length > 0 ? addressLines.join(', ') : null;
  if (address) {
    address = address
      .replace(/,\s*,+/g, ',')
      .replace(/\s*,\s*/g, ', ')
      .replace(/,\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Unclassified remaining lines form Notes
  lines.forEach((line, idx) => {
    if (lineTypes[idx] === null && !notesLines.includes(line)) {
      notesLines.push(line);
    }
  });

  const notes = notesLines.length > 0 ? notesLines.join('; ') : null;

  // High-confidence fuzzy entity matching against known knowledge base (e.g. 'Techno1ogy Ltd' -> 'Technology Ltd')
  if (company) {
    const fuzzyComp = fuzzyMatchCompany(company);
    if (fuzzyComp.matched) {
      company = fuzzyComp.value;
    }
  }

  if (designation) {
    const fuzzyDesig = fuzzyMatchDesignation(designation);
    if (fuzzyDesig.matched) {
      designation = fuzzyDesig.value;
    }
  }

  // Mark heuristically derived fields in uncertain_fields
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
    notes,
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
