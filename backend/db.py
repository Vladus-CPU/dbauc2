from mysql.connector import Error, connect
from typing import Optional, List, Tuple
from decimal import Decimal
import datetime
from .config import DB_CONFIG
from .errors import DBError

def create_database_if_not_exists():
    try:
        connection = connect(**DB_CONFIG)
        connection.close()
        return True
    except Error as e:
        if "Unknown database" in str(e):
            try:
                base_config = {k: v for k, v in DB_CONFIG.items() if k != "database"}
                base_conn = connect(**base_config)
                cur = base_conn.cursor()
                cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_CONFIG['database']}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                base_conn.commit()
                print(f"База даних '{DB_CONFIG['database']}' успішно створена")
                cur.close()
                base_conn.close()
                return True
            except Error as create_error:
                print(f"Помилка при створенні бази даних: {create_error}")
                raise DBError("Не вдалося створити базу даних", details=str(create_error)) from create_error
        else:
            print(f"Помилка підключення до MySQL: {e}")
            raise DBError("Не вдалося підключитися до бази даних", details=str(e)) from e

def db_connection():
    try:
        connection = connect(**DB_CONFIG)
        return connection
    except Error as e:
        if "Unknown database" in str(e):
            create_database_if_not_exists()
            try:
                connection = connect(**DB_CONFIG)
                return connection
            except Error as retry_error:
                raise DBError("Не вдалося підключитися до бази даних після створення", details=str(retry_error)) from retry_error
        raise DBError("Не вдалося підключитися до бази даних", details=str(e)) from e

def ensure_users_table(connection):
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL UNIQUE,
                email VARCHAR(191) NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                is_admin BOOLEAN NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        connection.commit()
    finally:
        cursor.close()

def ensure_user_profiles(connection):
    cur = connection.cursor()
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS traders_profile (
                user_id INT PRIMARY KEY,
                first_name VARCHAR(100) NULL,
                last_name VARCHAR(100) NULL,
                city VARCHAR(128) NULL,
                region VARCHAR(128) NULL,
                country VARCHAR(128) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS admins_profile (
                user_id INT PRIMARY KEY,
                first_name VARCHAR(100) NULL,
                last_name VARCHAR(100) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        for column_def in [
            ("city", "VARCHAR(128) NULL"),
            ("region", "VARCHAR(128) NULL"),
            ("country", "VARCHAR(128) NULL"),
            ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        ]:
            try:
                cur.execute(f"ALTER TABLE traders_profile ADD COLUMN {column_def[0]} {column_def[1]}")
            except Exception:
                pass
        try:
            cur.execute("ALTER TABLE admins_profile ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
        except Exception:
            pass
        connection.commit()
    finally:
        cur.close()

def try_add_owner_columns(connection):
    cur = connection.cursor()
    try:
        try:
            cur.execute("ALTER TABLE listings ADD COLUMN owner_id INT NULL")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id)")
        except Exception:
            pass
        try:
            cur.execute("ALTER TABLE orders ADD COLUMN creator_id INT NULL")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_creator ON orders(creator_id)")
        except Exception:
            pass
        connection.commit()
    finally:
        cur.close()

def ensure_listings_table(connection):
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
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
            """
        )
        for column_def in [
            ("status", "ENUM('draft','published','archived') NOT NULL DEFAULT 'draft'"),
            ("base_quantity", "DECIMAL(12,2) NULL"),
            ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
            ("idx_listings_status", "INDEX idx_listings_status (status)"),
            ("idx_listings_created", "INDEX idx_listings_created (created_at)")
        ]:
            try:
                if column_def[0].startswith('idx_'):
                    cursor.execute(f"ALTER TABLE listings ADD {column_def[1]}")
                else:
                    cursor.execute(f"ALTER TABLE listings ADD COLUMN {column_def[0]} {column_def[1]}")
            except Exception:
                pass
        connection.commit()
    finally:
        cursor.close()

def ensure_orders_table(connection):
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
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
            """
        )
        connection.commit()
    finally:
        cursor.close()

def ensure_trades_table(connection):
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
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
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        connection.commit()
    finally:
        cursor.close()

def ensure_auctions_tables(connection):
    cur = connection.cursor()
    try:
        cur.execute(
            """
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
                clearing_price DECIMAL(18,6) NULL,
                clearing_quantity DECIMAL(18,6) NULL,
                clearing_demand DECIMAL(18,6) NULL,
                clearing_supply DECIMAL(18,6) NULL,
                clearing_price_low DECIMAL(18,6) NULL,
                clearing_price_high DECIMAL(18,6) NULL,
                INDEX idx_auctions_status (status),
                INDEX idx_auctions_created (created_at)
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        for column_name, column_def in [
            ("listing_id", "INT NULL"),
            ("clearing_price", "DECIMAL(18,6) NULL"),
            ("clearing_quantity", "DECIMAL(18,6) NULL"),
            ("clearing_demand", "DECIMAL(18,6) NULL"),
            ("clearing_supply", "DECIMAL(18,6) NULL"),
            ("clearing_price_low", "DECIMAL(18,6) NULL"),
            ("clearing_price_high", "DECIMAL(18,6) NULL"),
        ]:
            try:
                cur.execute(f"ALTER TABLE auctions ADD COLUMN {column_name} {column_def}")
            except Exception:
                pass
        try:
            cur.execute("ALTER TABLE auctions ADD INDEX idx_auctions_listing (listing_id)")
        except Exception:
            pass
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS trader_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                trader_id INT NOT NULL,
                account_number VARCHAR(128) NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_accounts_trader (trader_id)
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        cur.execute(
            """
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
                INDEX idx_participants_trader (trader_id),
                FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        cur.execute(
            """
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
                INDEX idx_ao_auction_status (auction_id, status),
                FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        for column_def in [
            ("iteration", "INT NULL"),
            ("reserved_amount", "DECIMAL(18,6) NULL"),
            ("reserve_tx_id", "INT NULL"),
        ]:
            try:
                cur.execute(f"ALTER TABLE auction_orders ADD COLUMN {column_def[0]} {column_def[1]}")
            except Exception:
                pass
        for index_def in [
            "ALTER TABLE auction_orders ADD INDEX idx_ao_auction (auction_id)",
            "ALTER TABLE auction_orders ADD INDEX idx_ao_auction_status (auction_id, status)",
        ]:
            try:
                cur.execute(index_def)
            except Exception:
                pass
        connection.commit()
    finally:
        cur.close()

def ensure_trader_inventory(connection):
    cur = connection.cursor()
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS trader_inventory (
                trader_id INT NOT NULL,
                product VARCHAR(191) NOT NULL,
                quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (trader_id, product),
                FOREIGN KEY (trader_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        connection.commit()
    finally:
        cur.close()

def ensure_resource_transactions(connection):
    cur = connection.cursor()
    try:
        cur.execute(
            """
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
            """
        )
        connection.commit()
    finally:
        cur.close()

def ensure_resource_documents(connection):
    cur = connection.cursor()
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS resource_documents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                trader_id INT NOT NULL,
                filename VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT NULL,
                FOREIGN KEY (trader_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_resource_docs_trader (trader_id)
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        connection.commit()
    finally:
        cur.close()

def ensure_wallet_tables(connection):
    cur = connection.cursor()
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS wallet_accounts (
                user_id INT PRIMARY KEY,
                available DECIMAL(18,6) NOT NULL DEFAULT 0,
                reserved DECIMAL(18,6) NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type ENUM('deposit','withdraw','reserve','release','spend','refund') NOT NULL,
                amount DECIMAL(18,6) NOT NULL,
                balance_after DECIMAL(18,6) NOT NULL,
                meta TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_wallet_user (user_id),
                INDEX idx_wallet_created (created_at)
            ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
            """
        )
        connection.commit()
    finally:
        cur.close()

def init_all_tables():
    try:
        create_database_if_not_exists()
        conn = db_connection()
        ensure_users_table(conn)
        ensure_user_profiles(conn)
        ensure_listings_table(conn)
        ensure_orders_table(conn)
        ensure_trades_table(conn)
        ensure_auctions_tables(conn)
        ensure_trader_inventory(conn)
        ensure_resource_transactions(conn)
        ensure_resource_documents(conn)
        ensure_wallet_tables(conn)
        try_add_owner_columns(conn)
        conn.close()
        print("Всі таблиці успішно створено/перевірено!")
        return True
    except DBError as e:
        print(f"Помилка при ініціалізації таблиць: {e}")
        return False
    except Exception as e:
        return False

__all__ = [
    'db_connection',
    'create_database_if_not_exists',
    'ensure_users_table',
    'ensure_user_profiles',
    'ensure_listings_table',
    'ensure_orders_table',
    'ensure_trades_table',
    'ensure_auctions_tables',
    'ensure_trader_inventory',
    'ensure_resource_transactions',
    'ensure_resource_documents',
    'ensure_wallet_tables',
    'try_add_owner_columns',
    'init_all_tables',
]
