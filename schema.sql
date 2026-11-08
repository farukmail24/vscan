-- ========================================================
-- TiDB Cloud Schema for Business Card Scanner (VScan)
-- Database: test
-- Host: gateway01.ap-southeast-1.prod.aws.tidbcloud.com
-- ========================================================

USE test;

-- 1. Cards Table (Stores scanned business cards and images)
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

-- 2. Knowledge Rules Table (Replaces Sheet tab "Rules" for dynamic learning)
CREATE TABLE IF NOT EXISTS knowledge_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  value VARCHAR(255) NOT NULL,
  extra VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rule_type_val (type, value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. App Settings Table (Stores persistent configurations such as Gemini API keys)
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
