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
            iso_str = data.isoformat()
            # Ensure timezone-aware datetimes have Z suffix for JavaScript
            if isinstance(data, datetime.datetime) and data.tzinfo is not None and not iso_str.endswith('Z'):
                # Add Z if it's UTC timezone but doesn't have Z or +00:00 suffix
                if '+00:00' in iso_str:
                    iso_str = iso_str.replace('+00:00', 'Z')
                elif not iso_str.endswith('Z'):
                    iso_str = iso_str + 'Z'
            return iso_str
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
