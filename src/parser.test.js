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
});
