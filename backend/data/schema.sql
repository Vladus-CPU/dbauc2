CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(255) NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_username (username),
  INDEX idx_users_email (email)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS traders_profile (
  user_id INT PRIMARY KEY,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  city VARCHAR(128) NULL,
  region VARCHAR(128) NULL,
  country VARCHAR(128) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admins_profile (
  user_id INT PRIMARY KEY,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS listings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  starting_bid DECIMAL(12,2) NOT NULL,
  current_bid DECIMAL(12,2) NULL,
  unit VARCHAR(64) NOT NULL,
  image VARCHAR(512) NULL,
  owner_id INT NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  base_quantity DECIMAL(12,2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_listings_owner (owner_id),
  INDEX idx_listings_status (status),
  INDEX idx_listings_created (created_at)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('buy','sell') NOT NULL,
  cost DECIMAL(12,2) NOT NULL,
  amount DECIMAL(12,4) NOT NULL,
  remaining_amount DECIMAL(12,4) NOT NULL,
  status ENUM('open','partial','filled','canceled') NOT NULL DEFAULT 'open',
  creator_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orders_type_cost (type, cost),
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  buy_order_id INT NOT NULL,
  sell_order_id INT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  amount DECIMAL(12,4) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trades_created (created_at)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auctions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product VARCHAR(255) NOT NULL,
  type ENUM('open','closed') NOT NULL DEFAULT 'open',
  k_value DECIMAL(5,4) NOT NULL DEFAULT 0.5000,
  window_start DATETIME NULL,
  window_end DATETIME NULL,
  status ENUM('collecting','cleared','closed') NOT NULL DEFAULT 'collecting',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  admin_id INT NULL,
  listing_id INT NULL,
  INDEX idx_auctions_status (status),
  INDEX idx_auctions_created (created_at),
  INDEX idx_auctions_listing (listing_id)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trader_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trader_id INT NOT NULL,
  account_number VARCHAR(128) NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_accounts_trader (trader_id)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auction_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  auction_id INT NOT NULL,
  trader_id INT NOT NULL,
  account_id INT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reserved_funds DECIMAL(18,2) DEFAULT 0,
  UNIQUE KEY uniq_auction_trader (auction_id, trader_id),
  INDEX idx_participants_auction (auction_id),
  INDEX idx_participants_trader (trader_id)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auction_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  auction_id INT NOT NULL,
  trader_id INT NOT NULL,
  side ENUM('bid','ask') NOT NULL,
  price DECIMAL(18,6) NOT NULL,
  quantity DECIMAL(18,6) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('open','cleared','rejected') NOT NULL DEFAULT 'open',
  cleared_price DECIMAL(18,6) NULL,
  cleared_quantity DECIMAL(18,6) NULL,
  iteration INT NULL,
  reserved_amount DECIMAL(18,6) NULL,
  reserve_tx_id INT NULL,
  INDEX idx_ao_auction (auction_id),
  INDEX idx_ao_auction_status (auction_id, status)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trader_inventory (
  trader_id INT NOT NULL,
  product VARCHAR(255) NOT NULL,
  quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (trader_id, product)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resource_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trader_id INT NOT NULL,
  type ENUM('deposit','withdraw','inventory_add','inventory_remove') NOT NULL,
  quantity DECIMAL(18,6) NOT NULL,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  INDEX idx_res_trader (trader_id),
  INDEX idx_res_type (type)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resource_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trader_id INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  INDEX idx_resource_docs_trader (trader_id)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wallet_accounts (
  user_id INT PRIMARY KEY,
  available DECIMAL(18,6) NOT NULL DEFAULT 0,
  reserved DECIMAL(18,6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('deposit','withdraw','reserve','release','spend','refund') NOT NULL,
  amount DECIMAL(18,6) NOT NULL,
  balance_after DECIMAL(18,6) NOT NULL,
  meta TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wallet_user (user_id),
  INDEX idx_wallet_created (created_at)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
