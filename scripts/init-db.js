import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.DB_PORT || '4000', 10),
  user: process.env.DB_USER || '5PNhhcR1jqyzySz.root',
  password: process.env.DB_PASSWORD || 'y8RMflfEE7BWhv5R',
  database: process.env.DB_NAME || 'test',
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  }
};

async function initDatabase() {
  console.log(`Connecting to TiDB at ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}...`);
  const conn = await mysql.createConnection(DB_CONFIG);

  console.log('Connected! Creating tables if they do not exist...');

  // 1. Cards Table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS cards (
      id VARCHAR(64) PRIMARY KEY,
      timestamp VARCHAR(64) NULL,
      name VARCHAR(255) NULL,
      designation VARCHAR(255) NULL,
      company VARCHAR(255) NULL,
      phone1 VARCHAR(50) NULL,
      phone2 VARCHAR(50) NULL,
      email VARCHAR(255) NULL,
      website VARCHAR(255) NULL,
      address TEXT NULL,
      notes TEXT NULL,
      tags VARCHAR(500) NULL,
      front_image LONGTEXT NULL,
      back_image LONGTEXT NULL,
      source VARCHAR(50) DEFAULT 'AI',
      needs_review TINYINT(1) DEFAULT 0,
      scanned_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cards_name (name),
      INDEX idx_cards_company (company),
      INDEX idx_cards_email (email),
      INDEX idx_cards_phone1 (phone1)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('Table "cards" ready.');

  // 2. Knowledge Rules Table (Replaces Sheet tab "Rules")
  await conn.query(`
    CREATE TABLE IF NOT EXISTS knowledge_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      value VARCHAR(255) NOT NULL,
      extra VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_rule_type_val (type, value)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('Table "knowledge_rules" ready.');

  // 3. App Settings Table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      setting_value TEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('Table "app_settings" ready.');

  // Verify tables
  const [tables] = await conn.query('SHOW TABLES;');
  console.log('All tables in TiDB database:');
  for (const row of tables) {
    console.log(` - ${Object.values(row)[0]}`);
  }

  await conn.end();
  console.log('TiDB initialization completed successfully!');
}

initDatabase().catch((err) => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
