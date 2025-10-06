import { getWalletBalance, walletDeposit, walletWithdraw, walletTransactions } from '../api.js';
import { showToast } from '../ui/toast.js';
import { initAccessControl } from '../ui/session.js';

function el(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  Object.assign(element, props);
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  }
  return element;
}

function formatAmount(value) {
  const num = Number(value || 0);
  return num.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('uk-UA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch (error) {
    console.warn('Failed to format datetime', error);
    return String(value);
  }
}

async function renderWalletPage() {
  const summaryRoot = document.getElementById('wallet-summary');
  const actionsRoot = document.getElementById('wallet-actions');
  const transactionsRoot = document.getElementById('wallet-transactions');
  if (!summaryRoot || !actionsRoot || !transactionsRoot) return;

  function updateSummary({ available, reserved, total }) {
    summaryRoot.innerHTML = '';
    summaryRoot.append(
      el('div', { className: 'metrics-tile' },
        el('span', { className: 'metrics-tile__label' }, 'Доступний баланс'),
        el('span', { className: 'metrics-tile__value' }, formatAmount(available)),
        el('span', { className: 'metrics-tile__meta' }, 'Кошти, якими можна оперувати прямо зараз.')
      ),
      el('div', { className: 'metrics-tile' },
        el('span', { className: 'metrics-tile__label' }, 'Зарезервовано'),
        el('span', { className: 'metrics-tile__value' }, formatAmount(reserved)),
        el('span', { className: 'metrics-tile__meta' }, 'Заблоковано під активні заявки чи угоди.')
      ),
      el('div', { className: 'metrics-tile' },
        el('span', { className: 'metrics-tile__label' }, 'Разом'),
        el('span', { className: 'metrics-tile__value' }, formatAmount(total)),
        el('span', { className: 'metrics-tile__meta' }, 'Сумарний баланс (доступний + резерв).')
      )
    );
  }

  function renderTransactions(transactions) {
    transactionsRoot.innerHTML = '';
    if (!transactions || !transactions.length) {
      transactionsRoot.textContent = 'Немає транзакцій — зробіть першу операцію.';
      return;
    }
    transactions.forEach((tx) => {
      const amountValue = Number(tx.amount || 0);
      const amountChipClass = amountValue >= 0 ? 'chip chip--accent' : 'chip';
      const metaBadge = tx.meta ? el('span', { className: 'chip' }, typeof tx.meta === 'object' ? JSON.stringify(tx.meta) : String(tx.meta)) : null;
      const row = el('div', { className: 'data-list__item' },
        el('span', { className: 'data-list__label' }, `${tx.type} • ${formatDateTime(tx.createdAt)}`),
        el('span', { className: amountChipClass }, `${amountValue >= 0 ? '+' : ''}${formatAmount(amountValue)}`),
        metaBadge,
        el('span', { className: 'data-list__meta' }, `Після операції: ${formatAmount(tx.balanceAfter)}`)
      );
      transactionsRoot.appendChild(row);
    });
  }

  async function refreshSummary() {
    try {
      const balances = await getWalletBalance();
      updateSummary(balances);
      return balances;
    } catch (error) {
      summaryRoot.textContent = 'Не вдалося завантажити баланс.';
      console.error('Не вдалося завантажити баланс', error);
      throw error;
    }
  }

  async function refreshTransactions() {
    transactionsRoot.textContent = 'Завантаження…';
    try {
      const rows = await walletTransactions(60);
      renderTransactions(rows);
    } catch (error) {
      transactionsRoot.textContent = 'Не вдалося завантажити транзакції.';
      console.error('Не вдалося завантажити транзакції', error);
    }
  }

  function createActionForm({ title, description, action }) {
    const amountInput = el('input', {
      className: 'form__input',
      type: 'number',
      step: '0.01',
      min: '0',
      placeholder: '0.00',
      required: true,
      inputMode: 'decimal',
    });
    const submitBtn = el('button', { type: 'submit', className: 'btn btn-primary' }, title);
    const form = el('form', { className: 'wallet-form' },
      el('h3', { className: 'wallet-form__title' }, title),
      el('p', { className: 'wallet-form__subtitle' }, description),
      el('label', { className: 'form-field' },
        el('span', { className: 'form-field__label' }, 'Сума'),
        amountInput
      ),
      el('div', { className: 'form-actions' }, submitBtn)
    );

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const raw = String(amountInput.value || '').trim();
      const value = Number(raw);
      if (!(value > 0)) {
        showToast('Вкажіть додатну суму', 'error');
        return;
      }
      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = 'Виконуємо…';
      try {
        await action(raw);
        showToast('Операцію виконано успішно', 'success');
        amountInput.value = '';
        await Promise.all([refreshSummary(), refreshTransactions()]);
      } catch (error) {
        showToast(error?.message || 'Не вдалося виконати операцію', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });

    return form;
  }

  actionsRoot.innerHTML = '';
  const formsGrid = el('div', { className: 'wallet-forms-grid' });
  formsGrid.append(
    createActionForm({
      title: 'Поповнити баланс',
      description: 'Зарахування коштів на власний рахунок.',
      action: (amount) => walletDeposit(amount),
    }),
    createActionForm({
      title: 'Вивести кошти',
      description: 'Списання та виплата на зовнішній рахунок.',
      action: (amount) => walletWithdraw(amount),
    })
  );

  const tips = el('div', { className: 'wallet-tips' },
    el('h4', { className: 'wallet-tips__title' }, 'Поради'),
    el('ul', { className: 'wallet-tips__list' },
      el('li', {}, 'Резерв формується автоматично, коли ви берете участь в аукціоні.'),
      el('li', {}, 'Будь-яка операція миттєво дублюється в історії для контролю.'),
      el('li', {}, 'Адміністратор може допомогти з поверненням коштів у виняткових випадках.')
    )
  );

  actionsRoot.append(formsGrid, tips);

  await refreshSummary();
  await refreshTransactions();
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await initAccessControl({
    requireAuth: true,
    redirectTo: 'account.html',
    onDenied: () => showToast('Авторизуйтесь, щоб керувати гаманцем', 'error'),
  });
  if (!session?.authenticated) return;
  await renderWalletPage();
});
