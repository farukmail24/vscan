import { describe, it, expect } from 'vitest';
import {
  parseCardText,
  extractPhones,
  extractEmails,
  extractWebsites,
  fixPhoneOcrConfusions,
  convertBengaliDigitsToAscii,
  parseVCard
} from './parser.js';
import { reconstructLayoutLines } from './ocr.js';
import {
  recordLearnedCorrection,
  applyOcrWordCorrections,
  fuzzyMatchCompany,
  fuzzyMatchDesignation
} from './knowledge.js';

describe('Card Text Parser & Heuristics', () => {
  it('1. Extracts standard English business card with designation and company', () => {
    const raw = `
      Tanvir Ahmed
      Managing Director
      Apex Technologies Ltd.
      Phone: +8801712345678
      Email: tanvir@apextech.com.bd
      Web: www.apextech.com.bd
      House # 42, Road # 11, Banani, Dhaka-1213
    `;
    const res = parseCardText(raw);
    expect(res.name).toBe('Tanvir Ahmed');
    expect(res.designation).toBe('Managing Director');
    expect(res.company).toBe('Apex Technologies Ltd.');
    expect(res.phones).toContain('+8801712345678');
    expect(res.emails).toContain('tanvir@apextech.com.bd');
    expect(res.websites).toContain('https://www.apextech.com.bd');
    expect(res.address).toContain('Banani, Dhaka');
    expect(res.uncertain_fields).toContain('name');
    expect(res.uncertain_fields).toContain('company');
  });

  it('2. Extracts pure Bengali business card correctly', () => {
    const raw = `
      মোহাম্মদ রফিকুল ইসলাম
      ব্যবস্থাপনা পরিচালক
      মেঘনা ট্রেডিং কর্পোরেশন
      মোবাইল: ০১৮১১২২৩৩৪৪
      ইমেইল: rafiq@meghnatrading.com
      বাড়ি # ১২, সড়ক # ৫, ধানমন্ডি, ঢাকা
    `;
    const res = parseCardText(raw);
    expect(res.name).toBe('মোহাম্মদ রফিকুল ইসলাম');
    expect(res.designation).toBe('ব্যবস্থাপনা পরিচালক');
    expect(res.company).toBe('মেঘনা ট্রেডিং কর্পোরেশন');
    expect(res.phones).toContain('+8801811223344');
    expect(res.emails).toContain('rafiq@meghnatrading.com');
    expect(res.address).toContain('ধানমন্ডি, ঢাকা');
  });

  it('3. Fixes OCR character confusion inside phone numbers (O->0, l/I->1, S->5)', () => {
    const fixed1 = fixPhoneOcrConfusions('+88O17l2345678');
    expect(fixed1).toBe('+8801712345678');

    const fixed2 = fixPhoneOcrConfusions('Ol8l234S678');
    expect(fixed2).toBe('01812345678');
  });

  it('4. Converts Bengali digits to ASCII numerals', () => {
    const bengali = '০১৭০১২৩৪৫৬৭';
    expect(convertBengaliDigitsToAscii(bengali)).toBe('01701234567');
  });

  it('5. Extracts landline numbers and multiple phone numbers', () => {
    const raw = `
      Dr. Farhana Yasmin
      Consultant
      Square Hospital Ltd.
      Tel: 02-8144400, Mob: 01711000000
      Email: info@squarehospital.com
      18/F Bir Uttam Qazi Nuruzzaman Sarak, West Panthapath, Dhaka
    `;
    const res = parseCardText(raw);
    expect(res.name).toBe('Dr. Farhana Yasmin');
    expect(res.company).toBe('Square Hospital Ltd.');
    expect(res.phones.length).toBeGreaterThanOrEqual(2);
    expect(res.phones).toContain('+8801711000000');
    expect(res.phones).toContain('02-8144400');
  });

  it('6. Handles IT startup card with CEO & Founder and modern TLD website', () => {
    const raw = `
      Zubair Hasan
      CEO & Founder
      Nexus Digital Solutions
      +8801999888777
      zubair@nexusdigital.xyz
      nexusdigital.xyz
      Level 4, Plot 7, Sector 3, Uttara, Dhaka
    `;
    const res = parseCardText(raw);
    expect(res.name).toBe('Zubair Hasan');
    expect(res.designation).toContain('CEO');
    expect(res.company).toBe('Nexus Digital Solutions');
    expect(res.emails).toContain('zubair@nexusdigital.xyz');
    expect(res.websites).toContain('https://nexusdigital.xyz');
    expect(res.address).toContain('Uttara, Dhaka');
  });

  it('7. Handles engineering firm with Engineer designation in Chattogram', () => {
    const raw = `
      Engr. Kamal Uddin
      Chief Technology Officer
      Bengal Engineering & Co
      Mobile: 01678123456
      kamal@bengaleng.com
      Agrabad C/A, Chattogram
    `;
    const res = parseCardText(raw);
    expect(res.name).toBe('Engr. Kamal Uddin');
    expect(res.designation).toBe('Chief Technology Officer');
    expect(res.company).toBe('Bengal Engineering & Co');
    expect(res.phones).toContain('+8801678123456');
    expect(res.address).toContain('Chattogram');
  });

  it('8. Correctly parses vCard standard QR string', () => {
    const qrVCard = `BEGIN:VCARD
VERSION:3.0
FN:Shahriar Khan
TITLE:Head of Operations
ORG:Prime Logistics Group;
TEL:+8801711223344
EMAIL:skhan@primelogistics.com
URL:https://primelogistics.com
ADR:;;House 10, Road 4;Gulshan-1;Dhaka;;Bangladesh
NOTE:VIP Client
END:VCARD`;

    const parsed = parseVCard(qrVCard);
    expect(parsed).not.toBeNull();
    expect(parsed.name).toBe('Shahriar Khan');
    expect(parsed.designation).toBe('Head of Operations');
    expect(parsed.company).toBe('Prime Logistics Group');
    expect(parsed.phones).toContain('+8801711223344');
    expect(parsed.emails).toContain('skhan@primelogistics.com');
    expect(parsed.websites).toContain('https://primelogistics.com');
    expect(parsed.uncertain_fields.length).toBe(0); // High confidence
  });

  it('9. Correctly parses MECARD format QR string', () => {
    const meCard = 'MECARD:N:Mahmud,Rahim;ORG:Delta Pharma;TEL:01300112233;EMAIL:rahim@deltapharma.com;URL:www.deltapharma.com;ADR:Tejgaon I/A, Dhaka;;';
    const parsed = parseVCard(meCard);
    expect(parsed).not.toBeNull();
    expect(parsed.name).toBe('Mahmud Rahim');
    expect(parsed.company).toBe('Delta Pharma');
    expect(parsed.phones).toContain('01300112233');
    expect(parsed.emails).toContain('rahim@deltapharma.com');
    expect(parsed.websites).toContain('https://www.deltapharma.com');
  });

  it('10. Handles noisy cards with missing fields gracefully without throwing errors', () => {
    const raw = `
      Some Unstructured Text
      Random Line With No Clues
      Hotline: 01800-000000
    `;
    const res = parseCardText(raw);
    expect(res.name).toBeTruthy();
    expect(res.phones.length).toBeGreaterThan(0);
    expect(res.emails).toEqual([]);
    expect(res.uncertain_fields).toContain('name');
  });

  it('11. Handles null, empty or invalid string inputs safely', () => {
    const resNull = parseCardText(null);
    expect(resNull.name).toBeNull();
    expect(resNull.phones).toEqual([]);
    expect(resNull.uncertain_fields).toBeDefined();

    const resEmpty = parseCardText('');
    expect(resEmpty.name).toBeNull();
  });

  it('12. Extracts spaced Bangladeshi mobile numbers with slash delimiters', () => {
    const raw = `
      Mob: 017 11 223344 / 018 11 556677
      Email: test@domain.com
    `;
    const phones = extractPhones(raw);
    expect(phones).toContain('+8801711223344');
    expect(phones).toContain('+8801811556677');
  });

  it('13. Correctly rejects top-line slogans and certifications from being mistaken as Name', () => {
    const raw = `
      ISO 9001:2015 Certified
      Quality First Always
      Tariqul Islam
      General Manager
      Akij Logistics Ltd.
      01700112233
    `;
    const res = parseCardText(raw);
    expect(res.name).toBe('Tariqul Islam');
    expect(res.designation).toBe('General Manager');
    expect(res.company).toBe('Akij Logistics Ltd.');
  });

  it('14. Cleans trailing degrees/certifications from person name', () => {
    const raw = `
      Engr. Mahmudur Rahman, PMP
      Executive Director
      Ha-Meem Apparels Ltd.
      01812345678
      Tejgaon I/A, Dhaka
    `;
    const res = parseCardText(raw);
    expect(res.name).toBe('Engr. Mahmudur Rahman');
    expect(res.company).toBe('Ha-Meem Apparels Ltd.');
    expect(res.address).toContain('Tejgaon');
  });

  it('15. Extracts complex two-column card (Provise Limited) with multi-line name and company', () => {
    const raw = `
      PROVISE
      LIMITED
      Excellence in Garments
      Md. Abul
      Kashem Akash
      Manager
      Mobile: 01712874232
      Mail: makakash.hi@gmail.com
      Address: Sharifpur Rd,
      Gazipur 1704
    `;
    const res = parseCardText(raw);
    expect(res.name).toBe('Md. Abul Kashem Akash');
    expect(res.designation).toBe('Manager');
    expect(res.company).toBe('PROVISE LIMITED');
    expect(res.phones).toContain('+8801712874232');
    expect(res.emails).toContain('makakash.hi@gmail.com');
    expect(res.websites).toEqual([]); // gmail.com must not be extracted as website
    expect(res.address).toBe('Sharifpur Rd, Gazipur 1704');
    expect(res.notes).toContain('Excellence in Garments');
  });

  it('16. Differentiates Md. name prefix from standalone MD (Managing Director) acronym', () => {
    const card1 = `
      Md. Shahidul Islam
      Senior Executive
      Beximco Pharma
      01711223344
    `;
    const res1 = parseCardText(card1);
    expect(res1.name).toBe('Md. Shahidul Islam');
    expect(res1.designation).toBe('Senior Executive');

    const card2 = `
      Farhan Chowdhury
      MD
      Summit Power
      01811223344
    `;
    const res2 = parseCardText(card2);
    expect(res2.name).toBe('Farhan Chowdhury');
    expect(res2.designation).toBe('MD');
  });

  it('17. Spatially reconstructs multi-column words into proper isolated lines without horizontal cross-column merging', () => {
    // Simulated word bounding boxes from a 2-column business card (Provise layout)
    const mockWords = [
      // Left Column (Company)
      { text: 'P', bbox: { x0: 90, y0: 290, x1: 130, y1: 340 }, confidence: 92 },
      { text: 'ROVI', bbox: { x0: 138, y0: 290, x1: 290, y1: 340 }, confidence: 92 },
      { text: 'S', bbox: { x0: 297, y0: 290, x1: 333, y1: 340 }, confidence: 90 },
      { text: 'E', bbox: { x0: 340, y0: 290, x1: 374, y1: 340 }, confidence: 92 },
      { text: 'LIMITED', bbox: { x0: 110, y0: 350, x1: 350, y1: 380 }, confidence: 96 },
      // Noise artifact in logo (should be filtered out)
      { text: 'AS', bbox: { x0: 170, y0: 110, x1: 280, y1: 170 }, confidence: 55 },
      // Right Column (Person & Contacts)
      { text: 'Md.', bbox: { x0: 460, y0: 100, x1: 550, y1: 145 }, confidence: 96 },
      { text: 'Abul', bbox: { x0: 560, y0: 100, x1: 670, y1: 145 }, confidence: 96 },
      { text: 'Kashem', bbox: { x0: 460, y0: 155, x1: 650, y1: 195 }, confidence: 91 },
      { text: 'Akash', bbox: { x0: 660, y0: 155, x1: 800, y1: 195 }, confidence: 96 },
      { text: 'Manager', bbox: { x0: 460, y0: 210, x1: 580, y1: 240 }, confidence: 96 },
      { text: 'Mobile:', bbox: { x0: 510, y0: 288, x1: 590, y1: 310 }, confidence: 92 },
      { text: '01712874232', bbox: { x0: 600, y0: 288, x1: 760, y1: 310 }, confidence: 92 },
      { text: 'Mail:', bbox: { x0: 510, y0: 335, x1: 560, y1: 355 }, confidence: 88 },
      { text: 'makakash.hi@gmail.com', bbox: { x0: 570, y0: 335, x1: 840, y1: 355 }, confidence: 92 }
    ];

    const lines = reconstructLayoutLines(mockWords);
    const lineTexts = lines.map(l => l.text);

    // Left column words are merged into 'PROVISE' without internal spaces due to kerning logic
    expect(lineTexts).toContain('PROVISE');
    expect(lineTexts).toContain('LIMITED');
    // Logo drawing artifact is filtered out
    expect(lineTexts).not.toContain('AS');
    // Right column lines are separated properly
    expect(lineTexts).toContain('Md. Abul');
    expect(lineTexts).toContain('Kashem Akash');
    expect(lineTexts).toContain('Manager');
    expect(lineTexts).toContain('Mobile: 01712874232');
    expect(lineTexts).toContain('Mail: makakash.hi@gmail.com');
    // Ensure horizontal lines did NOT merge across columns!
    expect(lineTexts.some(t => t.includes('PROVISE') && t.includes('Mail'))).toBe(false);
  });

  it('18. Automatically fixes OCR character and word confusions via Knowledge Pack', () => {
    const raw = `
      Nafis Fuad
      Genera1 Manager
      Apex Techno1ogy Ltd.
      01711223344
    `;
    const res = parseCardText(raw);
    expect(res.name).toBe('Nafis Fuad');
    // 'Genera1' with digit 1 is corrected to 'General Manager'
    expect(res.designation).toBe('General Manager');
    // 'Techno1ogy' with digit 1 is corrected to 'Apex Technology Ltd.'
    expect(res.company).toBe('Apex Technology Ltd.');
  });

  it('19. High-precision Fuse.js fuzzy matching repairs misrecognized company names', () => {
    const raw = `
      Arafat Hossain
      Chief Technology Officer
      Square Pharmaceutical Ltd
      01811223344
    `;
    const res = parseCardText(raw);
    expect(res.name).toBe('Arafat Hossain');
    // 'Square Pharmaceutical Ltd' is auto-corrected to known 'Square Pharmaceuticals Ltd.'
    expect(res.company).toBe('Square Pharmaceuticals Ltd.');
  });

  it('20. Learning loop records user corrections and enhances subsequent offline extractions', async () => {
    // 1. User reviews a card where OCR saw 'M4nager' and corrected it to 'Manager'
    const learnedTypo = await recordLearnedCorrection({
      field: 'designation',
      originalValue: 'M4nager',
      correctedValue: 'Manager'
    });
    expect(learnedTypo).toBe(true);

    // 2. User adds a completely new custom designation 'Blockchain Evangelist'
    const learnedCustom = await recordLearnedCorrection({
      field: 'designation',
      originalValue: 'Unclassified Line',
      correctedValue: 'Blockchain Evangelist'
    });
    expect(learnedCustom).toBe(true);

    // 3. Next card with 'Blockchain Evangelist' is now successfully classified as designation!
    const nextCard = `
      Sabbir Rahman
      Blockchain Evangelist
      CryptoTech Labs
      01911223344
    `;
    const res = parseCardText(nextCard);
    expect(res.name).toBe('Sabbir Rahman');
    expect(res.designation).toBe('Blockchain Evangelist');
  });
});

