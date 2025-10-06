import { getMyProfile, listAuctions, createAuction, clearAuction, closeAuction, listParticipantsAdmin, approveParticipant, listAuctionOrdersAdmin, listAuctionDocuments, listAdminUsers, promoteUser, demoteUser, authorizedFetch, adminWalletSummary, adminWalletAction, adminWalletTransactions } from '../api.js';
import { showToast } from '../ui/toast.js';
import { initAccessControl } from '../ui/session.js';

function el(tag, props = {}, ...children) {
	const e = document.createElement(tag);
	Object.assign(e, props);
	for (const c of children) {
		if (typeof c === 'string') e.appendChild(document.createTextNode(c));
		else if (c) e.appendChild(c);
	}
	return e;
}

let currentUser = null;
let walletSelectedUserId = null;

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

function formatNumber(value, { minimumFractionDigits = 0, maximumFractionDigits = 2 } = {}) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return '0';
	return numeric.toLocaleString('uk-UA', { minimumFractionDigits, maximumFractionDigits });
}

function metricTile(label, value, meta) {
	const tile = el('div', { className: 'metrics-tile' },
		el('span', { className: 'metrics-tile__value' }, value ?? '—'),
		el('span', { className: 'metrics-tile__label' }, label)
	);
	if (meta) {
		tile.appendChild(el('span', { className: 'metrics-tile__meta' }, meta));
	}
	return tile;
}

function auctionRow(a) {
	const row = el('article', { 
		className: 'stack-card' });
	const header = el('div', { 
		className: 'stack-card__header' },
		el('strong', {}, `#${a.id} ${a.product}`),
		el('span', { className: 'pill pill--outline' }, a.type),
		el('span', { className: 'chip' }, `k = ${a.k_value}`),
		el('span', { className: `chip ${a.status === 'collecting' ? 'chip--accent' : ''}` }, `Status • ${a.status}`)
	);
	const scheduleInfo = el('div', { className: 'stack-card__meta stack-card__meta--schedule' });
	scheduleInfo.append(
		el('span', {}, `Старт • ${a.window_start ? formatDateTime(a.window_start) : '—'}`),
		el('span', {}, `Кінець • ${a.window_end ? formatDateTime(a.window_end) : '—'}`),
		el('span', {}, `Створено • ${formatDateTime(a.created_at)}`)
	);
	const ordersInfo = el('div', { className: 'stack-card__meta' }, 'Loading orders…');
	const actions = el('div', { className: 'stack-card__actions' });
	const participantsWrap = el('div', { className: 'data-list', hidden: true });
	const docsWrap = el('div', { className: 'data-list', style: 'margin-top: 12px;', hidden: true });

	const viewBtn = el('button', { className: 'btn btn-ghost btn-compact', onclick: async () => {
		participantsWrap.hidden = false;
		participantsWrap.textContent = 'Loading participants…';
		try {
			const part = await listParticipantsAdmin(a.id);
			if (!part.length) {
				participantsWrap.textContent = 'No participants';
				return;
			}
			participantsWrap.innerHTML = '';
			part.forEach(p => {
				const line = el('div', { className: 'data-list__item' },
					el('span', { className: 'data-list__label' }, `#${p.id} trader ${p.trader_id}`),
					el('span', { className: 'chip' }, `Status • ${p.status}`)
				);
				if (p.status === 'pending') {
					line.appendChild(el('button', {
						className: 'btn btn-primary btn-compact',
						onclick: async () => {
							try {
								await approveParticipant(a.id, p.id);
								showToast('Approved', 'success');
								await viewBtn.onclick();
							} catch (e) {
								showToast(e?.message || 'Approve failed', 'error');
							}
						}
					}, 'Approve'));
				}
				participantsWrap.appendChild(line);
			});
		} catch (e) {
			participantsWrap.textContent = 'Failed to load participants';
		}
	}}, 'View participants');

	const clearBtn = el('button', { className: 'btn btn-primary btn-compact', onclick: async () => {
		if (!confirm('Clear this auction now?')) return;
		const res = await clearAuction(a.id);
		showToast(`Cleared. Price=${res.price ?? 'N/A'}`, 'success');
		await render();
	}}, 'Clear');

	const closeBtn = el('button', { className: 'btn btn-ghost btn-compact', onclick: async () => {
		if (!confirm('Close this auction?')) return;
		await closeAuction(a.id);
		showToast('Auction closed', 'success');
		await render();
	}}, 'Close');

	const docsBtn = el('button', { className: 'btn btn-ghost btn-compact', onclick: async () => {
		docsWrap.hidden = false;
		docsWrap.textContent = 'Loading documents…';
		try {
			const files = await listAuctionDocuments(a.id);
			if (!files.length) {
				docsWrap.textContent = 'No documents yet';
				return;
			}
			docsWrap.innerHTML = '';
			files.forEach(fname => {
				const line = el('div', { className: 'data-list__item' },
					el('span', { className: 'data-list__label' }, fname)
				);
				line.appendChild(el('button', {
					className: 'btn btn-ghost btn-compact',
					onclick: async () => {
						try {
							const res = await authorizedFetch(`${location.origin.replace(/\/$/, '')}/api/admin/auctions/${a.id}/documents/${encodeURIComponent(fname)}`);
							if (!res.ok) throw new Error(`HTTP ${res.status}`);
							const blob = await res.blob();
							const url = URL.createObjectURL(blob);
							const aTag = document.createElement('a');
							aTag.href = url;
							aTag.download = fname;
							document.body.appendChild(aTag);
							aTag.click();
							aTag.remove();
							URL.revokeObjectURL(url);
							showToast('Downloaded', 'success');
						} catch (e) {
							showToast(e?.message || 'Download failed', 'error');
						}
					}
				}, 'Download'));
				docsWrap.appendChild(line);
			});
		} catch (e) {
			docsWrap.textContent = 'Failed to load documents';
		}
	}}, 'Documents');

	const refreshOrdersInfo = async () => {
		try {
			const orders = await listAuctionOrdersAdmin(a.id);
			const bids = orders.filter(o => o.side === 'bid').length;
			const asks = orders.filter(o => o.side === 'ask').length;
			const reservedTotal = orders.reduce((sum, order) => sum + (Number(order.reserved_amount) || 0), 0);
			const clearedTotal = orders.reduce((sum, order) => sum + (Number(order.cleared_quantity) || 0), 0);
			ordersInfo.textContent = `Секретні заявки • ${orders.length} (bid ${bids} / ask ${asks}) — зарезервовано ${formatNumber(reservedTotal, { maximumFractionDigits: 4 })}, кліринг ${formatNumber(clearedTotal, { maximumFractionDigits: 4 })}`;
		} catch {
			ordersInfo.textContent = 'Не вдалося завантажити заявки';
		}
	};
	refreshOrdersInfo();

	actions.append(viewBtn, clearBtn, closeBtn, docsBtn);
	row.append(header, scheduleInfo, ordersInfo, actions, participantsWrap, docsWrap);
	return row;
}

async function render() {
	const main = document.querySelector('main.container');
	if (!main) return;
	main.innerHTML = '';

	let users = [];
	let auctions = [];
	let walletOverview = { users: [], totals: { available: 0, reserved: 0, total: 0 } };
	try {
		[users, auctions, walletOverview] = await Promise.all([
			listAdminUsers().catch((error) => {
				console.error('Failed to load users', error);
				return [];
			}),
			listAuctions().catch((error) => {
				console.error('Failed to load auctions', error);
				return [];
			}),
			adminWalletSummary().catch((error) => {
				console.error('Failed to load wallet overview', error);
				return { users: [], totals: { available: 0, reserved: 0, total: 0 } };
			}),
		]);
	} catch (error) {
		console.error('Control center fetch failed', error);
	}

	const adminCount = users.filter(u => u.is_admin).length;
	const traderCount = Math.max(0, users.length - adminCount);
	const totalAuctions = auctions.length;
	const collectingAuctions = auctions.filter(a => a.status === 'collecting');
	const clearedAuctions = auctions.filter(a => a.status === 'cleared');
	const closedAuctions = auctions.filter(a => a.status === 'closed');
	const upcomingStart = auctions
		.map(a => (a.window_start ? new Date(a.window_start) : null))
		.filter(date => date && !Number.isNaN(date.getTime()) && date > new Date())
		.sort((a, b) => a - b)[0] || null;

	const overviewCard = el('section', { className: 'dashboard-card dashboard-card--overview' });
	overviewCard.append(
		el('div', { className: 'section-heading' },
			el('span', { className: 'eyebrow' }, 'Control center'),
			el('h2', { className: 'section-heading__title' }, 'Operational snapshot'),
			el('p', { className: 'section-heading__meta' }, 'Слідкуйте за активними аукціонами, ролями команди та плануйте наступні вікна запуску.')
		),
		(() => {
			const grid = el('div', { className: 'metrics-grid' });
			grid.append(
				metricTile('Усього аукціонів', String(totalAuctions || 0)),
				metricTile('Збір заявок', String(collectingAuctions.length || 0), 'Активні вікна'),
				metricTile('Завершені', String(clearedAuctions.length || 0)),
				metricTile('Закриті', String(closedAuctions.length || 0)),
				metricTile('Адміністратори', String(adminCount || 0), traderCount ? `${traderCount} трейдерів` : 'Тільки адміністратори'),
				metricTile('Найближче вікно', upcomingStart ? formatDateTime(upcomingStart) : '—')
			);
			return grid;
		})()
	);
	main.appendChild(overviewCard);

	const walletCard = el('section', { className: 'dashboard-card dashboard-card--wallet' });
	walletCard.append(
		el('div', { className: 'section-heading' },
			el('span', { className: 'eyebrow' }, 'Wallets'),
			el('h2', { className: 'section-heading__title' }, 'Фінансовий облік користувачів'),
			el('p', { className: 'section-heading__meta' }, 'Поповнюйте чи поверніть кошти клієнтам та слідкуйте за балансами в режимі реального часу.')
		),
		(() => {
			const totals = walletOverview?.totals || { available: 0, reserved: 0, total: 0 };
			const grid = el('div', { className: 'metrics-grid' });
			grid.append(
				metricTile('Доступно', totals.available?.toFixed ? totals.available.toFixed(2) : String(totals.available || 0)),
				metricTile('Зарезервовано', totals.reserved?.toFixed ? totals.reserved.toFixed(2) : String(totals.reserved || 0)),
				metricTile('Сумарно', totals.total?.toFixed ? totals.total.toFixed(2) : String(totals.total || 0))
			);
			return grid;
		})()
	);

	const walletUsersList = el('div', { className: 'data-list wallet-users-list' });
	const walletUsers = walletOverview?.users || [];
	if (!walletUsers.length) {
		walletUsersList.textContent = 'Гаманці ще не створено. Поповніть баланс через кабінет трейдера.';
	} else {
		walletUsers.forEach((row) => {
			const available = Number(row.available ?? 0);
			const reserved = Number(row.reserved ?? 0);
			const total = available + reserved;
			const item = el('div', { className: 'data-list__item' },
				el('span', { className: 'data-list__label' }, `#${row.id} ${row.username || '—'}`),
				el('span', { className: 'chip' }, `Avail • ${available.toFixed(2)}`),
				el('span', { className: 'chip' }, `Res • ${reserved.toFixed(2)}`),
				el('span', { className: 'data-list__meta' }, `Total ${total.toFixed(2)}`)
			);
			walletUsersList.appendChild(item);
		});
	}
	walletCard.appendChild(walletUsersList);

	const walletControls = el('div', { className: 'wallet-controls' });
	const userSelect = el('select', { className: 'field wallet-controls__select' },
		el('option', { value: '' }, 'Оберіть користувача')
	);
	walletUsers.forEach((row) => {
		userSelect.appendChild(el('option', { value: String(row.id) }, `#${row.id} ${row.username}`));
	});
	if (walletUsers.length) {
		const exists = walletUsers.some((row) => Number(row.id) === Number(walletSelectedUserId));
		if (!exists) {
			walletSelectedUserId = walletUsers[0].id;
		}
		if (walletSelectedUserId) {
			userSelect.value = String(walletSelectedUserId);
		}
	}

	const selectRow = el('div', { className: 'wallet-controls__row' },
		el('label', { className: 'form-field', style: 'flex:1;' },
			el('span', { className: 'form-field__label' }, 'Користувач'),
			userSelect
		)
	);
	walletControls.appendChild(selectRow);

	const actionForm = el('form', { className: 'inline-form wallet-action-form' },
		el('select', { className: 'field', name: 'action' },
			el('option', { value: 'deposit' }, 'Поповнити'),
			el('option', { value: 'withdraw' }, 'Списати'),
			el('option', { value: 'reserve' }, 'Зарезервувати'),
			el('option', { value: 'release' }, 'Розморозити'),
			el('option', { value: 'spend' }, 'Списати резерв')
		),
		el('input', { className: 'field', name: 'amount', type: 'number', min: '0', step: '0.01', placeholder: 'Сума', required: true }),
		el('input', { className: 'field', name: 'note', placeholder: 'Нотатка (опційно)' }),
		el('button', { className: 'btn btn-primary btn-compact', type: 'submit' }, 'Застосувати')
	);
	walletControls.appendChild(actionForm);
	walletCard.appendChild(walletControls);

	const txList = el('div', { className: 'data-list wallet-transactions' });
	walletCard.appendChild(txList);
	main.appendChild(walletCard);

	async function refreshTransactions(userId) {
		if (!userId) {
			txList.textContent = 'Оберіть користувача, щоб побачити історію транзакцій.';
			return;
		}
		txList.textContent = 'Завантаження транзакцій…';
		try {
			const transactions = await adminWalletTransactions(userId, 50);
			if (!transactions.length) {
				txList.textContent = 'Поки що немає історії.';
				return;
			}
			txList.innerHTML = '';
			transactions.forEach((tx) => {
				const metaSpan = tx.meta ? el('span', { className: 'chip' }, JSON.stringify(tx.meta)) : null;
				const amountValue = Number(tx.amount ?? 0);
				const row = el('div', { className: 'data-list__item' },
					el('span', { className: 'data-list__label' }, `#${tx.id} ${tx.type}`),
					el('span', { className: 'chip' }, amountValue.toFixed(2)),
					el('span', { className: 'data-list__meta' }, tx.createdAt ? formatDateTime(tx.createdAt) : '—'),
					metaSpan
				);
				txList.appendChild(row);
			});
		} catch (error) {
			console.error('Failed to load wallet transactions', error);
			txList.textContent = 'Не вдалося завантажити транзакції.';
		}
	}

	if (walletSelectedUserId) {
		refreshTransactions(Number(walletSelectedUserId)).catch(() => {});
	} else {
		txList.textContent = 'Оберіть користувача, щоб побачити історію транзакцій.';
	}

	userSelect.addEventListener('change', () => {
		walletSelectedUserId = userSelect.value ? Number(userSelect.value) : null;
		refreshTransactions(walletSelectedUserId).catch(() => {});
	});

	actionForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const targetId = userSelect.value ? Number(userSelect.value) : null;
		if (!targetId) {
			showToast('Оберіть користувача для операції', 'error');
			return;
		}
		const fd = new FormData(actionForm);
		const action = String(fd.get('action') || 'deposit');
		const amountRaw = String(fd.get('amount') || '').trim();
		const note = String(fd.get('note') || '').trim() || undefined;
		const numericAmount = Number(amountRaw);
		if (!(numericAmount > 0)) {
			showToast('Вкажіть додатну суму', 'error');
			return;
		}
		try {
			await adminWalletAction(targetId, { action, amount: amountRaw, note });
			showToast('Операцію виконано', 'success');
			walletSelectedUserId = targetId;
			await render();
			return;
		} catch (error) {
			showToast(error?.message || 'Не вдалося виконати операцію', 'error');
		}
	});

	const quickActionsCard = el('section', { className: 'dashboard-card dashboard-card--actions' });
	quickActionsCard.append(
		el('div', { className: 'section-heading' },
			el('span', { className: 'eyebrow' }, 'Швидкі дії'),
			el('h2', { className: 'section-heading__title' }, 'Control center shortcuts'),
			el('p', { className: 'section-heading__meta' }, 'Стрибайте до основних робочих зон без перевантаження інтерфейсу.')
		),
		(() => {
			const list = el('div', { className: 'quick-actions-grid' });
			[
				{
					label: 'Інвентар',
					description: 'Створюйте та оновлюйте лоти перед запуском аукціонів.',
					href: 'listing.html',
					variant: 'primary',
				},
				{
					label: 'Публічна сторінка аукціонів',
					description: 'Перегляньте, як торги виглядають для трейдерів.',
					href: 'auctions.html',
					variant: 'ghost',
				},
				{
					label: 'Мій акаунт',
					description: 'Оновіть профіль чи змініть пароль.',
					href: 'account.html',
					variant: 'ghost',
				},
			].forEach((action) => {
				const link = el('a', {
					className: `quick-action quick-action--${action.variant}`,
					href: action.href
				},
					el('span', { className: 'quick-action__label' }, action.label),
					el('span', { className: 'quick-action__meta' }, action.description)
				);
				list.appendChild(link);
			});
			return list;
		})()
	);
	main.appendChild(quickActionsCard);

	const formCard = el('section', { className: 'dashboard-card dashboard-card--form' });
	formCard.append(
		el('div', { className: 'section-heading' },
			el('span', { className: 'eyebrow' }, 'Новий аукціон'),
			el('h2', { className: 'section-heading__title' }, 'Запустити вікно аукціону'),
			el('p', { className: 'section-heading__meta' }, 'Задайте ключові параметри — продукт, тип торгів і значення k. Дати можна додати пізніше.')
		)
	);
	const form = el('form', {
		id: 'create-auction',
		className: 'form-grid form-grid--compact'
	},
		el('label', { className: 'form-field' },
			el('span', { className: 'form-field__label' }, 'Продукт'),
			el('input', { className: 'form__input', placeholder: 'Наприклад: Пшениця 100т', name: 'product', required: true })
		),
		el('label', { className: 'form-field' },
			el('span', { className: 'form-field__label' }, 'Тип аукціону'),
			el('select', { className: 'form__input', name: 'type' },
				el('option', { value: 'open' }, 'open'),
				el('option', { value: 'closed' }, 'closed'),
			)
		),
		el('label', { className: 'form-field' },
			el('span', { className: 'form-field__label' }, 'k (0…1)'),
			el('input', { className: 'form__input', placeholder: '0.50', name: 'k', type: 'number', min: '0', max: '1', step: '0.01', value: '0.5' })
		),
		el('label', { className: 'form-field' },
			el('span', { className: 'form-field__label' }, 'Початок (опціонально)'),
			el('input', { className: 'form__input', placeholder: '2025-05-20T09:00', name: 'ws', type: 'datetime-local' })
		),
		el('label', { className: 'form-field' },
			el('span', { className: 'form-field__label' }, 'Завершення (опціонально)'),
			el('input', { className: 'form__input', placeholder: '2025-05-20T18:00', name: 'we', type: 'datetime-local' })
		),
		el('div', { className: 'form-actions' },
			el('button', { type: 'submit', className: 'btn btn-primary' }, 'Створити аукціон')
		)
	);
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const fd = new FormData(form);
		const product = String(fd.get('product') || '').trim();
		const type = String(fd.get('type') || 'open');
		const k = Number(fd.get('k'));
		const windowStart = String(fd.get('ws') || '').trim() || undefined;
		const windowEnd = String(fd.get('we') || '').trim() || undefined;
		if (!product || Number.isNaN(k)) {
			showToast('Вкажіть продукт та значення k', 'error');
			return;
		}
		try {
			await createAuction({ product, type, k, windowStart, windowEnd });
			form.reset();
			showToast('Аукціон створено', 'success');
			await render();
		} catch (error) {
			showToast(error?.message || 'Не вдалося створити аукціон', 'error');
		}
	});
	formCard.appendChild(form);
	main.appendChild(formCard);

	const usersSec = el('section', { className: 'dashboard-card dashboard-card--team' });
	usersSec.append(
		el('div', { className: 'section-heading' },
			el('span', { className: 'eyebrow' }, 'Команда'),
			el('h2', { className: 'section-heading__title' }, 'Адміністратори та трейдери'),
			el('p', { className: 'section-heading__meta' }, 'Керуйте правами доступу, щоб зберегти швидкість роботи аукціонів.')
		)
	);
	const usersList = el('div', { className: 'data-list team-list' });
	if (!users.length) {
		usersList.textContent = 'Користувачів не знайдено';
	} else {
		users.forEach((u) => {
			const isSelf = currentUser && Number(currentUser.id) === Number(u.id);
			const item = el('div', { className: 'data-list__item team-list__item' },
				el('div', { className: 'team-list__info' },
					el('span', { className: 'data-list__label' }, `#${u.id} ${u.username}${isSelf ? ' (ви)' : ''}`),
					u.email ? el('span', { className: 'team-list__meta' }, u.email) : null
				),
				u.is_admin ? el('span', { className: 'chip chip--accent' }, 'Admin') : el('span', { className: 'chip' }, 'Trader')
			);
			const actions = el('div', { className: 'team-list__actions' });
			if (!u.is_admin) {
				actions.appendChild(el('button', {
					className: 'btn btn-primary btn-compact',
					onclick: async () => {
						if (!confirm(`Підвищити ${u.username} до адміністратора?`)) return;
						try {
							await promoteUser(u.id);
							showToast('Користувача підвищено', 'success');
							await render();
						} catch (error) {
							showToast(error?.message || 'Не вдалося підвищити', 'error');
						}
					}
				}, 'Promote'));
			} else if (!isSelf) {
				actions.appendChild(el('button', {
					className: 'btn btn-ghost btn-compact',
					onclick: async () => {
						if (!confirm(`Зняти адмін-права у ${u.username}?`)) return;
						try {
							await demoteUser(u.id);
							showToast('Права адміністратора знято', 'success');
							await render();
						} catch (error) {
							showToast(error?.message || 'Не вдалося змінити роль', 'error');
						}
					}
				}, 'Demote'));
			} else {
				actions.appendChild(el('span', { className: 'chip' }, 'Це ви'));
			}
			item.appendChild(actions);
			usersList.appendChild(item);
		});
	}
	usersSec.appendChild(usersList);
	main.appendChild(usersSec);

	const auctionsCard = el('section', { className: 'dashboard-card dashboard-card--auctions' });
	auctionsCard.append(
		el('div', { className: 'section-heading' },
			el('span', { className: 'eyebrow' }, 'Аукціони'),
			el('h2', { className: 'section-heading__title' }, 'Управління вікнами'),
			el('p', { className: 'section-heading__meta' }, 'Переглядайте замовлення, затверджуйте учасників і завантажуйте документи.')
		),
		(() => {
			const chips = el('div', { className: 'status-chips' });
			chips.append(
				el('span', { className: 'chip chip--accent' }, `Collecting • ${collectingAuctions.length}`),
				el('span', { className: 'chip' }, `Cleared • ${clearedAuctions.length}`),
				el('span', { className: 'chip' }, `Closed • ${closedAuctions.length}`)
			);
			return chips;
		})()
	);
	const listWrap = el('div', { className: 'stack-grid' });
	if (!auctions.length) {
		listWrap.textContent = 'Аукціонів ще не створено';
	} else {
		auctions.forEach(a => listWrap.appendChild(auctionRow(a)));
	}
	auctionsCard.appendChild(listWrap);
	main.appendChild(auctionsCard);
}

document.addEventListener('DOMContentLoaded', async () => {
	const session = await initAccessControl({
		requireAdmin: true,
		redirectTo: 'account.html',
		onDenied: () => alert('Admin access required.'),
	});
	if (!session?.user) return;
	currentUser = session.user;
	// Populate admin profile summary
	try {
		const profileInfo = await getMyProfile().catch(() => null);
		const box = document.getElementById('admin-profile-summary');
		if (box) {
			box.innerHTML = '';
			const strong = document.createElement('strong');
			strong.textContent = session.user.username;
			const fragments = [
				document.createTextNode('Logged in as '),
				strong
			];
			const profile = profileInfo?.profile;
			if (profile) {
				const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
				if (fullName) {
					const nameSpan = document.createElement('span');
					nameSpan.className = 'muted';
					nameSpan.style.marginLeft = '8px';
					nameSpan.textContent = fullName;
					fragments.push(nameSpan);
				}
			}
			fragments.forEach(node => box.appendChild(node));
			const link = document.createElement('a');
			link.href = 'profile.html';
			link.className = 'btn';
			link.style.marginLeft = '8px';
			link.textContent = 'Open Profile';
			box.appendChild(link);
		}
	} catch {}
	await render();
});
