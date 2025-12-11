-- Міграція для додавання функціоналу створення аукціонів користувачами
-- Виконати ці команди в MySQL

-- 1. Додати нові поля до таблиці auctions
ALTER TABLE auctions 
ADD COLUMN IF NOT EXISTS creator_id INT NULL AFTER admin_id,
ADD COLUMN IF NOT EXISTS approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved' AFTER listing_id,
ADD COLUMN IF NOT EXISTS approval_note TEXT NULL AFTER approval_status;

-- 2. Додати індекси
ALTER TABLE auctions ADD INDEX IF NOT EXISTS idx_auctions_creator (creator_id);
ALTER TABLE auctions ADD INDEX IF NOT EXISTS idx_auctions_approval (approval_status);

-- 3. Оновити існуючі аукціони: встановити creator_id = admin_id де можливо
UPDATE auctions SET creator_id = admin_id WHERE creator_id IS NULL AND admin_id IS NOT NULL;

-- 4. Встановити approval_status = 'approved' для всіх існуючих аукціонів
UPDATE auctions SET approval_status = 'approved' WHERE approval_status IS NULL OR approval_status = '';

-- Перевірка результатів
SELECT id, product, admin_id, creator_id, approval_status FROM auctions LIMIT 10;
