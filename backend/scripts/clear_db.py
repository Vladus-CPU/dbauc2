"""
Utility to clear the MySQL database used by this project.

Modes:
- truncate (default): TRUNCATE TABLE for all tables.
- drop: DROP TABLE for all tables; optionally re-create schema.

Usage examples (PowerShell):
  # Just remove all data but keep tables
  py -3 backend/scripts/clear_db.py --mode truncate --yes

  # Drop all tables and recreate schema
  py -3 backend/scripts/clear_db.py --mode drop --recreate --yes

Notes:
- Uses DB settings from backend.config.DB_CONFIG
- Requires mysql-connector-python
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import List


def _add_repo_root_to_syspath() -> None:
    this_file = os.path.abspath(__file__)
    backend_dir = os.path.dirname(os.path.dirname(this_file))  # backend/
    repo_root = os.path.dirname(backend_dir)
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)


_add_repo_root_to_syspath()

# Import after sys.path tweak
try:
    from backend.db import db_connection
except Exception as e:  # pragma: no cover
    print("Failed to import backend.db; ensure you're running from repo root.")
    raise


def get_all_tables(conn) -> List[str]:
    cur = conn.cursor()
    try:
        cur.execute("SELECT DATABASE()")
        db_name = cur.fetchone()[0]
        cur.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema=%s",
            (db_name,),
        )
        return [row[0] for row in cur.fetchall()]
    finally:
        cur.close()


def set_fk_checks(conn, enabled: bool) -> None:
    cur = conn.cursor()
    try:
        cur.execute(f"SET FOREIGN_KEY_CHECKS={(1 if enabled else 0)}")
    finally:
        cur.close()


def truncate_all(conn) -> None:
    tables = get_all_tables(conn)
    if not tables:
        print("No tables found. Nothing to truncate.")
        return
    print(f"Truncating {len(tables)} tables…")
    set_fk_checks(conn, False)
    cur = conn.cursor()
    try:
        for t in tables:
            cur.execute(f"TRUNCATE TABLE `{t}`")
            print(f" - TRUNCATE `{t}`")
        conn.commit()
    finally:
        cur.close()
        set_fk_checks(conn, True)


def drop_all(conn) -> None:
    tables = get_all_tables(conn)
    if not tables:
        print("No tables found. Nothing to drop.")
        return
    print(f"Dropping {len(tables)} tables…")
    set_fk_checks(conn, False)
    cur = conn.cursor()
    try:
        for t in tables:
            cur.execute(f"DROP TABLE IF EXISTS `{t}`")
            print(f" - DROP `{t}`")
        conn.commit()
    finally:
        cur.close()
        set_fk_checks(conn, True)


def recreate_schema_via_ensure(conn) -> None:
    # Defer import to avoid heavy import until needed
    from backend import db as schema

    print("Recreating schema using ensure_* functions…")
    # Base tables
    schema.ensure_users_table(conn)
    schema.ensure_user_profiles(conn)
    schema.ensure_listings_table(conn)
    schema.ensure_orders_table(conn)
    schema.ensure_trades_table(conn)
    schema.ensure_wallet_tables(conn)
    # Auction-related
    schema.ensure_auctions_tables(conn)
    schema.ensure_trader_inventory(conn)
    schema.ensure_resource_transactions(conn)
    schema.ensure_resource_documents(conn)
    # Optional column/index backfills
    schema.try_add_owner_columns(conn)
    print("Schema re-created.")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Clear or reset the MySQL database for this project")
    p.add_argument(
        "--mode",
        choices=["truncate", "drop"],
        default="truncate",
        help="truncate: remove all data; drop: drop all tables",
    )
    p.add_argument(
        "--recreate",
        action="store_true",
        help="After --mode drop, recreate schema using backend.db ensure_*",
    )
    p.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if not args.yes:
        action = (
            "TRUNCATE ALL TABLES (data will be removed, tables kept)"
            if args.mode == "truncate"
            else "DROP ALL TABLES" + (" and RECREATE" if args.recreate else "")
        )
        print(f"About to {action}.")
        confirm = input("Type YES to continue: ")
        if confirm.strip().upper() != "YES":
            print("Aborted.")
            return 1

    conn = db_connection()
    try:
        if args.mode == "truncate":
            truncate_all(conn)
        else:
            drop_all(conn)
            if args.recreate:
                recreate_schema_via_ensure(conn)
    finally:
        try:
            conn.close()
        except Exception:
            pass
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
