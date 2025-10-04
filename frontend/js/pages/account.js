import { getMyProfile, updateMyProfile, loginUser, registerUser, setToken, getToken, listAccounts, addAccount, listAuctions, joinAuction, placeAuctionOrder, bootstrapAdmin, listResourceTransactions, addResourceTransaction, listResourceDocuments, uploadResourceDocument, myParticipationStatus } from '../api.js';
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

const heroBullet = (text) => el('li', { 
	className: 'auth-hero__item' }, text);

async function renderAuth(container) {
	container.innerHTML = '';
	const wrap = el('div', { 
		className: 'auth-wrap' });
	const layout = el('div', { 
		className: 'auth-layout' });
	const hero = el('section', { 
		className: 'glass-panel auth-hero' },
		el('span', { 
			className: 'badge badge--accent' }, 'Welcome'),
		el('h2', { 
			className: 'auth-hero__title' }, 'Trade with confidence'),
		el('p', { 
			className: 'auth-hero__subtitle' }, 'Create your identity, getting balance, and join sealed auctions all from a single dashboard.'),
		el('ul', { 
			className: 'auth-hero__list' },
			heroBullet('Unified resource vault & account controls'),
			heroBullet('Instant notifications after each clearing run'),
			heroBullet('What’s up')
		)
	);
	const card = el('section', { 
		className: 'form-card' });
	const tabs = el('div', { 
		className: 'auth-tabs' });
	const tabLogin = el('div', { 
		className: 'auth-tab auth-tab--active' }, 'Login');
	const tabRegister = el('div', { 
		className: 'auth-tab' }, 'Register');
	tabs.append(tabLogin, tabRegister);
	const body = el('div', { 
		className: 'form-section' });
	const login = el('form', {
		className: 'form-grid auth-form',
		'aria-label': 'Login form'
	},
		el('div', { className: 'auth-form__header' },
			el('h3', { className: 'auth-form__title' }, 'Sign in'),
			el('p', { className: 'auth-form__subtitle', style: 'text-align:center, padding: auto; margin: auto;' }, 'Access your dashboard to manage accounts and auctions.')
		),
		el('div', { className: 'form-row' },
			el('label', { className: 'form__label', htmlFor: 'login_username' }, 'Username'),
			el('div', { className: 'input-group' },
				el('input', {
					id: 'login_username',
					className: 'form__input',
					name: 'username',
					placeholder: 'Your username',
					required: true,
					minLength: 3,
					autocomplete: 'username'
				})
			),
			el('div', { className: 'error-text', id: 'login_user_error', style: 'display:none;' })
		),
		el('div', { className: 'form-row' },
			el('label', { className: 'form__label', htmlFor: 'login_password' }, 'Password'),
			el('div', { className: 'input-group' },
				el('input', {
					id: 'login_password',
					className: 'form__input',
					name: 'password',
					placeholder: '*********',
					type: 'password',
					required: true,
					minLength: 4,
					autocomplete: 'current-password'
				})
			),
			el('div', { className: 'error-text', id: 'login_pass_error', style: 'display:none;' })
		),
		el('div', { className: 'form-row form-row--options', style: 'display:flex; gap:12px; align-items:center; justify-content:space-between;' },
			el('label', { className: 'form__row', style: 'display:flex; gap:8px; align-items:center;' },
				el('input', { className: 'form__checkbox', type: 'checkbox', name: 'showpass' }),
				el('span', {}, 'Show password')
			),
			el('label', { className: 'form__row', style: 'display:flex; gap:8px; align-items:center;' },
				el('input', { className: 'form__checkbox', type: 'checkbox', name: 'remember', checked: true }),
				el('span', {}, 'Remember me')
			)
		),
		el('div', { className: 'form-row' },
			el('div', { className: 'error-text', id: 'login_error', style: 'display:none;' }),
			el('div', { className: 'form-actions' },
				el('button', { type: 'submit', className: 'btn btn-primary' }, 'Login')
			)
		)
	);

	const reg = el('form', { 
		className: 'form-grid form-grid--two auth-form auth-form--register', style: 'display:none;', 'aria-label': 'Register form' },
		el('div', { 
			className: 'auth-form__header', style: 'grid-column: 1 / -1;' },
			el('h3', { 
				className: 'auth-form__title' }, 'Create account'),
			el('p', { 
				className: 'auth-form__subtitle' }, 'Register to participate in auctions, upload documents, and manage funds.')
		),
		el('div', { 
			className: 'form-row' },
			el('label', { 
				className: 'form__label', htmlFor: 'reg_username' }, 'Username'),
			el('input', { 
				id: 'reg_username', className: 'form__input', name: 'username', placeholder: 'Choose a username', required: true, minLength: 3, autocomplete: 'username' }),
			el('div', { 
				className: 'error-text', id: 'reg_user_error', style: 'display:none;' })
		),
		el('div', { 
			className: 'form-row' },
			el('label', { 
				className: 'form__label', htmlFor: 'reg_email' }, 'Email (optional)'),
			el('input', { 
				id: 'reg_email', className: 'form__input', name: 'email', placeholder: 'name@example.com', type: 'email', autocomplete: 'email' })
		),
		el('div', { 
			className: 'form-row' },
			el('label', { 
				className: 'form__label', htmlFor: 'reg_password' }, 'Password'),
			el('input', { 
				id: 'reg_password', className: 'form__input', name: 'password', placeholder: 'At least 4 characters', type: 'password', required: true, minLength: 4, autocomplete: 'new-password' }),
			el('div', { 
				className: 'error-text', id: 'reg_pass_error', style: 'display:none;' }),
			el('div', { 
				className: 'hint' }, 'Minimum 4 characters')
		),
		el('div', { 
			className: 'form-row' },
			el('label', { 
				className: 'form__label', htmlFor: 'reg_first' }, 'First name'),
			el('input', { 
				id: 'reg_first', className: 'form__input', name: 'firstName', placeholder: 'First name', required: true, minLength: 2 }),
			el('div', { 
				className: 'error-text', id: 'reg_first_error', style: 'display:none;' })
		),
		el('div', { 
			className: 'form-row' },
			el('label', { 
				className: 'form__label', htmlFor: 'reg_last' }, 'Last name'),
			el('input', { 
				id: 'reg_last', className: 'form__input', name: 'lastName', placeholder: 'Last name', required: true, minLength: 2 }),
			el('div', { 
				className: 'error-text', id: 'reg_last_error', style: 'display:none;' })
		),
		el('div', { 
			className: 'form-row' },
			el('label', { 
				className: 'form__label', htmlFor: 'reg_city' }, 'City'),
			el('input', { 
				id: 'reg_city', className: 'form__input', name: 'city', placeholder: 'City' })
		),
		el('div', { 
			className: 'form-row' },
			el('label', { 
				className: 'form__label', htmlFor: 'reg_region' }, 'Region'),
			el('input', { 
				id: 'reg_region', className: 'form__input', name: 'region', placeholder: 'Region' })
		),
		el('div', { 
			className: 'form-row' },
			el('label', { 
				className: 'form__label', htmlFor: 'reg_country' }, 'Country'),
			el('input', { 
				id: 'reg_country', className: 'form__input', name: 'country', placeholder: 'Country' })
		),
		el('div', { 
			className: 'form-row', style: 'grid-column: 1 / -1; display:flex; gap:8px; align-items:center;' },
			el('label', { 
				className: 'form__row', style: 'gap:6px; display:flex; align-items:center;' },
				el('input', { 
					className: 'form__checkbox', type: 'checkbox', name: 'showpass' }),
				'Show password'
			)
		),
		el('div', { 
			className: 'form-row', style: 'grid-column: 1 / -1; display:flex; justify-content:space-between; align-items:center;' },
			el('div', { 
				className: 'error-text', id: 'reg_error', style: 'display:none;' }),
			el('div', { 
				className: 'form-actions' },
				el('button', { 
					type: 'submit', className: 'btn btn-primary' }, 'Create account')
			)
		)
	);
	body.append(login, reg);
	card.append(tabs, body);
	layout.append(hero, card);
	wrap.appendChild(layout);
	container.appendChild(wrap);
	function showLogin() { 
		tabLogin.classList.add('auth-tab--active'); tabRegister.classList.remove('auth-tab--active'); login.style.display = 'grid'; reg.style.display = 'none'; 
	}
	function showRegister() { 
		tabRegister.classList.add('auth-tab--active'); tabLogin.classList.remove('auth-tab--active'); login.style.display = 'none'; reg.style.display = 'grid'; 
	}
	tabLogin.onclick = showLogin; tabRegister.onclick = showRegister;
	const loginPwd = login.querySelector('input[name="password"]');
	const loginShow = login.querySelector('input[name="showpass"]');
	if (loginShow) loginShow.addEventListener('change', () => { 
		loginPwd.type = loginShow.checked ? 'text' : 'password'; 
	});
	const loginBtn = login.querySelector('button[type="submit"]');
	function updateLoginValidity() { 
		loginBtn.disabled = !login.checkValidity(); 
	}
	login.addEventListener('input', updateLoginValidity);
	updateLoginValidity();
	function updateLoginErrors() {
		const u = login.querySelector('input[name="username"]');
		const p = login.querySelector('input[name="password"]');
		const ue = login.querySelector('#login_user_error');
		const pe = login.querySelector('#login_pass_error');
		if (!u.checkValidity()) { 
			ue.textContent = 'Username must be at least 3 characters'; ue.style.display = 'block'; }
		else { 
			ue.textContent = ''; ue.style.display = 'none'; }
		if (!p.checkValidity()) { 
			pe.textContent = 'Password must be at least 4 characters'; pe.style.display = 'block'; }
		else { 
			pe.textContent = ''; pe.style.display = 'none'; }
	}
	login.addEventListener('input', updateLoginErrors);
	updateLoginErrors();
	const regPwd = reg.querySelector('input[name="password"]');
	const regShow = reg.querySelector('input[name="showpass"]');
	if (regShow) regShow.addEventListener('change', () => { 
		regPwd.type = regShow.checked ? 'text' : 'password'; 
	});
	const regBtn = reg.querySelector('button[type="submit"]');
	function updateRegValidity() { regBtn.disabled = !reg.checkValidity(); }
	reg.addEventListener('input', updateRegValidity);
	updateRegValidity();
	function updateRegErrors() {
		const u = reg.querySelector('input[name="username"]');
		const p = reg.querySelector('input[name="password"]');
		const ue = reg.querySelector('#reg_user_error');
		const pe = reg.querySelector('#reg_pass_error');
		const f = reg.querySelector('input[name="firstName"]');
		const fe = reg.querySelector('#reg_first_error');
		const l = reg.querySelector('input[name="lastName"]');
		const le = reg.querySelector('#reg_last_error');
		if (!u.checkValidity()) { 
			ue.textContent = 'Username must be at least 3 characters'; ue.style.display = 'block'; }
		else { 
			ue.textContent = ''; ue.style.display = 'none'; }
		if (!p.checkValidity()) { 
			pe.textContent = 'Password must be at least 4 characters'; pe.style.display = 'block'; }
		else { 
			pe.textContent = ''; pe.style.display = 'none'; }
		if (!f.checkValidity()) { 
			fe.textContent = 'First name is required'; fe.style.display = 'block'; }
		else { 
			fe.textContent = ''; fe.style.display = 'none'; }
		if (!l.checkValidity()) { 
			le.textContent = 'Last name is required'; le.style.display = 'block'; }
		else { 
			le.textContent = ''; le.style.display = 'none'; }
	}
	reg.addEventListener('input', updateRegErrors);
	updateRegErrors();
	login.addEventListener('submit', async (e) => {
		e.preventDefault();
		const fd = new FormData(login);
		const errBox = login.querySelector('#login_error');
		errBox.style.display = 'none'; errBox.textContent = '';
		const prev = loginBtn.textContent; loginBtn.disabled = true; loginBtn.textContent = 'Logging in...';
		try {
			await loginUser({ 
				username: String(fd.get('username')), password: String(fd.get('password')), remember: !!fd.get('remember') 
			});
			const token = getToken();
			if (!token) {
				throw new Error('Token was not set after login');
			}
			clearCachedSession();
			showToast('Login successful! Redirecting...', 'success');
			window.location.replace('profile.html');
		} catch (err) {
			const msg = err?.message || 'Login failed';
			showToast(msg, 'error');
			errBox.textContent = msg; errBox.style.display = 'block';
		} finally {
			loginBtn.disabled = false; loginBtn.textContent = prev;
		}
	});
	reg.addEventListener('submit', async (e) => {
		e.preventDefault();
		const fd = new FormData(reg);
		const errBox = reg.querySelector('#reg_error');
		errBox.style.display = 'none'; errBox.textContent = '';
		const prev = regBtn.textContent; regBtn.disabled = true; regBtn.textContent = 'Creating...';
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
			showToast('Account created successfully!', 'success');
			await loginUser({ username: payload.username, password: payload.password, remember: true });
			const token = getToken();
			showToast('Logged in automatically! Redirecting...', 'success');
			clearCachedSession();
			setTimeout(() => {
				window.location.replace('profile.html');
			}, 1000);
		} catch (err) {
			const msg = err?.message || 'Register failed';
			showToast(msg, 'error');
			errBox.textContent = msg; errBox.style.display = 'block';
		} finally {
			regBtn.disabled = false; regBtn.textContent = prev;
		}
	});
	const first = login.querySelector('input[name="username"]');
	if (first) first.focus();
}
async function renderDashboard(container, session) {
	container.innerHTML = '';
	const shell = el('div', { 
		className: 'dashboard-shell' 
	});
	container.appendChild(shell);
	const profileDetails = await getMyProfile().catch(() => null);
	const profile = profileDetails?.profile || {};
	const fullNameParts = [profile.first_name, profile.last_name].filter(Boolean);
	const locationParts = [profile.city, profile.region, profile.country].filter(Boolean);
	const head = el('section', { 
		className: 'dashboard-card dashboard-card--header' 
	},
		el('span', { 
			className: 'eyebrow' }, 'Signed in'),
		el('div', { 
			className: 'dashboard-card__title' },
			el('span', {}, session.user.username),
			el('span', { 
				className: `badge ${session.user.is_admin ? 'badge--accent' : 'badge--outline'}` }, session.user.is_admin ? 'Admin' : 'Trader')
		),
		el('p', { 
			className: 'dashboard-card__subtitle' }, fullNameParts.length ? fullNameParts.join(' ') : 'Complete your profile to speed up auction approvals.'),
		(() => {
			const meta = el('div', { 
				className: 'dashboard-card__meta' 
			});
			meta.appendChild(el('span', {}, `User #${session.user.id}`));
			if (session.user.email) meta.appendChild(el('span', {}, `Email • ${session.user.email}`));
			if (locationParts.length) meta.appendChild(el('span', {}, `Location • ${locationParts.join(', ')}`));
			return meta;
		})(),
		(() => {
			const chips = el('div', { 
				className: 'stat-chips' 
			});
			chips.appendChild(el('span', { 
				className: 'chip chip--accent' }, session.user.is_admin ? 'Admin access' : 'Trader access'));
			if (profileDetails?.role) chips.appendChild(el('span', { 
				className: 'chip' }, `Role • ${profileDetails.role}`));
			if (profile.updated_at) chips.appendChild(el('span', { 
				className: 'chip' }, `Updated ${new Date(profile.updated_at).toLocaleString()}`));
			return chips;
		})(),
		(() => {
			const actions = el('div', { 
				className: 'dashboard-card__actions' 
			});
			const openProfile = el('a', {
				className: 'btn btn-primary', href: 'profile.html' }, 'Open profile');
			const logoutBtn = el('button', {
				className: 'btn btn-ghost',
				onclick: async () => { 
					setToken('');
					clearCachedSession();
					showToast('Logged out', 'info');
					await renderRoot(container, { forceRefresh: true });
				}
			}, 'Sign out');
			actions.append(openProfile, logoutBtn);
			if (!session.user.is_admin) {
				actions.appendChild(el('button', {
					className: 'btn btn-ghost',
					onclick: async () => {
						try {
							const res = await bootstrapAdmin();
							showToast(res.message || 'You now have admin access', 'success');
							clearCachedSession();
							await renderRoot(container, { forceRefresh: true });
						} catch (e) {
							showToast(e?.message || 'Bootstrap failed', 'error');
						}
					}
				}, 'Bootstrap admin'));
			}
			return actions;
		})()
	);
	shell.appendChild(head);
	const workspace = el('section', { 
		className: 'dashboard-card' 
	});
	workspace.append(
		el('div', { className: 'section-heading' },
			el('span', { 
				className: 'eyebrow' }, 'Control center'),
			el('h2', { 
				className: 'section-heading__title' }, 'Manage your exchange presence'),
			el('p', { 
				className: 'section-heading__meta' }, 'Keep credentials current, curate accounts, and prepare resources before each sealed auction.')
		)
	);
	const tabs = el('div', { 
		className: 'tabs dashboard-tabs' 
	});
	const content = el('div', { 
		className: 'tab-panel' 
	});
	workspace.append(tabs, content);
	shell.appendChild(workspace);
	const sections = [
		{ key: 'profile', label: 'Profile', render: renderProfileTab },
	];
	if (session.user.is_admin) {
		sections.push({ key: 'admin-tools', label: 'Admin tools', render: renderAdminTools });
	} else {
		sections.push(
			{ key: 'accounts', label: 'Accounts', render: renderAccounts },
			{ key: 'auctions', label: 'Auctions', render: renderAuctions },
			{ key: 'resources', label: 'Resources', render: renderResources },
		);
	}
	let active = 'profile';
	const tabEls = new Map();
	function setActive(key) {
		active = key;
		for (const [k, elTab] of tabEls.entries()) {
			if (k === key) elTab.classList.add('tab--active');
			else elTab.classList.remove('tab--active');
		}
		content.innerHTML = '';
		const section = sections.find(s => s.key === key);
		if (section) {
			const maybePromise = section.render(content);
			if (maybePromise && typeof maybePromise.then === 'function') {
				maybePromise.catch(err => {
					console.error(`Failed to render section ${key}`, err);
					content.textContent = 'Failed to load section.';
				});
			}
		}
	}

	sections.forEach(s => {
		const tabEl = el('div', { className: 'tab', onclick: () => setActive(s.key) }, s.label);
		tabEls.set(s.key, tabEl);
		tabs.appendChild(tabEl);
	});
	setActive(active);

	async function renderProfileTab(root) {
		root.innerHTML = '';
		const wrap = el('section', { className: 'form-section' });
		wrap.append(
			el('div', { className: 'section-heading' },
				el('span', { className: 'eyebrow' }, 'Identity'),
				el('h3', { className: 'section-heading__title' }, 'Personal details'),
				el('p', { className: 'section-heading__meta' }, 'Update your legal details to stay compliant with auction policy.')
			)
		);
		const status = el('span', { className: 'chip' }, 'Loading profile...');
		wrap.append(status);
		root.appendChild(wrap);
		try {
			const { role, profile } = await getMyProfile();
			status.remove();
			wrap.append(
				el('div', { className: 'stat-chips' },
					el('span', { className: 'chip chip--accent' }, `Role • ${role}`)
				)
			);
			const fieldConfigs = [
				{ name: 'firstName', label: 'First name', required: true, value: profile?.first_name || '', maxLength: 100 },
				{ name: 'lastName', label: 'Last name', required: true, value: profile?.last_name || '', maxLength: 100 },
			];
			if (role === 'trader') {
				fieldConfigs.push(
					{ name: 'city', label: 'City', required: false, value: profile?.city || '', maxLength: 128 },
					{ name: 'region', label: 'Region', required: false, value: profile?.region || '', maxLength: 128 },
					{ name: 'country', label: 'Country', required: false, value: profile?.country || '', maxLength: 128 }
				);
			}
			const form = el('form', { className: 'form-grid form-grid--two' });
			fieldConfigs.forEach(field => {
				form.append(
					el('label', { className: 'form__label' }, `${field.label}${field.required ? ' *' : ''}`),
					el('input', {
						className: 'form__input',
						name: field.name,
						required: !!field.required,
						value: field.value,
						maxLength: field.maxLength || undefined,
						placeholder: field.label
					})
				);
			});
			const submitRow = el('div', { className: 'form-actions' },
				el('button', { type: 'submit', className: 'btn btn-primary' }, 'Save profile')
			);
			form.appendChild(submitRow);
			wrap.appendChild(form);
			form.addEventListener('submit', async (e) => {
				e.preventDefault();
				const fd = new FormData(form);
				const payload = {};
				fieldConfigs.forEach(field => {
					const raw = fd.get(field.name);
					const val = typeof raw === 'string' ? raw.trim() : '';
					payload[field.name] = val;
				});
				try {
					await updateMyProfile(payload);
					showToast('Profile saved', 'success');
					await renderProfileTab(root);
				} catch (err) {
					showToast(err?.message || 'Profile update failed', 'error');
				}
			});
		} catch (err) {
			status.textContent = 'Failed to load profile';
			console.error(err);
		}
	}

	async function renderAdminTools(root) {
		root.innerHTML = '';
		const wrap = el('section', { className: 'form-section' });
		wrap.append(
			el('div', { className: 'section-heading' },
				el('span', { className: 'eyebrow' }, 'Operations'),
				el('h3', { className: 'section-heading__title' }, 'Administration workspace'),
				el('p', { className: 'section-heading__meta' }, 'Coordinate listings, approve participation, and supervise resource uploads without exposing trader-only tools.')
			)
		);
		wrap.append(
			el('div', { className: 'data-list' },
				el('div', { className: 'data-list__item' },
					el('span', { className: 'data-list__label' }, 'Inventory console'),
					el('span', { className: 'data-list__meta' }, 'Створюйте та оновлюйте лоти перед запуском аукціонів'),
					el('a', { className: 'btn btn-primary btn-compact', href: 'listing.html' }, 'Open inventory')
				),
				el('div', { className: 'data-list__item' },
					el('span', { className: 'data-list__label' }, 'Аукціонна панель'),
					el('span', { className: 'data-list__meta' }, 'Запускайте та закривайте вікна, погоджуйте учасників і переглядайте документи'),
					el('a', { className: 'btn btn-ghost btn-compact', href: 'admin.html' }, 'Open admin panel')
				),
				el('div', { className: 'data-list__item' },
					el('span', { className: 'data-list__label' }, 'Trader view'),
					el('span', { className: 'data-list__meta' }, 'Використовуйте сторінку аукціонів, щоб моніторити кліринг у режимі реального часу'),
					el('a', { className: 'btn btn-ghost btn-compact', href: 'auctions.html' }, 'View auctions')
				)
			)
		);
		const note = el('div', { className: 'callout' },
			el('strong', {}, 'Порада:'),
			el('span', {}, ' у цьому режимі приховано вкладки «Accounts», «Auctions», «Resources», щоб інтерфейс трейдерів залишався чистим.')
		);
		note.style.display = 'flex';
		note.style.flexDirection = 'column';
		note.style.gap = '6px';
		note.style.padding = '16px';
		note.style.border = '1px solid rgba(255,255,255,0.12)';
		note.style.borderRadius = '12px';
		note.style.background = 'rgba(255,255,255,0.04)';
		wrap.append(note);
		root.appendChild(wrap);
	}

	async function renderAccounts(root) {
		root.innerHTML = '';
		const wrap = el('section', { className: 'form-section' });
		wrap.append(
			el('div', { className: 'section-heading' },
				el('span', { className: 'eyebrow' }, 'Funding'),
				el('h3', { className: 'section-heading__title' }, 'Settlement accounts'),
				el('p', { className: 'section-heading__meta' }, 'Link banking accounts to allocate proceeds and deposits.')
			)
		);
		const list = el('div', { className: 'data-list' });
		list.textContent = 'Loading accounts...';
		wrap.appendChild(list);
		const form = el('form', { className: 'inline-form' },
			el('input', { className: 'field', name: 'acc', placeholder: 'Account number', required: true }),
			el('button', { className: 'btn btn-primary btn-compact', type: 'submit' }, 'Add account')
		);
		wrap.appendChild(form);
		root.appendChild(wrap);

		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			const fd = new FormData(form);
			const acc = String(fd.get('acc') || '').trim();
			if (!acc) return;
			try {
				await addAccount(acc);
				showToast('Account added', 'success');
				await refresh();
				form.reset();
			} catch (e) {
				showToast(e?.message || 'Add account failed', 'error');
			}
		});

		async function refresh() {
			try {
				const accounts = await listAccounts();
				if (!accounts.length) {
					list.textContent = 'No accounts yet — add one to join auctions.';
					return;
				}
				list.innerHTML = '';
				accounts.forEach(a => {
					list.appendChild(
						el('div', { className: 'data-list__item' },
							el('span', { className: 'data-list__label' }, `#${a.id} ${a.account_number}`),
							el('span', { className: 'data-list__meta' }, new Date(a.added_at).toLocaleString())
						)
					);
				});
			} catch {
				list.textContent = 'Failed to load accounts';
			}
		}
		await refresh();
	}

	async function renderAuctions(root) {
		root.innerHTML = '';
		const wrap = el('section', { className: 'form-section' });
		wrap.append(
			el('div', { className: 'section-heading' },
				el('span', { className: 'eyebrow' }, 'Auctions'),
				el('h3', { className: 'section-heading__title' }, 'Collecting windows'),
				el('p', { className: 'section-heading__meta' }, 'Join live auctions, place sealed orders, and watch clearing status.')
			)
		);
		const list = el('div', { className: 'stack-grid' });
		list.textContent = 'Loading auctions...';
		wrap.appendChild(list);
		root.appendChild(wrap);

		let cachedAccounts = [];
		try { cachedAccounts = await listAccounts(); } catch {}

		async function refresh() {
			try {
				const auctions = await listAuctions({ status: 'collecting' });
				if (!auctions.length) {
					list.textContent = 'No collecting auctions right now.';
					return;
				}
				list.innerHTML = '';
				for (const a of auctions) {
					const card = el('article', { className: 'stack-card' });
					const header = el('div', { className: 'stack-card__header' },
						el('strong', {}, `#${a.id} ${a.product}`),
						el('span', { className: 'pill pill--outline' }, a.type),
						el('span', { className: 'chip' }, `k = ${a.k_value}`)
					);
					if (a.window_start) header.appendChild(el('span', { className: 'chip' }, `Start • ${new Date(a.window_start).toLocaleString()}`));
					if (a.window_end) header.appendChild(el('span', { className: 'chip' }, `End • ${new Date(a.window_end).toLocaleString()}`));
					const statusChip = el('div', { className: 'stack-card__meta' }, 'Checking participation...');
					try {
						const st = await myParticipationStatus(a.id);
						statusChip.textContent = st?.status ? `Status • ${st.status}` : 'Status • not joined';
					} catch {
						statusChip.textContent = 'Status • unavailable';
					}

					const controls = el('div', { className: 'stack-card__actions' });
					const accSel = el('select', { className: 'field' }, el('option', { value: '' }, 'Choose account (optional)'));
					cachedAccounts.forEach(acc => accSel.appendChild(el('option', { value: String(acc.id) }, `#${acc.id} ${acc.account_number}`)));
					const joinBtn = el('button', { className: 'btn btn-primary btn-compact', type: 'button' }, 'Join auction');
					joinBtn.addEventListener('click', async () => {
						try {
							const val = accSel.value ? Number(accSel.value) : undefined;
							await joinAuction(a.id, val);
							showToast('Join submitted', 'success');
						} catch (e) {
							showToast(e?.message || 'Join failed', 'error');
						}
					});

					const orderForm = el('form', { className: 'inline-form' },
						el('select', { className: 'field', name: 'type' },
							el('option', { value: 'bid' }, 'bid'),
							el('option', { value: 'ask' }, 'ask')
						),
						el('input', { className: 'field', name: 'price', type: 'number', step: '0.000001', min: '0', placeholder: 'Price', required: true }),
						el('input', { className: 'field', name: 'quantity', type: 'number', step: '0.000001', min: '0', placeholder: 'Quantity', required: true }),
						el('button', { className: 'btn btn-ghost btn-compact', type: 'submit' }, 'Place sealed order')
					);
					orderForm.addEventListener('submit', async (e) => {
						e.preventDefault();
						const fd = new FormData(orderForm);
						const price = Number(fd.get('price'));
						const qty = Number(fd.get('quantity'));
						if (!(price > 0 && qty > 0)) { showToast('Enter positive price and quantity', 'error'); return; }
						try {
							await placeAuctionOrder(a.id, { type: String(fd.get('type')), price, quantity: qty });
							showToast('Order placed', 'success');
							orderForm.reset();
						} catch (e) {
							showToast(e?.message || 'Order failed', 'error');
						}
					});

					controls.append(accSel, joinBtn, orderForm);
					card.append(header, statusChip, controls);
					list.appendChild(card);
				}
			} catch {
				list.textContent = 'Failed to load auctions';
			}
		}
		await refresh();
	}

	async function renderResources(root) {
		root.innerHTML = '';
		const wrap = el('section', { className: 'form-section' });
		wrap.append(
			el('div', { className: 'section-heading' },
				el('span', { className: 'eyebrow' }, 'Resources'),
				el('h3', { className: 'section-heading__title' }, 'Inventory & documents'),
				el('p', { className: 'section-heading__meta' }, 'Track deposits, withdrawals, and upload inventory evidence for approval.')
			)
		);

		const resList = el('div', { className: 'data-list' });
		resList.textContent = 'Loading transactions...';
		wrap.appendChild(resList);

		const form = el('form', { className: 'inline-form' },
			el('select', { className: 'field', name: 'type' },
				el('option', { value: 'deposit' }, 'deposit'),
				el('option', { value: 'withdraw' }, 'withdraw'),
				el('option', { value: 'inventory_add' }, 'inventory_add'),
				el('option', { value: 'inventory_remove' }, 'inventory_remove'),
			),
			el('input', { className: 'field', name: 'quantity', type: 'number', step: '0.000001', min: '0', placeholder: 'Quantity', required: true }),
			el('input', { className: 'field', name: 'notes', placeholder: 'Notes (optional)' }),
			el('button', { className: 'btn btn-primary btn-compact', type: 'submit' }, 'Record movement')
		);
		wrap.appendChild(form);

		const docsHeading = el('div', { className: 'section-heading' },
			el('span', { className: 'eyebrow' }, 'Documents'),
			el('h3', { className: 'section-heading__title' }, 'Supporting files'),
			el('p', { className: 'section-heading__meta' }, 'Attach invoices, receipts, or custody certificates for compliance.')
		);
		wrap.appendChild(docsHeading);

		const docsList = el('div', { className: 'data-list' });
		docsList.textContent = 'Loading documents...';
		wrap.appendChild(docsList);

		const docForm = el('form', { className: 'inline-form' },
			el('input', { className: 'field', type: 'file', name: 'docFile', required: true, accept: '.pdf,.jpg,.jpeg,.png,.txt,.doc,.docx' }),
			el('input', { className: 'field', name: 'docNote', placeholder: 'Note (optional)' }),
			el('button', { className: 'btn btn-ghost btn-compact', type: 'submit' }, 'Upload document')
		);
		wrap.appendChild(docForm);
		root.appendChild(wrap);

		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			const fd = new FormData(form);
			const q = Number(fd.get('quantity'));
			if (!(q > 0)) { showToast('Enter positive quantity', 'error'); return; }
			try {
				await addResourceTransaction({ type: String(fd.get('type')), quantity: q, notes: String(fd.get('notes') || '') || undefined });
				showToast('Recorded', 'success');
				await refresh();
				form.reset();
			} catch (e) {
				showToast(e?.message || 'Failed to record', 'error');
			}
		});

		docForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const fileInput = docForm.querySelector('input[name="docFile"]');
			const noteInput = docForm.querySelector('input[name="docNote"]');
			const file = fileInput.files?.[0];
			if (!file) {
				showToast('Choose a document to upload', 'error');
				return;
			}
			try {
				await uploadResourceDocument({ file, note: noteInput.value.trim() });
				showToast('Document uploaded', 'success');
				fileInput.value = '';
				noteInput.value = '';
				await refreshDocs();
			} catch (err) {
				showToast(err?.message || 'Upload failed', 'error');
			}
		});

		async function refresh() {
			try {
				const rows = await listResourceTransactions();
				if (!rows.length) {
					resList.textContent = 'No transactions yet — record your first movement.';
					return;
				}
				resList.innerHTML = '';
				rows.forEach(r => resList.appendChild(
					el('div', { className: 'data-list__item' },
						el('span', { className: 'data-list__label' }, `${r.type} ${r.quantity}`),
						el('span', { className: 'data-list__meta' }, new Date(r.occurred_at).toLocaleString()),
						r.notes ? el('span', { className: 'chip' }, r.notes) : null
					)
				));
			} catch {
				resList.textContent = 'Failed to load';
			}
		}

		async function refreshDocs() {
			try {
				const docs = await listResourceDocuments();
				if (!docs.length) {
					docsList.textContent = 'No documents yet — upload supporting files.';
					return;
				}
				docsList.innerHTML = '';
				docs.forEach(doc => {
					const line = el('div', { className: 'data-list__item' },
						el('span', { className: 'data-list__label' }, doc.filename),
						doc.notes ? el('span', { className: 'chip' }, doc.notes) : null,
						doc.uploadedAt ? el('span', { className: 'data-list__meta' }, new Date(doc.uploadedAt).toLocaleString()) : null
					);
					const downloadUrl = doc.downloadUrl?.startsWith('http') ? doc.downloadUrl : `${window.location.origin.replace(/\/$/, '')}${doc.downloadUrl}`;
					const downloadBtn = el('a', { className: 'btn btn-ghost btn-compact', href: downloadUrl, target: '_blank', rel: 'noopener', download: doc.filename }, 'Download');
					line.appendChild(downloadBtn);
					docsList.appendChild(line);
				});
			} catch (err) {
				docsList.textContent = 'Failed to load documents';
				console.error(err);
			}
		}
		await refresh();
		await refreshDocs();
	}
}

async function renderRoot(container, options = {}) {
	let session = null;
	try {
		session = await initAccessControl({ forceRefresh: Boolean(options.forceRefresh) });
	} catch (err) {
		console.error('Failed to resolve session', err);
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
