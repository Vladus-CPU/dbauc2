import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List
from .errors import AppFail

def to_plain(data: Any) -> Any:
    if isinstance(data, list):
        return [to_plain(item) for item in data]
    if isinstance(data, dict):
        return {key: to_plain(value) for key, value in data.items()}
    if isinstance(data, Decimal):
        try:
            return float(data)
        except Exception:
            return str(data)
    if isinstance(data, (datetime.datetime, datetime.date)):
        try:
            return data.isoformat()
        except Exception:
            return str(data)
    return data

def to_dec(value: Any) -> Decimal:
    try:
        if isinstance(value, Decimal):
            return value
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise AppFail("Invalid numeric value", statuscode=400)

def utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)

def trim_or_none(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return str(value).strip() or None

def is_admin_user(user: Dict[str, Any] | None) -> bool:
    return bool(user) and int(user.get('is_admin', 0)) == 1

def is_trader_user(user: Dict[str, Any] | None) -> bool:
    return bool(user) and not is_admin_user(user)

__all__ = [
    'to_plain',
    'to_dec',
    'utc_now',
    'trim_or_none',
    'is_admin_user',
    'is_trader_user',
]
