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
	className: 'auth-hero__item'
}, text);

async function renderAuth(container) {
	container.innerHTML = '';
	const wrap = el('div', {
		className: 'auth-wrap'
	});
	const layout = el('div', {
		className: 'auth-layout'
	});
	const hero = el('section', {
		className: 'glass-panel auth-hero'
	},
		el('span', {
			className: 'badge badge--accent'
		}, 'Ласкаво просимо'),
		el('h2', {
			className: 'auth-hero__title'
		}, 'Торгуйте з впевненістю'),
		el('p', {
			className: 'auth-hero__subtitle'
		}, 'Створіть свій профіль, поповніть баланс та приєднуйтесь до закритих аукціонів з єдиної панелі керування.'),
		el('ul', {
			className: 'auth-hero__list'
		},
			heroBullet('Єдине сховище ресурсів та керування акаунтами'),
			heroBullet('Миттєві сповіщення після кожного клірингу'),
			heroBullet('Все під контролем')
		)
	);
	const card = el('section', {
		className: 'form-card'
	});
	const tabs = el('div', {
		className: 'auth-tabs'
	});
	const tabLogin = el('div', {
		className: 'auth-tab auth-tab--active'
	}, 'Вхід');
	const tabRegister = el('div', {
		className: 'auth-tab'
	}, 'Реєстрація');
	tabs.append(tabLogin, tabRegister);
	const body = el('div', {
		className: 'form-section'
	});
	const login = el('form', {
		className: 'form-grid auth-form',
		'aria-label': 'Форма входу'
	},
		el('div', { className: 'auth-form__header' },
			el('h3', { className: 'auth-form__title' }, 'Увійти'),
			el('p', { className: 'auth-form__subtitle', style: 'text-align:center; margin: 0 auto;' }, 'Отримайте доступ до панелі керування акаунтами та аукціонами.')
		),
		el('div', { className: 'form-row' },
			el('label', { className: 'form__label', htmlFor: 'login_username' }, 'Ім\'я користувача'),
			el('div', { className: 'input-group' },
				el('input', {
					id: 'login_username',
					className: 'form__input',
					name: 'username',
					placeholder: 'Ваше ім\'я користувача',
					required: true,
					minLength: 3,
					autocomplete: 'username'
				})
			),
			el('div', { className: 'error-text', id: 'login_user_error', style: 'display:none;' })
		),
		el('div', { className: 'form-row' },
			el('label', { className: 'form__label', htmlFor: 'login_password' }, 'Пароль'),
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
				el('span', {}, 'Показати пароль')
			),
			el('label', { className: 'form__row', style: 'display:flex; gap:8px; align-items:center;' },
				el('input', { className: 'form__checkbox', type: 'checkbox', name: 'remember', checked: true }),
				el('span', {}, 'Запам\'ятати мене')
			)
		),
		el('div', { className: 'form-row' },
			el('div', { className: 'error-text', id: 'login_error', style: 'display:none;' }),
			el('div', { className: 'form-actions' },
				el('button', { type: 'submit', className: 'btn btn-primary' }, 'Увійти')
			)
		)
	);

	const reg = el('form', {
		className: 'form-grid form-grid--two auth-form auth-form--register', style: 'display:none;', 'aria-label': 'Форма реєстрації'
	},
		el('div', {
			className: 'auth-form__header', style: 'grid-column: 1 / -1;'
		},
			el('h3', {
				className: 'auth-form__title'
			}, 'Створити акаунт'),
			el('p', {
				className: 'auth-form__subtitle'
			}, 'Зареєструйтеся, щоб брати участь в аукціонах, завантажувати документи та керувати коштами.')
		),
		el('div', {
			className: 'form-row'
		},
			el('label', {
				className: 'form__label', htmlFor: 'reg_username'
			}, 'Ім\'я користувача'),
			el('input', {
				id: 'reg_username', className: 'form__input', name: 'username', placeholder: 'Оберіть ім\'я користувача', required: true, minLength: 3, autocomplete: 'username'
			}),
			el('div', {
				className: 'error-text', id: 'reg_user_error', style: 'display:none;'
			})
		),
		el('div', {
			className: 'form-row'
		},
			el('label', {
				className: 'form__label', htmlFor: 'reg_email'
			}, 'Email (необов\'язково)'),
			el('input', {
				id: 'reg_email', className: 'form__input', name: 'email', placeholder: 'name@example.com', type: 'email', autocomplete: 'email'
			})
		),
		el('div', {
			className: 'form-row'
		},
			el('label', {
				className: 'form__label', htmlFor: 'reg_password'
			}, 'Пароль'),
			el('input', {
				id: 'reg_password', className: 'form__input', name: 'password', placeholder: 'Мінімум 4 символи', type: 'password', required: true, minLength: 4, autocomplete: 'new-password'
			}),
			el('div', {
				className: 'error-text', id: 'reg_pass_error', style: 'display:none;'
			}),
			el('div', {
				className: 'hint'
			}, 'Мінімум 4 символи')
		),
		el('div', {
			className: 'form-row'
		},
			el('label', {
				className: 'form__label', htmlFor: 'reg_first'
			}, 'Ім\'я'),
			el('input', {
				id: 'reg_first', className: 'form__input', name: 'firstName', placeholder: 'Ім\'я', required: true, minLength: 2
			}),
			el('div', {
				className: 'error-text', id: 'reg_first_error', style: 'display:none;'
			})
		),
		el('div', {
			className: 'form-row'
		},
			el('label', {
				className: 'form__label', htmlFor: 'reg_last'
			}, 'Прізвище'),
			el('input', {
				id: 'reg_last', className: 'form__input', name: 'lastName', placeholder: 'Прізвище', required: true, minLength: 2
			}),
			el('div', {
				className: 'error-text', id: 'reg_last_error', style: 'display:none;'
			})
		),
		el('div', {
			className: 'form-row'
		},
			el('label', {
				className: 'form__label', htmlFor: 'reg_city'
			}, 'Місто'),
			el('input', {
				id: 'reg_city', className: 'form__input', name: 'city', placeholder: 'Місто'
			})
		),
		el('div', {
			className: 'form-row'
		},
			el('label', {
				className: 'form__label', htmlFor: 'reg_region'
			}, 'Регіон'),
			el('input', {
				id: 'reg_region', className: 'form__input', name: 'region', placeholder: 'Регіон'
			})
		),
		el('div', {
			className: 'form-row'
		},
			el('label', {
				className: 'form__label', htmlFor: 'reg_country'
			}, 'Країна'),
			el('input', {
				id: 'reg_country', className: 'form__input', name: 'country', placeholder: 'Країна'
			})
		),
		el('div', {
			className: 'form-row', style: 'grid-column: 1 / -1; display:flex; gap:8px; align-items:center;'
		},
			el('label', {
				className: 'form__row', style: 'gap:6px; display:flex; align-items:center;'
			},
				el('input', {
					className: 'form__checkbox', type: 'checkbox', name: 'showpass'
				}),
				'Показати пароль'
			)
		),
		el('div', {
			className: 'form-row', style: 'grid-column: 1 / -1; display:flex; justify-content:space-between; align-items:center;'
		},
			el('div', {
				className: 'error-text', id: 'reg_error', style: 'display:none;'
			}),
			el('div', {
				className: 'form-actions'
			},
				el('button', {
					type: 'submit', className: 'btn btn-primary'
				}, 'Створити акаунт')
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
			ue.textContent = 'Ім\'я користувача має містити принаймні 3 символи'; ue.style.display = 'block';
		}
		else {
			ue.textContent = ''; ue.style.display = 'none';
		}
		if (!p.checkValidity()) {
			pe.textContent = 'Пароль має містити принаймні 4 символи'; pe.style.display = 'block';
		}
		else {
			pe.textContent = ''; pe.style.display = 'none';
		}
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
			ue.textContent = 'Ім\'я користувача має містити принаймні 3 символи'; ue.style.display = 'block';
		}
		else {
			ue.textContent = ''; ue.style.display = 'none';
		}
		if (!p.checkValidity()) {
			pe.textContent = 'Пароль має містити принаймні 4 символи'; pe.style.display = 'block';
		}
		else {
			pe.textContent = ''; pe.style.display = 'none';
		}
		if (!f.checkValidity()) {
			fe.textContent = 'Ім\'я є обов\'язковим'; fe.style.display = 'block';
		}
		else {
			fe.textContent = ''; fe.style.display = 'none';
		}
		if (!l.checkValidity()) {
			le.textContent = 'Прізвище є обов\'язковим'; le.style.display = 'block';
		}
		else {
			le.textContent = ''; le.style.display = 'none';
		}
	}
	reg.addEventListener('input', updateRegErrors);
	updateRegErrors();
	login.addEventListener('submit', async (e) => {
		e.preventDefault();
		const fd = new FormData(login);
		const errBox = login.querySelector('#login_error');
		errBox.style.display = 'none'; errBox.textContent = '';
		const prev = loginBtn.textContent; loginBtn.disabled = true; loginBtn.textContent = 'Входимо...';
		try {
			await loginUser({
				username: String(fd.get('username')), password: String(fd.get('password')), remember: !!fd.get('remember')
			});
			const token = getToken();
			if (!token) {
				throw new Error('Токен не встановлено після входу');
			}
			clearCachedSession();
			showToast('Вхід успішний! Переходимо...', 'success');
			window.location.replace('profile.html');
		} catch (err) {
			const msg = err?.message || 'Помилка входу';
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
		const prev = regBtn.textContent; regBtn.disabled = true; regBtn.textContent = 'Створюємо...';
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
			const token = getToken();
			showToast('Автовхід виконано! Переходимо...', 'success');
			clearCachedSession();
			setTimeout(() => {
				window.location.replace('profile.html');
			}, 1000);
		} catch (err) {
			const msg = err?.message || 'Помилка реєстрації';
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
			className: 'eyebrow'
		}, 'Увійшли'),
		el('div', {
			className: 'dashboard-card__title'
		},
			el('span', {}, session.user.username),
			el('span', {
				className: `badge ${session.user.is_admin ? 'badge--accent' : 'badge--outline'}`
			}, session.user.is_admin ? 'Адмін' : 'Трейдер')
		),
		el('p', {
			className: 'dashboard-card__subtitle'
		}, fullNameParts.length ? fullNameParts.join(' ') : 'Заповніть профіль, щоб прискорити схвалення на аукціонах.'),
		(() => {
			const meta = el('div', {
				className: 'dashboard-card__meta'
			});
			meta.appendChild(el('span', {}, `Користувач #${session.user.id}`));
			if (session.user.email) meta.appendChild(el('span', {}, `Email • ${session.user.email}`));
			if (locationParts.length) meta.appendChild(el('span', {}, `Локація • ${locationParts.join(', ')}`));
			return meta;
		})(),
		(() => {
			const chips = el('div', {
				className: 'stat-chips'
			});
			chips.appendChild(el('span', {
				className: 'chip chip--accent'
			}, session.user.is_admin ? 'Доступ адміна' : 'Доступ трейдера'));
			if (profileDetails?.role) chips.appendChild(el('span', {
				className: 'chip'
			}, `Роль • ${profileDetails.role}`));
			if (profile.updated_at) chips.appendChild(el('span', {
				className: 'chip'
			}, `Оновлено ${new Date(profile.updated_at).toLocaleString()}`));
			return chips;
		})(),
		(() => {
			const actions = el('div', {
				className: 'dashboard-card__actions'
			});
			const openProfile = el('a', {
				className: 'btn btn-primary', href: 'profile.html'
			}, 'Відкрити профіль');
			const logoutBtn = el('button', {
				className: 'btn btn-ghost',
				onclick: async () => {
					setToken('');
					clearCachedSession();
					showToast('Ви вийшли', 'info');
					await renderRoot(container, { forceRefresh: true });
				}
			}, 'Вийти');
			actions.append(openProfile, logoutBtn);
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
	const workspace = el('section', {
		className: 'dashboard-card'
	});
	workspace.append(
		el('div', { className: 'section-heading' },
			el('span', {
				className: 'eyebrow'
			}, 'Центр керування'),
			el('h2', {
				className: 'section-heading__title'
			}, 'Керуйте своєю присутністю на біржі'),
			el('p', {
				className: 'section-heading__meta'
			}, 'Підтримуйте дані в актуальному стані, керуйте акаунтами та готуйте ресурси перед кожним закритим аукціоном.')
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
		{ key: 'profile', label: 'Профіль', render: renderProfileTab },
	];
	if (session.user.is_admin) {
		sections.push({ key: 'admin-tools', label: 'Інструменти адміна', render: renderAdminTools });
	} else {
		sections.push(
			{ key: 'accounts', label: 'Акаунти', render: renderAccounts },
			{ key: 'auctions', label: 'Аукціони', render: renderAuctions },
			{ key: 'resources', label: 'Ресурси', render: renderResources },
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
					console.error(`Не вдалося відтворити розділ ${key}`, err);
					content.textContent = 'Не вдалося завантажити розділ.';
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
				el('span', { className: 'eyebrow' }, 'Особистість'),
				el('h3', { className: 'section-heading__title' }, 'Персональні дані'),
				el('p', { className: 'section-heading__meta' }, 'Оновіть свої юридичні дані, щоб відповідати політиці аукціону.')
			)
		);
		const status = el('span', { className: 'chip' }, 'Завантаження профілю...');
		wrap.append(status);
		root.appendChild(wrap);
		try {
			const { role, profile } = await getMyProfile();
			status.remove();
			wrap.append(
				el('div', { className: 'stat-chips' },
					el('span', { className: 'chip chip--accent' }, `Роль • ${role}`)
				)
			);
			const fieldConfigs = [
				{ name: 'firstName', label: 'Ім\'я', required: true, value: profile?.first_name || '', maxLength: 100 },
				{ name: 'lastName', label: 'Прізвище', required: true, value: profile?.last_name || '', maxLength: 100 },
			];
			if (role === 'trader') {
				fieldConfigs.push(
					{ name: 'city', label: 'Місто', required: false, value: profile?.city || '', maxLength: 128 },
					{ name: 'region', label: 'Регіон', required: false, value: profile?.region || '', maxLength: 128 },
					{ name: 'country', label: 'Країна', required: false, value: profile?.country || '', maxLength: 128 }
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
				el('button', { type: 'submit', className: 'btn btn-primary' }, 'Зберегти профіль')
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
					showToast('Профіль збережено', 'success');
					await renderProfileTab(root);
				} catch (err) {
					showToast(err?.message || 'Помилка оновлення профілю', 'error');
				}
			});
		} catch (err) {
			status.textContent = 'Не вдалося завантажити профіль';
			console.error(err);
		}
	}

	async function renderAdminTools(root) {
		root.innerHTML = '';
		const wrap = el('section', { className: 'form-section' });
		wrap.append(
			el('div', { className: 'section-heading' },
				el('span', { className: 'eyebrow' }, 'Операції'),
				el('h3', { className: 'section-heading__title' }, 'Робоча область адміністратора'),
				el('p', { className: 'section-heading__meta' }, 'Координуйте лоти, затверджуйте участь та контролюйте завантаження ресурсів без доступу до інструментів трейдера.')
			)
		);
		wrap.append(
			el('div', { className: 'data-list' },
				el('div', { className: 'data-list__item' },
					el('span', { className: 'data-list__label' }, 'Консоль інвентарю'),
					el('span', { className: 'data-list__meta' }, 'Створюйте та оновлюйте лоти перед запуском аукціонів'),
					el('a', { className: 'btn btn-primary btn-compact', href: 'listing.html' }, 'Відкрити інвентар')
				),
				el('div', { className: 'data-list__item' },
					el('span', { className: 'data-list__label' }, 'Аукціонна панель'),
					el('span', { className: 'data-list__meta' }, 'Запускайте та закривайте вікна, погоджуйте учасників і переглядайте документи'),
					el('a', { className: 'btn btn-ghost btn-compact', href: 'admin.html' }, 'Відкрити панель адміна')
				),
				el('div', { className: 'data-list__item' },
					el('span', { className: 'data-list__label' }, 'Вид трейдера'),
					el('span', { className: 'data-list__meta' }, 'Використовуйте сторінку аукціонів, щоб моніторити кліринг у режимі реального часу'),
					el('a', { className: 'btn btn-ghost btn-compact', href: 'auctions.html' }, 'Переглянути аукціони')
				)
			)
		);
		const note = el('div', { className: 'callout' },
			el('strong', {}, 'Порада:'),
			el('span', {}, ' у цьому режимі приховано вкладки «Акаунти», «Аукціони», «Ресурси», щоб інтерфейс трейдерів залишався чистим.')
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
				el('span', { className: 'eyebrow' }, 'Фінансування'),
				el('h3', { className: 'section-heading__title' }, 'Розрахункові рахунки'),
				el('p', { className: 'section-heading__meta' }, 'Прив\'яжіть банківські рахунки для розподілу надходжень та депозитів.')
			)
		);
		const list = el('div', { className: 'data-list' });
		list.textContent = 'Завантаження рахунків...';
		wrap.appendChild(list);
		const form = el('form', { className: 'inline-form' },
			el('input', { className: 'field', name: 'acc', placeholder: 'Номер рахунку', required: true }),
			el('button', { className: 'btn btn-primary btn-compact', type: 'submit' }, 'Додати рахунок')
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
				showToast('Рахунок додано', 'success');
				await refresh();
				form.reset();
			} catch (e) {
				showToast(e?.message || 'Не вдалося додати рахунок', 'error');
			}
		});

		async function refresh() {
			try {
				const accounts = await listAccounts();
				if (!accounts.length) {
					list.textContent = 'Рахунків ще немає — додайте один, щоб приєднатися до аукціонів.';
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
				list.textContent = 'Не вдалося завантажити рахунки';
			}
		}
		await refresh();
	}

	async function renderAuctions(root) {
		root.innerHTML = '';
		const wrap = el('section', { className: 'form-section' });
		wrap.append(
			el('div', { className: 'section-heading' },
				el('span', { className: 'eyebrow' }, 'Аукціони'),
				el('h3', { className: 'section-heading__title' }, 'Вікна збору заявок'),
				el('p', { className: 'section-heading__meta' }, 'Приєднуйтесь до активних аукціонів, розміщуйте закриті ордери та відстежуйте статус кліринга.')
			)
		);
		const list = el('div', { className: 'stack-grid' });
		list.textContent = 'Завантаження аукціонів...';
		wrap.appendChild(list);
		root.appendChild(wrap);

		let cachedAccounts = [];
		try { cachedAccounts = await listAccounts(); } catch { }

		async function refresh() {
			try {
				const auctions = await listAuctions({ status: 'collecting' });
				if (!auctions.length) {
					list.textContent = 'Зараз немає аукціонів зі збором заявок.';
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
					if (a.window_start) header.appendChild(el('span', { className: 'chip' }, `Початок • ${new Date(a.window_start).toLocaleString()}`));
					if (a.window_end) header.appendChild(el('span', { className: 'chip' }, `Кінець • ${new Date(a.window_end).toLocaleString()}`));
					const statusChip = el('div', { className: 'stack-card__meta' }, 'Перевірка участі...');
					try {
						const st = await myParticipationStatus(a.id);
						statusChip.textContent = st?.status ? `Статус • ${st.status}` : 'Статус • не приєднався';
					} catch {
						statusChip.textContent = 'Статус • недоступний';
					}

					const controls = el('div', { className: 'stack-card__actions' });
					const accSel = el('select', { className: 'field' }, el('option', { value: '' }, 'Оберіть рахунок (необов\'язково)'));
					cachedAccounts.forEach(acc => accSel.appendChild(el('option', { value: String(acc.id) }, `#${acc.id} ${acc.account_number}`)));
					if (!cachedAccounts.length) {
						controls.appendChild(el('span', { className: 'muted' }, 'Немає збережених рахунків — можна приєднатися без них або додати у вкладці «Акаунти».'));
					}
					const joinBtn = el('button', { className: 'btn btn-primary btn-compact', type: 'button' }, 'Приєднатися до аукціону');
					joinBtn.addEventListener('click', async () => {
						const prevLabel = joinBtn.textContent;
						joinBtn.disabled = true;
						joinBtn.textContent = 'Надсилаємо...';
						try {
							const val = accSel.value ? Number(accSel.value) : undefined;
							await joinAuction(a.id, val);
							showToast('Заявку подано', 'success');
							await refresh();
						} catch (e) {
							showToast(e?.message || 'Не вдалося приєднатися', 'error');
						} finally {
							if (joinBtn.isConnected) {
								joinBtn.disabled = false;
								joinBtn.textContent = prevLabel;
							}
						}
					});

					const orderForm = el('form', { className: 'inline-form' },
						el('select', { className: 'field', name: 'type' },
							el('option', { value: 'bid' }, 'купівля'),
							el('option', { value: 'ask' }, 'продаж')
						),
						el('input', { className: 'field', name: 'price', type: 'number', step: '0.000001', min: '0', placeholder: 'Ціна', required: true }),
						el('input', { className: 'field', name: 'quantity', type: 'number', step: '0.000001', min: '0', placeholder: 'Кількість', required: true }),
						el('button', { className: 'btn btn-ghost btn-compact', type: 'submit' }, 'Подати закритий ордер')
					);
					orderForm.addEventListener('submit', async (e) => {
						e.preventDefault();
						const fd = new FormData(orderForm);
						const price = Number(fd.get('price'));
						const qty = Number(fd.get('quantity'));
						if (!(price > 0 && qty > 0)) { showToast('Введіть додатні ціну та кількість', 'error'); return; }
						const submitBtn = orderForm.querySelector('button[type="submit"]');
						if (submitBtn) {
							submitBtn.disabled = true;
							submitBtn.textContent = 'Відправляємо...';
						}
						try {
							await placeAuctionOrder(a.id, { type: String(fd.get('type')), price, quantity: qty });
							showToast('Ордер розміщено', 'success');
							orderForm.reset();
							await refresh();
						} catch (e) {
							showToast(e?.message || 'Помилка ордера', 'error');
						} finally {
							if (submitBtn) {
								submitBtn.disabled = false;
								submitBtn.textContent = 'Подати закритий ордер';
							}
						}
					});

					controls.append(accSel, joinBtn, orderForm);
					card.append(header, statusChip, controls);
					list.appendChild(card);
				}
			} catch {
				list.textContent = 'Не вдалося завантажити аукціони';
			}
		}
		await refresh();
	}

	async function renderResources(root) {
		root.innerHTML = '';
		const wrap = el('section', { className: 'form-section' });
		wrap.append(
			el('div', { className: 'section-heading' },
				el('span', { className: 'eyebrow' }, 'Ресурси'),
				el('h3', { className: 'section-heading__title' }, 'Інвентар та документи'),
				el('p', { className: 'section-heading__meta' }, 'Відстежуйте депозити, виведення та завантажуйте докази інвентаризації для схвалення.')
			)
		);

		const resList = el('div', { className: 'data-list' });
		resList.textContent = 'Завантаження транзакцій...';
		wrap.appendChild(resList);

		const form = el('form', { className: 'inline-form' },
			el('select', { className: 'field', name: 'type' },
				el('option', { value: 'deposit' }, 'депозит'),
				el('option', { value: 'withdraw' }, 'виведення'),
				el('option', { value: 'inventory_add' }, 'додати інвентар'),
				el('option', { value: 'inventory_remove' }, 'вилучити інвентар'),
			),
			el('input', { className: 'field', name: 'quantity', type: 'number', step: '0.000001', min: '0', placeholder: 'Кількість', required: true }),
			el('input', { className: 'field', name: 'notes', placeholder: 'Нотатки (необов\'язково)' }),
			el('button', { className: 'btn btn-primary btn-compact', type: 'submit' }, 'Записати рух')
		);
		wrap.appendChild(form);

		const docsHeading = el('div', { className: 'section-heading' },
			el('span', { className: 'eyebrow' }, 'Документи'),
			el('h3', { className: 'section-heading__title' }, 'Підтверджуючі файли'),
			el('p', { className: 'section-heading__meta' }, 'Додайте рахунки, квитанції або сертифікати зберігання для відповідності.')
		);
		wrap.appendChild(docsHeading);

		const docsList = el('div', { className: 'data-list' });
		docsList.textContent = 'Завантаження документів...';
		wrap.appendChild(docsList);

		const docForm = el('form', { className: 'inline-form' },
			el('input', { className: 'field', type: 'file', name: 'docFile', required: true, accept: '.pdf,.jpg,.jpeg,.png,.txt,.doc,.docx' }),
			el('input', { className: 'field', name: 'docNote', placeholder: 'Нотатка (необов\'язково)' }),
			el('button', { className: 'btn btn-ghost btn-compact', type: 'submit' }, 'Завантажити документ')
		);
		wrap.appendChild(docForm);
		root.appendChild(wrap);

		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			const fd = new FormData(form);
			const q = Number(fd.get('quantity'));
			if (!(q > 0)) { showToast('Введіть додатну кількість', 'error'); return; }
			try {
				await addResourceTransaction({ type: String(fd.get('type')), quantity: q, notes: String(fd.get('notes') || '') || undefined });
				showToast('Записано', 'success');
				await refresh();
				form.reset();
			} catch (e) {
				showToast(e?.message || 'Не вдалося записати', 'error');
			}
		});

		docForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const fileInput = docForm.querySelector('input[name="docFile"]');
			const noteInput = docForm.querySelector('input[name="docNote"]');
			const file = fileInput.files?.[0];
			if (!file) {
				showToast('Оберіть документ для завантаження', 'error');
				return;
			}
			try {
				await uploadResourceDocument({ file, note: noteInput.value.trim() });
				showToast('Документ завантажено', 'success');
				fileInput.value = '';
				noteInput.value = '';
				await refreshDocs();
			} catch (err) {
				showToast(err?.message || 'Помилка завантаження', 'error');
			}
		});

		async function refresh() {
			try {
				const rows = await listResourceTransactions();
				if (!rows.length) {
					resList.textContent = 'Транзакцій ще немає — запишіть свій перший рух.';
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
				resList.textContent = 'Не вдалося завантажити';
			}
		}

		async function refreshDocs() {
			try {
				const docs = await listResourceDocuments();
				if (!docs.length) {
					docsList.textContent = 'Документів ще немає — завантажте підтверджуючі файли.';
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
					const downloadBtn = el('a', { className: 'btn btn-ghost btn-compact', href: downloadUrl, target: '_blank', rel: 'noopener', download: doc.filename }, 'Завантажити');
					line.appendChild(downloadBtn);
					docsList.appendChild(line);
				});
			} catch (err) {
				docsList.textContent = 'Не вдалося завантажити документи';
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
