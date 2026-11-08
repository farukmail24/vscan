import mysql from 'mysql2/promise';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

export const DB_CONFIG = {
  host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.DB_PORT || '4000', 10),
  user: process.env.DB_USER || '5PNhhcR1jqyzySz.root',
  password: process.env.DB_PASSWORD || 'y8RMflfEE7BWhv5R',
  database: process.env.DB_NAME || 'test',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  }
};

export const pool = mysql.createPool(DB_CONFIG);

export async function testConnection() {
  const startTime = Date.now();
  const [rows] = await pool.query('SELECT 1 AS ok, VERSION() AS version, DATABASE() as db_name;');
  const latencyMs = Date.now() - startTime;
  return {
    ok: true,
    latencyMs,
    version: rows[0].version,
    database: rows[0].db_name,
    host: DB_CONFIG.host,
    port: DB_CONFIG.port
  };
}
