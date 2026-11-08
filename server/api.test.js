import { describe, it, expect, afterAll } from 'vitest';
import { handleApiRequest } from './apiHandler.js';
import { pool } from './db.js';

describe('TiDB Cloud Backend API Suite', () => {
  const testId = 'test_unit_' + Date.now();

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM cards WHERE id LIKE ?', ['test_unit_%']);
      await pool.end();
    } catch (_) {}
  });

  it('verifies ping action against TiDB cluster', async () => {
    const res = await handleApiRequest('ping');
    expect(res.ok).toBe(true);
    expect(res.database).toBe('test');
    expect(typeof res.latencyMs).toBe('number');
    expect(res.host).toContain('tidbcloud.com');
  });

  it('saves a new business card record idempotently to TiDB cards table', async () => {
    const res = await handleApiRequest('save', {
      record: {
        id: testId,
        timestamp: new Date().toISOString(),
        name: 'Rahim Chowdhury',
        designation: 'Managing Director',
        company: 'Dhaka Tech Solutions Ltd.',
        phones: ['+8801711000000', '02-9876543'],
        emails: ['rahim@dhakatech.com.bd'],
        websites: ['https://dhakatech.com.bd'],
        address: 'House 12, Road 5, Dhanmondi, Dhaka',
        notes: 'Software & IT Consulting',
        tags: ['VIP', 'IT'],
        source: 'AI',
        needsReview: false,
        scannedBy: 'Tester'
      }
    });

    expect(res.ok).toBe(true);
    expect(res.id).toBe(testId);
  });

  it('detects duplicate contacts by email or phone', async () => {
    const res = await handleApiRequest('checkDuplicate', {
      emails: ['rahim@dhakatech.com.bd'],
      phones: ['01711000000']
    });

    expect(res.ok).toBe(true);
    expect(res.duplicates.length).toBeGreaterThan(0);
    expect(res.duplicates[0].id).toBe(testId);
    expect(res.duplicates[0].company).toBe('Dhaka Tech Solutions Ltd.');
  });

  it('updates an existing card record in TiDB', async () => {
    const res = await handleApiRequest('update', {
      id: testId,
      record: {
        designation: 'Chief Executive Officer',
        company: 'Dhaka Tech Solutions Group'
      }
    });

    expect(res.ok).toBe(true);
    expect(res.updated).toBe(true);
  });

  it('lists cards including the saved card', async () => {
    const res = await handleApiRequest('listCards', { search: 'Rahim' });
    expect(res.ok).toBe(true);
    expect(res.cards.length).toBeGreaterThan(0);
    const found = res.cards.find(c => c.id === testId);
    expect(found).toBeDefined();
    expect(found.record.designation).toBe('Chief Executive Officer');
  });

  it('retrieves knowledge rules from TiDB', async () => {
    const res = await handleApiRequest('getKnowledge');
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.rules)).toBe(true);
  });

  it('updates and saves Gemini keys in TiDB app_settings', async () => {
    const key1 = process.env.GEMINI_API_KEY_1 || 'test_key_1';
    const key2 = process.env.GEMINI_API_KEY_2 || 'test_key_2';
    const res = await handleApiRequest('updateGeminiKeys', {
      keys: [key1, key2]
    });
    expect(res.ok).toBe(true);
    expect(res.count).toBe(2);
  });

  it('tests Gemini keys and returns health status per key', async () => {
    const key = process.env.GEMINI_API_KEY_1;
    if (!key) return;
    const res = await handleApiRequest('testGeminiKeys', {
      geminiApiKeys: [key]
    });
    expect(res.ok).toBe(true);
    expect(res.results.length).toBe(1);
    expect(res.results[0].valid).toBe(true);
  });

  it('performs extraction and automatically switches keys if first key fails', async () => {
    const key = process.env.GEMINI_API_KEY_1;
    if (!key) return;
    // Key 1 is intentionally invalid to trigger immediate failover to Key 2
    const res = await handleApiRequest('extract', {
      geminiApiKeys: [
        'INVALID_MOCK_KEY_FORCING_FAILOVER',
        key
      ]
    });

    expect(res.ok).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.usedKeyIndex).toBe(1); // Successfully failed over to 2nd key!
    expect(res.keySwitched).toBe(true);
  }, 25000);

  it('deletes the test card cleanly', async () => {
    const res = await handleApiRequest('deleteCard', { id: testId });
    expect(res.ok).toBe(true);
    expect(res.deleted).toBe(true);
  });
});
