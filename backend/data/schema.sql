CREATE TABLE IF NOT EXISTS listings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  starting_bid DECIMAL(12,2) NOT NULL,
  current_bid DECIMAL(12,2) NULL,
  unit VARCHAR(64) NOT NULL,
  image VARCHAR(512) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_listings_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('buy','sell') NOT NULL,
  cost DECIMAL(12,2) NOT NULL,
  amount DECIMAL(12,4) NOT NULL,
  remaining_amount DECIMAL(12,4) NOT NULL,
  status ENUM('open','partial','filled','canceled') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orders_type_cost (type, cost),
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  buy_order_id INT NOT NULL,
  sell_order_id INT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  amount DECIMAL(12,4) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buy_order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (sell_order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_trades_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
