-- Таблиця раундів клірингу - історія всіх раундів для кожного аукціону
-- round_number: порядковий номер раунду (1, 2, 3...)
-- clearing_price: ціна, встановлена під час клірингу цього раунду
-- clearing_volume: обсяг торгів виконаних в цьому раунді
-- total_bids: загальна кількість заявок на купівлю
-- total_asks: загальна кількість заявок на продаж
-- matched_orders: кількість заявок, які були зведені та виконані
CREATE TABLE IF NOT EXISTS auction_clearing_rounds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  auction_id INT NOT NULL,
  round_number INT NOT NULL,
  clearing_price DECIMAL(18,6) NULL,
  clearing_volume DECIMAL(18,6) NULL,
  clearing_demand DECIMAL(18,6) NULL,
  clearing_supply DECIMAL(18,6) NULL,
  total_bids INT NOT NULL DEFAULT 0,
  total_asks INT NOT NULL DEFAULT 0,
  matched_orders INT NOT NULL DEFAULT 0,
  cleared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rounds_auction (auction_id),
  INDEX idx_rounds_number (auction_id, round_number)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
