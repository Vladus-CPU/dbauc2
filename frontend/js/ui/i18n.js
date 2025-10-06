// Простий модуль локалізації для сторінки аукціону
// Можна розширити централізованим підходом у майбутньому

const STATUS_MAP = {
  collecting: 'Збір заявок',
  cleared: 'Відклірингено',
  closed: 'Закрито',
};

const SIDE_MAP = {
  bid: 'купівля',
  ask: 'продаж',
};

export function tStatus(value) {
  if (!value) return '—';
  return STATUS_MAP[value] || value;
}

export function tSide(value) {
  if (!value) return '—';
  return SIDE_MAP[value] || value;
}

// Грубе «очищення» / нормалізація повідомлень помилок для відображення користувачу
export function localizeErrorMessage(msg) {
  if (!msg) return 'Сталася невідома помилка';
  const lower = msg.toLowerCase();
  if (lower.includes('unauthorized') || lower.includes('forbidden')) {
    return 'Немає прав доступу';
  }
  if (lower.includes('not found')) {
    return 'Не знайдено';
  }
  if (lower.includes('invalid') || lower.includes('must')) {
    return 'Неправильні дані запиту';
  }
  if (lower.includes('timeout')) {
    return 'Перевищено час очікування';
  }
  return msg;
}
