import { getMyProfile, loginUser, registerUser, setToken, getToken, bootstrapAdmin, meAuctions, meAuctionOrders, meDocuments, meInventory, meClearingInsights, authorizedFetch } from '../api.js';
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
	console.log('[renderMyAuctions] called, root:', root);
	if (!root) {
		console.error('[renderMyAuctions] root is null/undefined');
		return;
	}
	root.innerHTML = '<div style="padding: 16px; text-align: center; color: rgba(255,255,255,0.7);">⏳ Завантаження аукціонів...</div>';
	
	try {
		console.log('[renderMyAuctions] calling meAuctions...');
		const rows = await meAuctions();
		console.log('[renderMyAuctions] meAuctions returned:', rows);
		if (!rows || !rows.length) { 
			root.innerHTML = `
				<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
					<div style="font-size: 48px; margin-bottom: 16px;">📋</div>
					<h3 style="margin: 0 0 8px 0; color: #fff;">Немає аукціонів</h3>
					<p style="margin: 0; font-size: 0.95em;">Ви ще не брали участь в жодному аукціоні</p>
				</div>
			`;
			return; 
		}
		
		let html = `
			<div style="overflow-x: auto;">
				<table style="width: 100%; border-collapse: collapse; background: rgba(20,20,30,0.5); border-radius: 8px; overflow: hidden;">
					<thead>
						<tr style="background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white;">
							<th style="padding: 12px; text-align: left; font-weight: 600;">ID</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Продукт</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Тип</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Статус</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Роль</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Дії</th>
						</tr>
					</thead>
					<tbody>
		`;
		
		rows.forEach((r, idx) => {
			const auctionType = r.auction_type === 'buy' ? '🛒 Купівля' : '💰 Продаж';
			const statusMap = { 'pending': '⏳ Очікує', 'active': '🟢 Активний', 'closed': '🔴 Закритий' };
			const statusColorMap = { 'pending': '#ff9500', 'active': '#4ade80', 'closed': '#888' };
			const status = statusMap[r.auction_status] || r.auction_status;
			const statusColor = statusColorMap[r.auction_status] || '#888';
			const role = r.is_creator ? '👑 Створив' : '👤 Учасник';
			const bgColor = idx % 2 === 0 ? 'rgba(40,40,50,0.3)' : 'rgba(30,30,40,0.3)';
			
			html += `
				<tr style="background: ${bgColor};">
					<td style="padding: 12px; color: #fff;"><strong>#${r.auction_id}</strong></td>
					<td style="padding: 12px; color: #fff;">${r.product || '—'}</td>
					<td style="padding: 12px; color: #fff;">${auctionType}</td>
					<td style="padding: 12px;"><span style="color: ${statusColor};">${status}</span></td>
					<td style="padding: 12px; color: #fff;">${role}</td>
					<td style="padding: 12px;">
						<a href="auction.html?id=${r.auction_id}" style="display: inline-block; padding: 6px 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-size: 0.85rem;">Відкрити</a>
					</td>
				</tr>
			`;
		});
		
		html += '</tbody></table></div>';
		console.log('[renderMyAuctions] setting innerHTML, html length:', html.length);
		root.innerHTML = html;
		console.log('[renderMyAuctions] innerHTML set, root.innerHTML length:', root.innerHTML.length);
	} catch (err) {
		console.error('Помилка завантаження аукціонів:', err);
		root.innerHTML = '<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Не вдалося завантажити аукціони</div>';
	}
}

async function renderMyOrders(root) {
	if (!root) return;
	root.innerHTML = '<div style="padding: 16px; text-align: center; color: rgba(255,255,255,0.7);">⏳ Завантаження ордерів...</div>';
	
	try {
		const rows = await meAuctionOrders();
		if (!rows || !rows.length) { 
			root.innerHTML = `
				<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
					<div style="font-size: 48px; margin-bottom: 16px;">📝</div>
					<h3 style="margin: 0 0 8px 0; color: #fff;">Немає ордерів</h3>
					<p style="margin: 0; font-size: 0.95em;">Ви ще не розмістили жодного ордера</p>
				</div>
			`;
			return; 
		}
		
		let html = `
			<div style="overflow-x: auto;">
				<table style="width: 100%; border-collapse: collapse; background: rgba(20,20,30,0.5); border-radius: 8px; overflow: hidden;">
					<thead>
						<tr style="background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white;">
							<th style="padding: 12px; text-align: left; font-weight: 600;">ID</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Аукціон</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Продукт</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Сторона</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Ціна</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Кількість</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Статус</th>
							<th style="padding: 12px; text-align: left; font-weight: 600;">Виконано</th>
						</tr>
					</thead>
					<tbody>
		`;
		
		rows.forEach((o, idx) => {
			const side = o.side === 'buy' ? '🟢 Купити' : '🔴 Продати';
			const sideColor = o.side === 'buy' ? '#4ade80' : '#f87171';
			const statusMap = { 'active': '🟡 Активний', 'cleared': '✅ Виконано', 'cancelled': '❌ Скасовано' };
			const statusColorMap = { 'active': '#facc15', 'cleared': '#4ade80', 'cancelled': '#888' };
			const status = statusMap[o.status] || o.status;
			const statusColor = statusColorMap[o.status] || '#888';
			const bgColor = idx % 2 === 0 ? 'rgba(40,40,50,0.3)' : 'rgba(30,30,40,0.3)';
			
			const cleared = o.status === 'cleared' && o.cleared_quantity
				? `${o.cleared_quantity} шт @ ${parseFloat(o.cleared_price).toFixed(2)} грн`
				: '—';
			
			html += `
				<tr style="background: ${bgColor};">
					<td style="padding: 12px; color: #fff;"><strong>#${o.id}</strong></td>
					<td style="padding: 12px;"><a href="auction.html?id=${o.auction_id}" style="color: #10b981; text-decoration: none;">#${o.auction_id}</a></td>
					<td style="padding: 12px; color: #fff;">${o.product || '—'}</td>
					<td style="padding: 12px; color: ${sideColor};">${side}</td>
					<td style="padding: 12px; color: #fff;">${parseFloat(o.price).toFixed(2)} грн</td>
					<td style="padding: 12px; color: #fff;">${o.quantity} шт</td>
					<td style="padding: 12px; color: ${statusColor};">${status}</td>
					<td style="padding: 12px; color: #fff;">${cleared}</td>
				</tr>
			`;
		});
		
		html += '</tbody></table></div>';
		root.innerHTML = html;
	} catch (err) {
		console.error('Помилка завантаження ордерів:', err);
		root.innerHTML = '<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Не вдалося завантажити ордери</div>';
	}
}

async function renderMyDocs(root) {
	if (!root) return;
	root.innerHTML = '<div style="padding: 16px; text-align: center; color: rgba(255,255,255,0.7);">⏳ Завантаження документів...</div>';
	
	try {
		const rows = await meDocuments();
		if (!rows || !rows.length) { 
			root.innerHTML = `
				<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
					<div style="font-size: 48px; margin-bottom: 16px;">📄</div>
					<h3 style="margin: 0 0 8px 0; color: #fff;">Немає документів</h3>
					<p style="margin: 0; font-size: 0.95em;">Документи з'являться після завершення аукціонів</p>
				</div>
			`;
			return; 
		}
		
		const container = el('div', { style: 'overflow-x: auto;' });
		const table = el('table', { style: 'width: 100%; border-collapse: collapse; background: rgba(20,20,30,0.5); border-radius: 8px; overflow: hidden;' });
		table.innerHTML = `
			<thead>
				<tr style="background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white;">
					<th style="padding: 12px; text-align: left; font-weight: 600;">Аукціон</th>
					<th style="padding: 12px; text-align: left; font-weight: 600;">Назва файлу</th>
					<th style="padding: 12px; text-align: left; font-weight: 600;">Дії</th>
				</tr>
			</thead>
		`;
		
		const tbody = el('tbody');
		rows.forEach((d, idx) => {
			const bgColor = idx % 2 === 0 ? 'rgba(40,40,50,0.3)' : 'rgba(30,30,40,0.3)';
			const row = el('tr', { style: `background: ${bgColor};` });
			row.innerHTML = `
				<td style="padding: 12px;"><a href="auction.html?id=${d.auction_id}" style="color: #10b981; text-decoration: none;">#${d.auction_id}</a></td>
				<td style="padding: 12px; color: #fff;">${d.filename}</td>
			`;
			
			const actionCell = el('td', { style: 'padding: 12px;' });
			const btn = el('button', { 
				style: 'display: inline-block; padding: 6px 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; font-size: 0.85rem; cursor: pointer;' 
			}, '⬇️ Завантажити');
			btn.addEventListener('click', async () => {
				try {
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
				} catch (e) {
					showToast('Помилка завантаження', 'error');
				}
			});
			actionCell.appendChild(btn);
			row.appendChild(actionCell);
			tbody.appendChild(row);
		});
		
		table.appendChild(tbody);
		container.appendChild(table);
		root.innerHTML = '';
		root.appendChild(container);
	} catch (err) {
		console.error('Помилка завантаження документів:', err);
		root.innerHTML = '<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Не вдалося завантажити документи</div>';
	}
}

async function renderHoldings(root) {
	if (!root) return;
	root.innerHTML = '<div style="padding: 16px; text-align: center; color: rgba(255,255,255,0.7);">⏳ Завантаження інвентарю...</div>';
	
	try {
		const rows = await meInventory();
		if (!rows || !rows.length) { 
			root.innerHTML = `
				<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
					<div style="font-size: 48px; margin-bottom: 16px;">📦</div>
					<h3 style="margin: 0 0 8px 0; color: #fff;">Інвентар порожній</h3>
					<p style="margin: 0; font-size: 0.95em;">Після клірингу ваші ресурси з'являться тут</p>
				</div>
			`;
			return; 
		}
		
		let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;">';
		
		rows.forEach((entry) => {
			const rawQty = typeof entry.quantity === 'number' ? entry.quantity : Number(entry.quantity);
			const qtyText = Number.isFinite(rawQty)
				? rawQty.toLocaleString('uk-UA', { maximumFractionDigits: 6 })
				: String(entry.quantity);
			const updatedLabel = entry.updated_at || entry.updatedAt;
			const updatedText = updatedLabel ? new Date(updatedLabel).toLocaleString() : '';
			
			html += `
				<div style="
					background: rgba(255,255,255,0.05);
					border: 1px solid rgba(255,255,255,0.1);
					border-radius: 12px;
					padding: 1.5rem;
					transition: all 0.3s ease;
				" onmouseover="this.style.borderColor='#10b981'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(16, 185, 129, 0.3)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
					<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
						<div style="font-size: 2rem;">📦</div>
						<div style="font-size: 1.2rem; font-weight: 700; color: #fff;">${entry.product || 'Невідомий товар'}</div>
					</div>
					<div style="display: flex; flex-direction: column; gap: 0.75rem;">
						<div style="display: flex; justify-content: space-between; align-items: center;">
							<span style="font-size: 0.9rem; color: rgba(255,255,255,0.7);">Кількість:</span>
							<span style="font-weight: 600; color: #10b981;">${qtyText} шт</span>
						</div>
						<div style="display: flex; justify-content: space-between; align-items: center;">
							<span style="font-size: 0.9rem; color: rgba(255,255,255,0.7);">Оновлено:</span>
							<span style="font-weight: 500; color: #fff;">${updatedText}</span>
						</div>
					</div>
				</div>
			`;
		});
		
		html += '</div>';
		root.innerHTML = html;
	} catch (err) {
		console.error('Помилка завантаження інвентарю:', err);
		root.innerHTML = '<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Не вдалося завантажити інвентар</div>';
	}
}

async function renderClearingInsights(root) {
	if (!root) return;
	root.innerHTML = '<div style="padding: 16px; text-align: center; color: rgba(255,255,255,0.7);">⏳ Завантаження даних клірингу...</div>';
	
	try {
		const data = await meClearingInsights();
		const { summary, lastRound, recentFills, inventoryEvents } = data || {};
		
		if (!summary && !lastRound && (!recentFills || !recentFills.length)) {
			root.innerHTML = `
				<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
					<div style="font-size: 48px; margin-bottom: 16px;">📊</div>
					<h3 style="margin: 0 0 8px 0; color: #fff;">Немає даних клірингу</h3>
					<p style="margin: 0; font-size: 0.95em;">Дані з\'являться після виконання ваших ордерів</p>
				</div>
			`;
			return;
		}

		let html = '<div style="display: flex; flex-direction: column; gap: 1.5rem;">';
		
		// Зведення
		if (summary) {
			html += `
				<div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 1.5rem;">
					<h3 style="margin: 0 0 1rem 0; color: #fff; font-size: 1.2rem;">📊 Зведення</h3>
					<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
						<div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 1rem; border-radius: 8px; text-align: center;">
							<div style="color: rgba(255,255,255,0.7); font-size: 0.8rem; text-transform: uppercase; margin-bottom: 0.5rem;">Позицій</div>
							<div style="color: #10b981; font-size: 1.5rem; font-weight: 700;">${summary.positions || 0}</div>
						</div>
						<div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 1rem; border-radius: 8px; text-align: center;">
							<div style="color: rgba(255,255,255,0.7); font-size: 0.8rem; text-transform: uppercase; margin-bottom: 0.5rem;">Кількість</div>
							<div style="color: #10b981; font-size: 1.5rem; font-weight: 700;">${Number(summary.totalQuantity || 0).toFixed(2)}</div>
						</div>
						<div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 1rem; border-radius: 8px; text-align: center;">
							<div style="color: rgba(255,255,255,0.7); font-size: 0.8rem; text-transform: uppercase; margin-bottom: 0.5rem;">Останній кліринг</div>
							<div style="color: #10b981; font-size: 0.9rem; font-weight: 500;">${summary.lastClearingAt ? new Date(summary.lastClearingAt).toLocaleString() : 'Немає'}</div>
						</div>
					</div>
				</div>
			`;
		}
		
		// Останній раунд
		if (lastRound) {
			html += `
				<div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 1.5rem;">
					<h3 style="margin: 0 0 1rem 0; color: #fff; font-size: 1.2rem;">🎯 Останній раунд клірингу</h3>
					<div style="display: flex; flex-direction: column; gap: 0.5rem;">
						<div style="display: flex; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.03); border-radius: 4px;">
							<span style="color: rgba(255,255,255,0.7);">Аукціон:</span>
							<a href="auction.html?id=${lastRound.auction_id}" style="color: #10b981; text-decoration: none;">#${lastRound.auction_id} - ${lastRound.product || ''}</a>
						</div>
						<div style="display: flex; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.03); border-radius: 4px;">
							<span style="color: rgba(255,255,255,0.7);">Раунд:</span>
							<span style="color: #fff;">#${lastRound.round_number}</span>
						</div>
						<div style="display: flex; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.03); border-radius: 4px;">
							<span style="color: rgba(255,255,255,0.7);">Ціна:</span>
							<span style="color: #fff;">${lastRound.clearing_price ?? '—'} грн</span>
						</div>
						<div style="display: flex; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.03); border-radius: 4px;">
							<span style="color: rgba(255,255,255,0.7);">Обсяг:</span>
							<span style="color: #fff;">${lastRound.clearing_volume ?? '—'} шт</span>
						</div>
					</div>
				</div>
			`;
		}
		
		// Виконані ордери
		if (recentFills && recentFills.length) {
			let fillsRows = recentFills.map((f, i) => {
				const bg = i % 2 === 0 ? 'rgba(40,40,50,0.3)' : 'rgba(30,30,40,0.3)';
				const sideColor = f.side === 'buy' ? '#4ade80' : '#f87171';
				const sideText = f.side === 'buy' ? '🟢 Купити' : '🔴 Продати';
				return `<tr style="background: ${bg};">
					<td style="padding: 10px; color: #fff;"><a href="auction.html?id=${f.auction_id}" style="color: #10b981;">#${f.auction_id}</a></td>
					<td style="padding: 10px; color: ${sideColor};">${sideText}</td>
					<td style="padding: 10px; color: #fff;">${f.cleared_price ?? f.price ?? '—'} грн</td>
					<td style="padding: 10px; color: #fff;">${f.cleared_quantity ?? f.quantity ?? '—'} шт</td>
				</tr>`;
			}).join('');
			
			html += `
				<div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 1.5rem;">
					<h3 style="margin: 0 0 1rem 0; color: #fff; font-size: 1.2rem;">✅ Останні виконані ордери (${recentFills.length})</h3>
					<div style="overflow-x: auto;">
						<table style="width: 100%; border-collapse: collapse;">
							<thead>
								<tr style="background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);">
									<th style="padding: 10px; text-align: left; color: white; font-weight: 600;">Аукціон</th>
									<th style="padding: 10px; text-align: left; color: white; font-weight: 600;">Сторона</th>
									<th style="padding: 10px; text-align: left; color: white; font-weight: 600;">Ціна</th>
									<th style="padding: 10px; text-align: left; color: white; font-weight: 600;">Кількість</th>
								</tr>
							</thead>
							<tbody>${fillsRows}</tbody>
						</table>
					</div>
				</div>
			`;
		}
		
		// Події інвентарю
		if (inventoryEvents && inventoryEvents.length) {
			const typeIcons = { 'clearing': '⚖️', 'deposit': '➕', 'withdrawal': '➖', 'adjustment': '🔧' };
			let eventsHtml = inventoryEvents.map(ev => {
				const icon = typeIcons[ev.type] || '📋';
				return `<div style="display: flex; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.03); border-radius: 4px; flex-wrap: wrap; gap: 0.5rem;">
					<span style="color: #fff;">${icon} ${ev.type}</span>
					<span style="color: rgba(255,255,255,0.7);">${ev.quantity} шт</span>
					<span style="color: rgba(255,255,255,0.5); font-size: 0.85rem;">${new Date(ev.occurred_at).toLocaleString()}</span>
				</div>`;
			}).join('');
			
			html += `
				<div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 1.5rem;">
					<h3 style="margin: 0 0 1rem 0; color: #fff; font-size: 1.2rem;">📝 Події інвентарю (${inventoryEvents.length})</h3>
					<div style="display: flex; flex-direction: column; gap: 0.5rem;">${eventsHtml}</div>
				</div>
			`;
		}
		
		html += '</div>';
		root.innerHTML = html;
	} catch (err) {
		console.error('Помилка завантаження клірингу:', err);
		root.innerHTML = '<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Не вдалося отримати дані клірингу</div>';
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
	
	// Кнопка створення аукціону
	const createAuctionBtn = el('div', { style: 'margin-bottom: 20px;' });
	const btnLink = el('a', { 
		href: 'create-auction.html', 
		className: 'btn btn-primary',
		style: 'display: inline-block; padding: 12px 24px; text-decoration: none;'
	}, '+ Створити новий аукціон');
	createAuctionBtn.appendChild(btnLink);
	activitySection.appendChild(createAuctionBtn);
	
	const activityTabs = el('div', { className: 'tabs dashboard-tabs', style: 'display: flex; gap: 8px; margin-bottom: 16px;' });
	const activityContent = el('div', { className: 'tab-panel', style: 'display: block; min-height: 100px; padding: 16px; background: rgba(30,30,40,0.5); border-radius: 8px;' });
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
		console.log('[setActivityActive] key:', key, 'activityContent:', activityContent);
		activeActivity = key;
		for (const [k, elTab] of activityTabEls.entries()) {
			elTab.classList.toggle('tab--active', k === key);
		}
		activityContent.innerHTML = '<div style="padding: 16px; color: #fff;">⏳ Завантаження...</div>';
		const section = activitySections.find(s => s.key === key);
		console.log('[setActivityActive] section:', section);
		if (section) {
			const maybePromise = section.render(activityContent);
			console.log('[setActivityActive] maybePromise:', maybePromise);
			if (maybePromise && typeof maybePromise.then === 'function') {
				maybePromise.catch(err => {
					console.error(`Не вдалося відтворити розділ ${key}`, err);
					activityContent.innerHTML = '<div style="color: #ff8888; padding: 16px;">❌ Не вдалося завантажити розділ.</div>';
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

		const clearingSection = el('section', { className: 'dashboard-card' });
		const clearingHeading = el('div', { className: 'section-heading' },
			el('span', { className: 'eyebrow' }, 'Кліринг'),
			el('h2', { className: 'section-heading__title' }, 'Результати після клірингу'),
			el('p', { className: 'section-heading__meta' }, 'Останній раунд, виконані ордери та події інвентарю.')
		);
		const clearingContent = el('div', { className: 'tab-panel' });
		clearingContent.textContent = 'Завантаження даних…';
		clearingSection.append(clearingHeading, clearingContent);
		shell.appendChild(clearingSection);
		renderClearingInsights(clearingContent);
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
