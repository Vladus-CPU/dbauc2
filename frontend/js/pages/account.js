import { getMyProfile, loginUser, registerUser, setToken, getToken, bootstrapAdmin, meAuctions, meAuctionOrders, meDocuments, meInventory, authorizedFetch } from '../api.js';
import { showToast } from '../ui/toast.js';
import { initAccessControl, clearCachedSession } from '../ui/session.js';

function el(tag, props = {}, ...children) {
	const e = document.createElement(tag);
	Object.assign(e, props);
	for (const c of children) {
		if (typeof c === 'string') e.appendChild(document.createTextNode(c));
		else if (c) e.appendChild(c);
	}
	return e;
}

const heroBullet = (text) => el('li', { className: 'auth-hero__item' }, text);
const setVisible = (el, v) => { el.style.display = v ? '' : 'none'; };
const textOrEmpty = (v) => (v == null ? '' : String(v));

function formRow({ id, name, inputProps = {}, labelText = '', errorId = null, hint = null, rowClass = '' }) {
	const label = el('label', { className: 'form__label', htmlFor: id }, labelText);
	const input = (inputProps.tag === 'textarea')
		? el('textarea', Object.assign({ id, name, className: 'form__input' }, inputProps.attrs || {}))
		: el('input', Object.assign({ id, name, className: 'form__input' }, inputProps));
	const error = errorId ? el('div', { className: 'error-text', id: errorId, style: 'display:none;' }) : null;
	const hintEl = hint ? el('div', { className: 'hint' }, hint) : null;
	const row = el('div', { className: `form-row ${rowClass}` }, label, input, error, hintEl);
	return { row, input, error };
}

async function renderAuth(container) {
	container.innerHTML = '';

	const wrap = el('div', { className: 'auth-wrap' });
	const layout = el('div', { className: 'auth-layout' });

	const hero = el('section', { className: 'glass-panel auth-hero' },
		el('span', { className: 'badge badge--accent' }, 'Ласкаво просимо'),
		el('h2', { className: 'auth-hero__title' }, 'Торгуйте з впевненістю'),
		el('p', { className: 'auth-hero__subtitle' }, 'Створіть свій профіль, поповніть баланс та приєднуйтесь до закритих аукціонів з єдиної панелі керування.'),
		el('ul', { className: 'auth-hero__list' },
			heroBullet('Єдине сховище ресурсів та керування акаунтами'),
			heroBullet('Миттєві сповіщення після кожного клірингу'),
			heroBullet('Все під контролем')
		)
	);

	const card = el('section', { className: 'form-card' });
	const tabs = el('div', { className: 'auth-tabs' });
	const tabLogin = el('div', { className: 'auth-tab auth-tab--active' }, 'Вхід');
	const tabRegister = el('div', { className: 'auth-tab' }, 'Реєстрація');
	tabs.append(tabLogin, tabRegister);

	const body = el('div', { className: 'form-section' });

	const loginHeader = el('div', { className: 'auth-form__header' },
		el('h3', { className: 'auth-form__title' }, 'Увійти'),
		el('p', { className: 'auth-form__subtitle', style: 'text-align:center; margin: 0 auto;' }, 'Отримайте доступ до панелі керування акаунтами та аукціонами.')
	);
	const loginForm = el('form', { className: 'form-grid auth-form', 'aria-label': 'Форма входу' });

	const loginUserRow = formRow({ id: 'login_username', name: 'username', labelText: 'Ім\'я користувача', inputProps: { placeholder: 'Ваше ім\'я користувача', required: true, minLength: 3, autocomplete: 'username' }, errorId: 'login_user_error' });
	const loginPassRow = formRow({ id: 'login_password', name: 'password', labelText: 'Пароль', inputProps: { type: 'password', placeholder: '*********', required: true, minLength: 4, autocomplete: 'current-password' }, errorId: 'login_pass_error' });

	const loginOptions = el('div', { className: 'form-row form-row--options', style: 'display:flex; gap:12px; align-items:center; justify-content:space-between;' },
		el('label', { className: 'form__row', style: 'display:flex; gap:8px; align-items:center;' },
			el('input', { className: 'form__checkbox', type: 'checkbox', name: 'showpass' }), el('span', {}, 'Показати пароль')
		),
		el('label', { className: 'form__row', style: 'display:flex; gap:8px; align-items:center;' },
			el('input', { className: 'form__checkbox', type: 'checkbox', name: 'remember', checked: true }), el('span', {}, 'Запам\'ятати мене')
		)
	);

	const loginSubmitRow = el('div', { className: 'form-row' },
		el('div', { className: 'error-text', id: 'login_error', style: 'display:none;' }),
		el('div', { className: 'form-actions' }, el('button', { type: 'submit', className: 'btn btn-primary' }, 'Увійти'))
	);

	loginForm.append(loginHeader, loginUserRow.row, loginPassRow.row, loginOptions, loginSubmitRow);

	const regHeader = el('div', { className: 'auth-form__header', style: 'grid-column: 1 / -1;' },
		el('h3', { className: 'auth-form__title' }, 'Створити акаунт'),
		el('p', { className: 'auth-form__subtitle' }, 'Зареєструйтеся, щоб брати участь в аукціонах, завантажувати документи та керувати коштами.')
	);
	const regForm = el('form', { className: 'form-grid form-grid--two auth-form auth-form--register', style: 'display:none;', 'aria-label': 'Форма реєстрації' });

	const regUserRow = formRow({ id: 'reg_username', name: 'username', labelText: 'Ім\'я користувача', inputProps: { placeholder: 'Оберіть ім\'я користувача', required: true, minLength: 3, autocomplete: 'username' }, errorId: 'reg_user_error' });
	const regEmailRow = formRow({ id: 'reg_email', name: 'email', labelText: 'Email (необов\'язково)', inputProps: { type: 'email', placeholder: 'name@example.com', autocomplete: 'email' } });
	const regPassRow = formRow({ id: 'reg_password', name: 'password', labelText: 'Пароль', inputProps: { type: 'password', placeholder: 'Мінімум 4 символи', required: true, minLength: 4, autocomplete: 'new-password' }, errorId: 'reg_pass_error', hint: 'Мінімум 4 символи' });
	const regFirstRow = formRow({ id: 'reg_first', name: 'firstName', labelText: 'Ім\'я', inputProps: { placeholder: 'Ім\'я', required: true, minLength: 2 }, errorId: 'reg_first_error' });
	const regLastRow = formRow({ id: 'reg_last', name: 'lastName', labelText: 'Прізвище', inputProps: { placeholder: 'Прізвище', required: true, minLength: 2 }, errorId: 'reg_last_error' });
	const regCityRow = formRow({ id: 'reg_city', name: 'city', labelText: 'Місто', inputProps: { placeholder: 'Місто' } });
	const regRegionRow = formRow({ id: 'reg_region', name: 'region', labelText: 'Регіон', inputProps: { placeholder: 'Регіон' } });
	const regCountryRow = formRow({ id: 'reg_country', name: 'country', labelText: 'Країна', inputProps: { placeholder: 'Країна' } });
	const regShowPassRow = el('div', { className: 'form-row', style: 'grid-column: 1 / -1; display:flex; gap:8px; align-items:center;' },
		el('label', { className: 'form__row', style: 'gap:6px; display:flex; align-items:center;' },
			el('input', { className: 'form__checkbox', type: 'checkbox', name: 'showpass' }), 'Показати пароль'
		)
	);
	const regSubmitRow = el('div', { className: 'form-row', style: 'grid-column: 1 / -1; display:flex; justify-content:space-between; align-items:center;' },
		el('div', { className: 'error-text', id: 'reg_error', style: 'display:none;' }),
		el('div', { className: 'form-actions' }, el('button', { type: 'submit', className: 'btn btn-primary' }, 'Створити акаунт'))
	);

	regForm.append(
		regHeader,
		regUserRow.row,
		regEmailRow.row,
		regPassRow.row,
		regFirstRow.row,
		regLastRow.row,
		regCityRow.row,
		regRegionRow.row,
		regCountryRow.row,
		regShowPassRow,
		regSubmitRow
	);

	body.append(loginForm, regForm);
	card.append(tabs, body);
	layout.append(hero, card);
	wrap.appendChild(layout);
	container.appendChild(wrap);

	const showLogin = () => {
		tabLogin.classList.add('auth-tab--active');
		tabRegister.classList.remove('auth-tab--active');
		loginForm.style.display = 'grid';
		regForm.style.display = 'none';
	};
	const showRegister = () => {
		tabRegister.classList.add('auth-tab--active');
		tabLogin.classList.remove('auth-tab--active');
		loginForm.style.display = 'none';
		regForm.style.display = 'grid';
	};
	tabLogin.onclick = showLogin;
	tabRegister.onclick = showRegister;

	const loginShow = loginForm.querySelector('input[name="showpass"]');
	const loginPwd = loginForm.querySelector('input[name="password"]');
	if (loginShow) loginShow.addEventListener('change', () => { loginPwd.type = loginShow.checked ? 'text' : 'password'; });

	const regShow = regForm.querySelector('input[name="showpass"]');
	const regPwd = regForm.querySelector('input[name="password"]');
	if (regShow) regShow.addEventListener('change', () => { regPwd.type = regShow.checked ? 'text' : 'password'; });

	const updateValidity = (form, btn) => { btn.disabled = !form.checkValidity(); };
	const showFieldError = (input, errorEl, message) => {
		if (!input.checkValidity()) { errorEl.textContent = message; errorEl.style.display = 'block'; }
		else { errorEl.textContent = ''; errorEl.style.display = 'none'; }
	};

	const loginBtn = loginForm.querySelector('button[type="submit"]');
	loginForm.addEventListener('input', () => {
		updateValidity(loginForm, loginBtn);
		showFieldError(loginUserRow.input, loginUserRow.error, 'Ім\'я користувача має містити принаймні 3 символи');
		showFieldError(loginPassRow.input, loginPassRow.error, 'Пароль має містити принаймні 4 символи');
	});
	updateValidity(loginForm, loginBtn);

	loginForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const fd = new FormData(loginForm);
		const errBox = loginForm.querySelector('#login_error');
		setVisible(errBox, false); errBox.textContent = '';
		const prevText = loginBtn.textContent;
		loginBtn.disabled = true; loginBtn.textContent = 'Входимо...';
		try {
			await loginUser({ username: String(fd.get('username')), password: String(fd.get('password')), remember: !!fd.get('remember') });
			if (!getToken()) throw new Error('Токен не встановлено після входу');
			clearCachedSession();
			showToast('Вхід успішний! Оновлюємо сторінку...', 'success');
			window.location.reload();
		} catch (err) {
			const msg = err?.message || 'Помилка входу';
			showToast(msg, 'error');
			errBox.textContent = msg; setVisible(errBox, true);
		} finally {
			loginBtn.disabled = false; loginBtn.textContent = prevText;
		}
	});

	const regBtn = regForm.querySelector('button[type="submit"]');
	regForm.addEventListener('input', () => {
		updateValidity(regForm, regBtn);
		showFieldError(regUserRow.input, regUserRow.error, 'Ім\'я користувача має містити принаймні 3 символи');
		showFieldError(regPassRow.input, regPassRow.error, 'Пароль має містити принаймні 4 символи');
		showFieldError(regFirstRow.input, regFirstRow.error, 'Ім\'я є обов\'язковим');
		showFieldError(regLastRow.input, regLastRow.error, 'Прізвище є обов\'язковим');
	});
	updateValidity(regForm, regBtn);

	regForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const fd = new FormData(regForm);
		const errBox = regForm.querySelector('#reg_error');
		setVisible(errBox, false); errBox.textContent = '';
		const prevText = regBtn.textContent;
		regBtn.disabled = true; regBtn.textContent = 'Створюємо...';
		try {
			const trim = (name) => {
				const raw = fd.get(name);
				return typeof raw === 'string' ? raw.trim() : '';
			};
			const payload = {
				username: trim('username'),
				password: trim('password'),
				email: trim('email') || undefined,
				firstName: trim('firstName'),
				lastName: trim('lastName'),
				city: trim('city') || undefined,
				region: trim('region') || undefined,
				country: trim('country') || undefined
			};
			await registerUser(payload);
			showToast('Акаунт успішно створено!', 'success');
			await loginUser({ username: payload.username, password: payload.password, remember: true });
			showToast('Автовхід виконано! Оновлюємо сторінку...', 'success');
			clearCachedSession();
			setTimeout(() => window.location.reload(), 1000);
		} catch (err) {
			const msg = err?.message || 'Помилка реєстрації';
			showToast(msg, 'error');
			errBox.textContent = msg; setVisible(errBox, true);
		} finally {
			regBtn.disabled = false; regBtn.textContent = prevText;
		}
	});

	const firstInput = loginForm.querySelector('input[name="username"]');
	if (firstInput) firstInput.focus();
}

async function renderMyAuctions(root) {
	root.innerHTML = '';
	const list = el('div', { className: 'stack-grid' });
	list.textContent = 'Завантаження аукціонів…';
	root.appendChild(list);
	try {
		const rows = await meAuctions();
		if (!rows.length) { list.textContent = 'Ще немає участі в аукціонах'; return; }
		list.innerHTML = '';
		rows.forEach((r) => {
			const card = el('article', { className: 'stack-card' });
			const header = el('div', { className: 'stack-card__header' },
				el('strong', {}, `#${r.auction_id} ${r.product}`),
				el('span', { className: 'pill pill--outline' }, r.auction_type),
				el('span', { className: 'chip' }, `k = ${r.k_value}`),
				el('span', { className: 'chip' }, `Auction • ${r.auction_status}`)
			);
			const meta = el('div', { className: 'stack-card__meta' }, `Ви • ${r.participant_status} @ ${new Date(r.joined_at).toLocaleString()}`);
			card.append(header, meta);
			list.appendChild(card);
		});
	} catch (_) {
		list.textContent = 'Не вдалося завантажити';
	}
}

async function renderMyOrders(root) {
	root.innerHTML = '';
	const list = el('div', { className: 'stack-grid' });
	list.textContent = 'Завантаження ордерів…';
	root.appendChild(list);
	try {
		const rows = await meAuctionOrders();
		if (!rows.length) { list.textContent = 'Ордерів ще немає'; return; }
		list.innerHTML = '';
		rows.forEach((o) => {
			const qty = Number(o.quantity);
			const cqty = o.cleared_quantity != null ? Number(o.cleared_quantity) : null;
			const card = el('article', { className: 'stack-card' });
			const header = el('div', { className: 'stack-card__header' },
				el('strong', {}, `Аукціон #${o.auction_id}`),
				el('span', { className: 'pill pill--outline' }, o.side),
				el('span', { className: 'chip' }, `${o.price} × ${qty}`),
				o.status ? el('span', { className: 'chip' }, `Статус • ${o.status}`) : null
			);
			card.appendChild(header);
			if (cqty != null) {
				card.appendChild(el('div', { className: 'stack-card__meta' }, `Відклірено • ${o.cleared_price} × ${cqty}`));
			}
			card.appendChild(el('div', { className: 'stack-card__meta' }, `${o.product} • ${new Date(o.created_at).toLocaleString()}`));
			list.appendChild(card);
		});
	} catch (_) {
		list.textContent = 'Не вдалося завантажити';
	}
}

async function renderMyDocs(root) {
	root.innerHTML = '';
	const list = el('div', { className: 'data-list' });
	list.textContent = 'Завантаження документів…';
	root.appendChild(list);
	try {
		const rows = await meDocuments();
		if (!rows.length) { list.textContent = 'Документів ще немає'; return; }
		list.innerHTML = '';
		rows.forEach((d) => {
			const item = el('div', { className: 'data-list__item' },
				el('span', { className: 'data-list__label' }, `Аукціон #${d.auction_id}`),
				el('span', { className: 'chip' }, d.filename),
				d.notes ? el('span', { className: 'chip' }, d.notes) : null,
				el('span', { className: 'data-list__meta' }, new Date(d.created_at || d.uploaded_at || d.uploadedAt || Date.now()).toLocaleString())
			);
			const btn = el('button', { className: 'btn btn-ghost btn-compact' }, 'Завантажити');
			btn.addEventListener('click', async () => {
				const res = await authorizedFetch(`/api/me/documents/${d.auction_id}/${encodeURIComponent(d.filename)}`);
				if (!res.ok) { showToast('Не вдалося завантажити', 'error'); return; }
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url; a.download = d.filename;
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(url);
			});
			item.appendChild(btn);
			list.appendChild(item);
		});
	} catch (_) {
		list.textContent = 'Не вдалося завантажити';
	}
}

async function renderHoldings(root) {
	if (!root) return;
	root.innerHTML = '';
	const list = el('div', { className: 'data-list' });
	list.textContent = 'Завантаження інвентарю…';
	root.appendChild(list);
	try {
		const rows = await meInventory();
		if (!rows.length) { list.textContent = 'Інвентар поки порожній'; return; }
		list.innerHTML = '';
		rows.forEach((entry) => {
			const rawQty = typeof entry.quantity === 'number' ? entry.quantity : Number(entry.quantity);
			const qtyText = Number.isFinite(rawQty)
				? rawQty.toLocaleString('uk-UA', { maximumFractionDigits: 6 })
				: String(entry.quantity);
			const updatedLabel = entry.updated_at || entry.updatedAt;
			const updatedText = updatedLabel ? new Date(updatedLabel).toLocaleString() : '';
			list.appendChild(el('div', { className: 'data-list__item' },
				el('span', { className: 'data-list__label' }, entry.product || 'Невідомий товар'),
				el('span', { className: 'chip' }, qtyText),
				updatedText ? el('span', { className: 'data-list__meta' }, updatedText) : null
			));
		});
	} catch (_) {
		list.textContent = 'Не вдалося завантажити інвентар';
	}
}

async function renderDashboard(container, session) {
	container.innerHTML = '';
	const shell = el('div', { className: 'dashboard-shell' });
	container.appendChild(shell);

	const profileDetails = await getMyProfile().catch(() => null);
	const profile = profileDetails?.profile || {};
	const fullNameParts = [profile.first_name, profile.last_name].filter(Boolean);
	const locationParts = [profile.city, profile.region, profile.country].filter(Boolean);

	const head = el('section', { className: 'dashboard-card dashboard-card--header' },
		el('span', { className: 'eyebrow' }, 'Увійшли'),
		el('div', { className: 'dashboard-card__title' },
			el('span', {}, session.user.username),
			el('span', { className: `badge ${session.user.is_admin ? 'badge--accent' : 'badge--outline'}` }, session.user.is_admin ? 'Адмін' : 'Трейдер')
		),
		el('p', { className: 'dashboard-card__subtitle' }, fullNameParts.length ? fullNameParts.join(' ') : 'Заповніть профіль, щоб прискорити схвалення на аукціонах.'),
		(() => {
			const meta = el('div', { className: 'dashboard-card__meta' });
			meta.appendChild(el('span', {}, `Користувач #${session.user.id}`));
			if (session.user.email) meta.appendChild(el('span', {}, `Email • ${session.user.email}`));
			if (locationParts.length) meta.appendChild(el('span', {}, `Локація • ${locationParts.join(', ')}`));
			return meta;
		})(),
		(() => {
			const chips = el('div', { className: 'stat-chips' });
			chips.appendChild(el('span', { className: 'chip chip--accent' }, session.user.is_admin ? 'Доступ адміна' : 'Доступ трейдера'));
			if (profileDetails?.role) chips.appendChild(el('span', { className: 'chip' }, `Роль • ${profileDetails.role}`));
			if (profile.updated_at) chips.appendChild(el('span', { className: 'chip' }, `Оновлено ${new Date(profile.updated_at).toLocaleString()}`));
			return chips;
		})(),
		(() => {
			const actions = el('div', { className: 'dashboard-card__actions' });
			const logoutBtn = el('button', {
				className: 'btn btn-ghost',
				onclick: async () => {
					setToken('');
					clearCachedSession();
					showToast('Ви вийшли', 'info');
					await renderRoot(container, { forceRefresh: true });
				}
			}, 'Вийти');
			actions.append(logoutBtn);
			if (!session.user.is_admin) {
				actions.appendChild(el('button', {
					className: 'btn btn-ghost',
					onclick: async () => {
						try {
							const res = await bootstrapAdmin();
							showToast(res.message || 'Тепер у вас є доступ адміна', 'success');
							clearCachedSession();
							await renderRoot(container, { forceRefresh: true });
						} catch (e) {
							showToast(e?.message || 'Помилка ініціалізації', 'error');
						}
					}
				}, 'Ініціалізувати адміна'));
			}
			return actions;
		})()
	);
	shell.appendChild(head);

	const activitySection = el('section', { className: 'dashboard-card' });
	activitySection.append(el('div', { className: 'section-heading' },
		el('span', { className: 'eyebrow' }, 'Активність'),
		el('h2', { className: 'section-heading__title' }, 'Ваша історія торгів'),
		el('p', { className: 'section-heading__meta' }, 'Перемикайтеся між аукціонами, ордерами та документами.')
	));
	const activityTabs = el('div', { className: 'tabs dashboard-tabs' });
	const activityContent = el('div', { className: 'tab-panel' });
	activitySection.append(activityTabs, activityContent);
	shell.appendChild(activitySection);

	const activitySections = [
		{ key: 'my-auctions', label: 'Мої аукціони', render: renderMyAuctions },
		{ key: 'my-orders', label: 'Мої ордери', render: renderMyOrders },
		{ key: 'my-docs', label: 'Мої документи', render: renderMyDocs }
	];

	let activeActivity = 'my-auctions';
	const activityTabEls = new Map();

	function setActivityActive(key) {
		activeActivity = key;
		for (const [k, elTab] of activityTabEls.entries()) {
			elTab.classList.toggle('tab--active', k === key);
		}
		activityContent.innerHTML = '';
		const section = activitySections.find(s => s.key === key);
		if (section) {
			const maybePromise = section.render(activityContent);
			if (maybePromise && typeof maybePromise.then === 'function') {
				maybePromise.catch(err => {
					console.error(`Не вдалося відтворити розділ ${key}`, err);
					activityContent.textContent = 'Не вдалося завантажити розділ.';
				});
			}
		}
	}

	activitySections.forEach(s => {
		const tabEl = el('div', { className: 'tab', onclick: () => setActivityActive(s.key) }, s.label);
		activityTabEls.set(s.key, tabEl);
		activityTabs.appendChild(tabEl);
	});
	setActivityActive(activeActivity);

	if (!session.user.is_admin) {
		const holdingsSection = el('section', { className: 'dashboard-card' });
		const holdingsHeading = el('div', { className: 'section-heading' },
			el('span', { className: 'eyebrow' }, 'Інвентар'),
			el('h2', { className: 'section-heading__title' }, 'Отримані ресурси'),
			el('p', { className: 'section-heading__meta' }, 'Зведення по товарах, що були зараховані після клірингу.')
		);
		const holdingsContent = el('div', { className: 'tab-panel' });
		holdingsContent.textContent = 'Завантаження інвентарю…';
		holdingsSection.append(holdingsHeading, holdingsContent);
		shell.appendChild(holdingsSection);
		renderHoldings(holdingsContent);
	}
}

async function renderRoot(container, options = {}) {
	let session = null;
	try {
		session = await initAccessControl({ forceRefresh: Boolean(options.forceRefresh) });
	} catch (err) {
		console.error('Не вдалося вирішити сесію', err);
	}
	if (session?.authenticated && session.user) {
		await renderDashboard(container, session);
		return;
	}
	await renderAuth(container);
}

document.addEventListener('DOMContentLoaded', async () => {
	const main = document.querySelector('main.container');
	if (!main) return;
	await renderRoot(main);
});
