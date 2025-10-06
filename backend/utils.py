import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List
from .errors import AppError

def serialize(data: Any) -> Any:
    if isinstance(data, list):
        return [serialize(item) for item in data]
    if isinstance(data, dict):
        return {key: serialize(value) for key, value in data.items()}
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

def to_decimal(value: Any) -> Decimal:
    try:
        if isinstance(value, Decimal):
            return value
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise AppError("Invalid numeric value", statuscode=400)

def now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)

def clean_string(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return str(value).strip() or None

def is_admin(user: Dict[str, Any] | None) -> bool:
    return bool(user) and int(user.get('is_admin', 0)) == 1

def is_trader(user: Dict[str, Any] | None) -> bool:
    return bool(user) and not is_admin(user)

__all__ = [
    'serialize',
    'to_decimal',
    'now_utc',
    'clean_string',
    'is_admin',
    'is_trader',
]
