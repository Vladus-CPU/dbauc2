export function debounce(fn, wait = 300) {
  let t = null;
  return function(...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function createLocker() {
  const locks = new Set();
  return function withLock(key, fn) {
    if (locks.has(key)) return Promise.resolve(undefined);
    locks.add(key);
    const done = () => locks.delete(key);
    try {
      const r = fn();
      if (r && typeof r.then === 'function') {
        return r.finally(done);
      }
      done();
      return Promise.resolve(r);
    } catch (e) {
      done();
      return Promise.reject(e);
    }
  };
}

export function withButtonLoading(btn, fn, { labelLoading = '…' } = {}) {
  if (!btn) return fn();
  if (btn.dataset.loading === '1') return Promise.resolve();
  const prev = btn.textContent;
  btn.dataset.loading = '1';
  btn.disabled = true;
  btn.classList.add('is-loading');
  btn.textContent = labelLoading;
  const clear = () => {
    btn.dataset.loading = '0';
    btn.disabled = false;
    btn.classList.remove('is-loading');
    btn.textContent = prev;
  };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.then(res => { clear(); return res; }).catch(err => { clear(); throw err; });
    clear();
    return Promise.resolve(r);
  } catch (e) {
    clear();
    return Promise.reject(e);
  }
}

export function formatNumber(value, { min=0, max=2 } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('uk-UA', { minimumFractionDigits: min, maximumFractionDigits: max });
}
