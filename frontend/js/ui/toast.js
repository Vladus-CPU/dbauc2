let container;

function ensureContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
}

export function showToast(message, type = 'info', timeout = 3000) {
  ensureContainer();
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = String(message ?? '');
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  const remove = () => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 200);
  };
  if (timeout > 0) setTimeout(remove, timeout);
  return remove;
}
