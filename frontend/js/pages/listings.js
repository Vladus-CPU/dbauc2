import {
    getListings,
    getListingSummary,
    getListingById,
    createListing,
    updateListing,
    patchListing,
    deleteListing,
    createListingAuction,
} from '../api.js';
import { showToast } from '../ui/toast.js';
import { initAccessControl } from '../ui/session.js';

const statusLabels = {
    draft: 'Чернетка',
    published: 'Опубліковано',
    archived: 'Архів',
};

const auctionStatusLabels = {
    collecting: 'Збір заявок',
    cleared: 'Кліринг завершено',
    closed: 'Закрито',
};

const statusChipClass = {
    draft: 'status-chip status-chip--draft',
    published: 'status-chip status-chip--published',
    archived: 'status-chip status-chip--archived',
};

const nextStatusConfig = {
    draft: { label: 'Опублікувати', status: 'published', tone: 'primary' },
    published: { label: 'Архівувати', status: 'archived', tone: 'ghost' },
    archived: { label: 'Повернути в чернетку', status: 'draft', tone: 'ghost' },
};

const state = {
    limit: 15,
    offset: 0,
    total: 0,
    items: [],
    summary: {
        total: null,
        published: 0,
        draft: 0,
        archived: 0,
    },
    filters: {
        search: '',
        status: 'all',
        sort: 'updated_desc',
    },
    selectedId: null,
    selected: null,
    loading: false,
    editorBusy: false,
};

let summaryRequestId = 0;

const els = {
    tableBody: document.getElementById('inventory-table-body'),
    total: document.getElementById('inventory-total'),
    pagination: document.getElementById('inventory-pagination'),
    paginationControls: document.querySelector('#inventory-pagination .inventory-pagination__controls'),
    statsPublished: document.getElementById('stat-published'),
    statsDraft: document.getElementById('stat-draft'),
    statsArchived: document.getElementById('stat-archived'),
    filtersForm: document.getElementById('inventory-filters'),
    searchInput: document.getElementById('filter-search'),
    statusSelect: document.getElementById('filter-status'),
    sortSelect: document.getElementById('filter-sort'),
    resetFilters: document.getElementById('filter-reset'),
    newListingBtn: document.getElementById('new-listing-btn'),
    refreshBtn: document.getElementById('refresh-listings'),
    editorForm: document.getElementById('listing-editor-form'),
    editorHeading: document.getElementById('editor-heading'),
    editorSubheading: document.getElementById('editor-subheading'),
    editorStatusBadge: document.getElementById('editor-status-badge'),
    editorReset: document.getElementById('editor-reset'),
    editorDelete: document.getElementById('editor-delete'),
    listingMeta: document.getElementById('listing-meta'),
    auctionPanel: document.getElementById('auction-panel'),
    auctionForm: document.getElementById('auction-from-listing-form'),
    auctionType: document.getElementById('auction-type'),
    auctionK: document.getElementById('auction-k'),
    auctionWindowStart: document.getElementById('auction-window-start'),
    auctionWindowEnd: document.getElementById('auction-window-end'),
    auctionPublish: document.getElementById('auction-publish'),
    auctionStatus: document.getElementById('listing-last-auction'),
    titleInput: document.getElementById('listing-title'),
    startingBidInput: document.getElementById('listing-starting-bid'),
    unitInput: document.getElementById('listing-unit'),
    baseQuantityInput: document.getElementById('listing-base-quantity'),
    statusInput: document.getElementById('listing-status'),
    imageInput: document.getElementById('listing-image'),
    descriptionInput: document.getElementById('listing-description'),
    listingIdInput: document.getElementById('listing-id'),
};

function formatCurrency(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return '—';
    }
    return `₴${Number(value).toFixed(2)}`;
}

function formatQuantity(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return '—';
    }
    return Number(value).toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDateTime(value) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
    } catch (error) {
        return String(value);
    }
}

function debounce(fn, wait = 350) {
    let timer = null;
    return (...args) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

function setTableLoading(isLoading) {
    if (!els.tableBody) return;
    if (isLoading) {
        els.tableBody.innerHTML = '<tr><td colspan="5" class="inventory-empty">Завантаження…</td></tr>';
    }
}

function getStatusChip(status) {
    const span = document.createElement('span');
    span.className = statusChipClass[status] || statusChipClass.draft;
    span.textContent = statusLabels[status] || status;
    return span;
}

function renderTable() {
    if (!els.tableBody) return;
    const rows = state.items;
    if (!rows.length) {
        els.tableBody.innerHTML = '<tr><td colspan="5" class="inventory-empty">Нічого не знайдено за вибраними фільтрами.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    rows.forEach((item) => {
        const tr = document.createElement('tr');
        tr.dataset.id = String(item.id);
        if (state.selectedId === item.id) {
            tr.classList.add('is-selected');
        }

        // Title column
        const titleTd = document.createElement('td');
        const titleWrap = document.createElement('div');
        titleWrap.className = 'inventory-title';

        const titleName = document.createElement('div');
        titleName.className = 'inventory-title__name';
        titleName.textContent = item.title || `Лот #${item.id}`;
        titleWrap.appendChild(titleName);

        const meta = document.createElement('div');
        meta.className = 'inventory-title__meta';
        meta.appendChild(getStatusChip(item.status));
        if (item.ownerUsername) {
            const ownerSpan = document.createElement('span');
            ownerSpan.textContent = `Автор: ${item.ownerUsername}`;
            meta.appendChild(ownerSpan);
        }
        if (item.updatedAt) {
            const updatedSpan = document.createElement('span');
            updatedSpan.textContent = `Оновлено: ${formatDateTime(item.updatedAt)}`;
            meta.appendChild(updatedSpan);
        }
        titleWrap.appendChild(meta);
        titleTd.appendChild(titleWrap);

        // Price column
        const priceTd = document.createElement('td');
        priceTd.innerHTML = `
            <div>Старт: <strong>${formatCurrency(item.startingBid)}</strong></div>
            <div>Поточна: <strong>${formatCurrency(item.currentBid)}</strong></div>
        `;

        // Quantity column
        const qtyTd = document.createElement('td');
        const baseLines = [];
        baseLines.push(`<div>Одиниця: <strong>${item.unit || '—'}</strong></div>`);
        baseLines.push(`<div>База: <strong>${formatQuantity(item.baseQuantity)}</strong></div>`);
        qtyTd.innerHTML = baseLines.join('');

        // Auctions column
        const auctionsTd = document.createElement('td');
        const countLine = document.createElement('div');
        countLine.textContent = `К-сть: ${item.auctionCount || 0}`;
        auctionsTd.appendChild(countLine);
        if (item.lastAuction && item.lastAuction.id) {
            const lastLine = document.createElement('div');
            const link = document.createElement('a');
            link.href = `auction.html?id=${item.lastAuction.id}`;
            link.textContent = `#${item.lastAuction.id} · ${auctionStatusLabels[item.lastAuction.status] || item.lastAuction.status || ''}`;
            link.className = 'inventory-link';
            lastLine.appendChild(link);
            const time = document.createElement('small');
            time.style.display = 'block';
            time.style.color = 'var(--text-muted)';
            time.textContent = formatDateTime(item.lastAuction.createdAt);
            lastLine.appendChild(time);
            auctionsTd.appendChild(lastLine);
        } else {
            const noneLine = document.createElement('div');
            noneLine.textContent = 'Аукціони відсутні';
            noneLine.style.color = 'var(--text-muted)';
            auctionsTd.appendChild(noneLine);
        }

        // Actions column
        const actionsTd = document.createElement('td');
        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'inventory-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-ghost';
        editBtn.dataset.action = 'edit';
        editBtn.textContent = 'Редагувати';
        actionsWrap.appendChild(editBtn);

        const statusConfig = nextStatusConfig[item.status] || nextStatusConfig.draft;
        const statusBtn = document.createElement('button');
        statusBtn.type = 'button';
        statusBtn.dataset.action = 'status';
        statusBtn.dataset.nextStatus = statusConfig.status;
        statusBtn.className = statusConfig.tone === 'primary' ? 'btn btn-primary' : 'btn btn-ghost';
        statusBtn.textContent = statusConfig.label;
        actionsWrap.appendChild(statusBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.dataset.action = 'delete';
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.textContent = 'Видалити';
        actionsWrap.appendChild(deleteBtn);

        actionsTd.appendChild(actionsWrap);

        tr.append(titleTd, priceTd, qtyTd, auctionsTd, actionsTd);
        fragment.appendChild(tr);
    });

    els.tableBody.replaceChildren(fragment);
}

function renderPagination() {
    if (!els.pagination || !els.paginationControls) return;
    const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
    const currentPage = Math.floor(state.offset / state.limit) + 1;
    const rangeStart = state.total === 0 ? 0 : state.offset + 1;
    const rangeEnd = Math.min(state.offset + state.limit, state.total);

    const summary = els.pagination.querySelector('span');
    if (summary) {
        summary.textContent = state.total
            ? `Показано ${rangeStart}–${rangeEnd} з ${state.total}`
            : 'Немає даних';
    }

    els.paginationControls.innerHTML = '';
    if (totalPages <= 1) {
        return;
    }

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.dataset.direction = 'prev';
    prevBtn.textContent = '←';
    prevBtn.disabled = currentPage <= 1;
    els.paginationControls.appendChild(prevBtn);

    const info = document.createElement('span');
    info.textContent = `${currentPage}/${totalPages}`;
    info.style.alignSelf = 'center';
    els.paginationControls.appendChild(info);

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.dataset.direction = 'next';
    nextBtn.textContent = '→';
    nextBtn.disabled = currentPage >= totalPages;
    els.paginationControls.appendChild(nextBtn);
}

function updateInventorySummary() {
    if (!els.total) return;
    const total = typeof state.summary?.total === 'number' ? state.summary.total : state.total;
    els.total.textContent = `Всього: ${total ?? 0}`;
}

function applyInventorySummary(summary) {
    if (!summary) {
        return;
    }
    const published = summary.published ?? summary?.byStatus?.published ?? 0;
    const draft = summary.draft ?? summary?.byStatus?.draft ?? 0;
    const archived = summary.archived ?? summary?.byStatus?.archived ?? 0;
    const total = summary.total ?? published + draft + archived;

    state.summary = {
        total,
        published,
        draft,
        archived,
    };

    if (els.statsPublished) {
        els.statsPublished.textContent = published;
    }
    if (els.statsDraft) {
        els.statsDraft.textContent = draft;
    }
    if (els.statsArchived) {
        els.statsArchived.textContent = archived;
    }
    updateInventorySummary();
}

async function refreshInventorySummary() {
    const requestId = ++summaryRequestId;
    state.summary.total = null;
    if (els.statsPublished) {
        els.statsPublished.textContent = '—';
    }
    if (els.statsDraft) {
        els.statsDraft.textContent = '—';
    }
    if (els.statsArchived) {
        els.statsArchived.textContent = '—';
    }
    const params = {};
    const search = state.filters.search?.trim();
    if (search) {
        params.search = search;
    }
    if (state.filters.status && state.filters.status !== 'all') {
        params.status = state.filters.status;
    }
    try {
        const summary = await getListingSummary(params);
        if (requestId !== summaryRequestId) {
            return;
        }
        applyInventorySummary(summary);
    } catch (error) {
        if (requestId === summaryRequestId) {
            console.error('Failed to load listing summary', error);
            const fallbackCounts = state.items.reduce((acc, item) => {
                const status = item.status || 'draft';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});
            applyInventorySummary({
                total: state.total,
                published: fallbackCounts.published || 0,
                draft: fallbackCounts.draft || 0,
                archived: fallbackCounts.archived || 0,
            });
        }
    }
}

function highlightSelectedRow() {
    if (!els.tableBody) return;
    for (const row of els.tableBody.querySelectorAll('tr[data-id]')) {
        row.classList.toggle('is-selected', Number(row.dataset.id) === state.selectedId);
    }
}

function setEditorDisabled(disabled) {
    if (!els.editorForm) return;
    Array.from(els.editorForm.elements).forEach((el) => {
        if (el === els.editorDelete) return;
        el.disabled = disabled;
    });
    if (els.editorReset) {
        els.editorReset.disabled = disabled;
    }
    if (els.editorDelete) {
        els.editorDelete.disabled = disabled || !state.selectedId;
    }
}

function setAuctionPanelEnabled(enabled) {
    if (!els.auctionForm) return;
    Array.from(els.auctionForm.elements).forEach((el) => {
        el.disabled = !enabled;
    });
    if (!enabled) {
        els.auctionStatus.textContent = 'Оберіть лот, щоб запустити аукціон.';
    }
}

function updateEditorHeader(mode = 'new', listing = null) {
    if (!els.editorHeading || !els.editorSubheading) return;
    if (mode === 'edit' && listing) {
        els.editorHeading.textContent = `Редагування: ${listing.title || `Лот #${listing.id}`}`;
        els.editorSubheading.textContent = `ID: ${listing.id}. Оновлено ${formatDateTime(listing.updatedAt)}.`;
    } else {
        els.editorHeading.textContent = 'Новий лот';
        els.editorSubheading.textContent = 'Створіть нову позицію або оберіть існуючу зі списку ліворуч.';
    }
}

function updateEditorStatusBadge(listing) {
    if (!els.editorStatusBadge) return;
    els.editorStatusBadge.innerHTML = '';
    if (!listing) return;
    const chip = getStatusChip(listing.status);
    els.editorStatusBadge.appendChild(chip);
    if (listing.id) {
        const idTag = document.createElement('span');
        idTag.style.color = 'var(--text-muted)';
        idTag.textContent = `#${listing.id}`;
        els.editorStatusBadge.appendChild(idTag);
    }
}

function updateMeta(listing) {
    if (!els.listingMeta) return;
    if (!listing) {
        els.listingMeta.innerHTML = '<em>Оберіть лот, щоб побачити деталі.</em>';
        return;
    }
    const lines = [];
    lines.push(`<strong>ID:</strong> ${listing.id}`);
    if (listing.ownerUsername) {
        lines.push(`<strong>Автор:</strong> ${listing.ownerUsername}`);
    }
    lines.push(`<strong>Створено:</strong> ${formatDateTime(listing.createdAt)}`);
    lines.push(`<strong>Оновлено:</strong> ${formatDateTime(listing.updatedAt)}`);
    els.listingMeta.innerHTML = lines.map((line) => `<div>${line}</div>`).join('');
}

function updateAuctionDetails(listing) {
    if (!els.auctionStatus) return;
    if (!listing) {
        setAuctionPanelEnabled(false);
        return;
    }
    setAuctionPanelEnabled(true);
    if (listing.lastAuction && listing.lastAuction.id) {
        const { id, status, createdAt } = listing.lastAuction;
        const statusLabel = auctionStatusLabels[status] || status || '';
        els.auctionStatus.innerHTML = `Останній аукціон: <a href="auction.html?id=${id}">#${id}</a> (${statusLabel}) — ${formatDateTime(createdAt)}`;
    } else {
        els.auctionStatus.textContent = 'Для цього лоту ще не запускали аукціони.';
    }
}

function resetEditorForm() {
    if (!els.editorForm) return;
    els.editorForm.reset();
    if (els.listingIdInput) els.listingIdInput.value = '';
    if (els.statusInput) els.statusInput.value = 'draft';
    if (els.auctionPublish) els.auctionPublish.checked = true;
    if (els.auctionType) els.auctionType.value = 'open';
    if (els.auctionK) els.auctionK.value = '0.5';
    state.selectedId = null;
    state.selected = null;
    updateEditorHeader('new');
    updateEditorStatusBadge(null);
    updateMeta(null);
    updateAuctionDetails(null);
    highlightSelectedRow();
    if (els.editorDelete) {
        els.editorDelete.disabled = true;
    }
}

async function loadListings({ preserveSelection = true } = {}) {
    if (!els.tableBody) return;
    state.loading = true;
    setTableLoading(true);
    const summaryPromise = refreshInventorySummary();
    try {
        const result = await getListings({
            detailed: true,
            search: state.filters.search || undefined,
            status: state.filters.status !== 'all' ? state.filters.status : undefined,
            sort: state.filters.sort,
            limit: state.limit,
            offset: state.offset,
        });
        state.items = Array.isArray(result.items) ? result.items : Array.isArray(result) ? result : [];
        state.total = typeof result.total === 'number' ? result.total : state.items.length;
        renderTable();
        renderPagination();
        updateInventorySummary();
        if (!preserveSelection) {
            state.selectedId = null;
            state.selected = null;
            resetEditorForm();
        } else {
            highlightSelectedRow();
        }
    } catch (error) {
        console.error('Failed to load listings', error);
        showToast(error?.message || 'Не вдалося завантажити лоти', 'error');
        els.tableBody.innerHTML = '<tr><td colspan="5" class="inventory-empty">Сталася помилка при завантаженні.</td></tr>';
    } finally {
        state.loading = false;
    }
}

async function selectListing(listingId, { autoScroll = false } = {}) {
    if (!listingId) return;
    state.editorBusy = true;
    setEditorDisabled(true);
    try {
        const detail = await getListingById(listingId);
        state.selectedId = detail.id;
        state.selected = detail;
        if (els.listingIdInput) els.listingIdInput.value = detail.id;
        els.titleInput.value = detail.title || '';
        els.startingBidInput.value = detail.startingBid ?? '';
        els.unitInput.value = detail.unit || '';
        els.baseQuantityInput.value = detail.baseQuantity ?? '';
        els.statusInput.value = detail.status || 'draft';
        els.imageInput.value = detail.image || '';
        els.descriptionInput.value = detail.description || '';
        updateEditorHeader('edit', detail);
        updateEditorStatusBadge(detail);
        updateMeta(detail);
        updateAuctionDetails(detail);
        if (els.editorDelete) {
            els.editorDelete.disabled = false;
        }
        highlightSelectedRow();
        if (autoScroll) {
            els.editorForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } catch (error) {
        console.error('Failed to load listing', error);
        showToast(error?.message || 'Не вдалося завантажити лот', 'error');
    } finally {
        state.editorBusy = false;
        setEditorDisabled(false);
    }
}

async function handleEditorSubmit(event) {
    event.preventDefault();
    if (!els.editorForm) return;

    const title = els.titleInput.value.trim();
    const unit = els.unitInput.value.trim();
    const startingBid = Number(els.startingBidInput.value);
    const baseQuantityValue = els.baseQuantityInput.value.trim();
    const baseQuantity = baseQuantityValue ? Number(baseQuantityValue) : undefined;
    const status = els.statusInput.value;
    const image = els.imageInput.value.trim();
    const description = els.descriptionInput.value.trim();

    if (!title || !unit || Number.isNaN(startingBid) || startingBid < 0) {
        showToast('Заповніть назву, одиницю та коректну стартову ціну', 'error');
        return;
    }
    if (baseQuantity !== undefined && (Number.isNaN(baseQuantity) || baseQuantity < 0)) {
        showToast('Базовий обсяг має бути невід’ємним числом', 'error');
        return;
    }

    const payload = {
        title,
        unit,
        startingBid,
        status,
        description: description || undefined,
        image: image || undefined,
    };
    if (baseQuantityValue) payload.baseQuantity = baseQuantity;

    state.editorBusy = true;
    setEditorDisabled(true);
    try {
        let saved;
        if (state.selectedId) {
            saved = await updateListing(state.selectedId, payload);
            showToast('Лот оновлено', 'success');
        } else {
            saved = await createListing(payload);
            showToast('Лот створено', 'success');
            state.selectedId = saved.id;
        }
        await loadListings({ preserveSelection: true });
        if (saved?.id) {
            await selectListing(saved.id);
        } else if (state.selectedId) {
            await selectListing(state.selectedId);
        }
    } catch (error) {
        console.error('Save listing failed', error);
        showToast(error?.message || 'Не вдалося зберегти лот', 'error');
    } finally {
        state.editorBusy = false;
        setEditorDisabled(false);
    }
}

async function handleStatusChange(listingId, nextStatus) {
    if (!listingId || !nextStatus) return;
    try {
        await patchListing(listingId, { status: nextStatus });
        showToast('Статус оновлено', 'success');
        await loadListings({ preserveSelection: true });
        if (state.selectedId === listingId) {
            await selectListing(listingId);
        }
    } catch (error) {
        console.error('Status update failed', error);
        showToast(error?.message || 'Не вдалося змінити статус', 'error');
    }
}

async function handleDelete(listingId) {
    if (!listingId) return;
    const confirmed = window.confirm('Видалити цей лот? Цю дію не можна скасувати.');
    if (!confirmed) return;
    try {
        await deleteListing(listingId);
        showToast('Лот видалено', 'success');
        if (state.selectedId === listingId) {
            resetEditorForm();
        }
        await loadListings({ preserveSelection: false });
    } catch (error) {
        console.error('Delete listing failed', error);
        showToast(error?.message || 'Не вдалося видалити лот', 'error');
    }
}

function normalizeDateInputValue(value) {
    if (!value) return undefined;
    if (value.length === 16) {
        return `${value}:00`;
    }
    return value;
}

async function handleCreateAuction(event) {
    event.preventDefault();
    if (!state.selectedId) {
        showToast('Оберіть лот перед створенням аукціону', 'info');
        return;
    }
    const kValue = Number(els.auctionK.value);
    if (Number.isNaN(kValue) || kValue < 0 || kValue > 1) {
        showToast('k має бути числом від 0 до 1', 'error');
        return;
    }
    const payload = {
        type: els.auctionType.value,
        k: kValue,
        windowStart: normalizeDateInputValue(els.auctionWindowStart.value),
        windowEnd: normalizeDateInputValue(els.auctionWindowEnd.value),
        publishListing: Boolean(els.auctionPublish.checked),
    };
    try {
        await createListingAuction(state.selectedId, payload);
        showToast('Аукціон створено', 'success');
        await loadListings({ preserveSelection: true });
        await selectListing(state.selectedId);
    } catch (error) {
        console.error('Create auction failed', error);
        showToast(error?.message || 'Не вдалося створити аукціон', 'error');
    }
}

function handleTableClick(event) {
    const target = event.target;
    const row = target.closest('tr[data-id]');
    if (!row) return;
    const listingId = Number(row.dataset.id);
    if (Number.isNaN(listingId)) return;

    const actionBtn = target.closest('button[data-action]');
    if (actionBtn) {
        const action = actionBtn.dataset.action;
        if (action === 'edit') {
            selectListing(listingId, { autoScroll: true });
        } else if (action === 'status') {
            handleStatusChange(listingId, actionBtn.dataset.nextStatus);
        } else if (action === 'delete') {
            handleDelete(listingId);
        }
        return;
    }

    selectListing(listingId, { autoScroll: true });
}

function handlePaginationClick(event) {
    const button = event.target.closest('button[data-direction]');
    if (!button) return;
    const direction = button.dataset.direction;
    const currentPage = Math.floor(state.offset / state.limit) + 1;
    const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
    let targetPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
    targetPage = Math.min(totalPages, Math.max(1, targetPage));
    if (targetPage === currentPage) return;
    state.offset = (targetPage - 1) * state.limit;
    loadListings();
}

const debouncedSearch = debounce((value) => {
    state.filters.search = value.trim();
    state.offset = 0;
    loadListings({ preserveSelection: false });
}, 400);

function attachEventListeners() {
    if (els.tableBody) {
        els.tableBody.addEventListener('click', handleTableClick);
    }
    if (els.paginationControls) {
        els.paginationControls.addEventListener('click', handlePaginationClick);
    }
    if (els.searchInput) {
        els.searchInput.addEventListener('input', (event) => {
            debouncedSearch(event.target.value);
        });
    }
    if (els.statusSelect) {
        els.statusSelect.addEventListener('change', (event) => {
            state.filters.status = event.target.value;
            state.offset = 0;
            loadListings({ preserveSelection: false });
        });
    }
    if (els.sortSelect) {
        els.sortSelect.addEventListener('change', (event) => {
            state.filters.sort = event.target.value;
            state.offset = 0;
            loadListings();
        });
    }
    if (els.resetFilters) {
        els.resetFilters.addEventListener('click', () => {
            if (els.filtersForm) els.filtersForm.reset();
            state.filters = { search: '', status: 'all', sort: 'updated_desc' };
            state.offset = 0;
            loadListings({ preserveSelection: false });
        });
    }
    if (els.newListingBtn) {
        els.newListingBtn.addEventListener('click', () => {
            resetEditorForm();
            els.editorForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
    if (els.refreshBtn) {
        els.refreshBtn.addEventListener('click', () => {
            loadListings();
        });
    }
    if (els.editorForm) {
        els.editorForm.addEventListener('submit', handleEditorSubmit);
    }
    if (els.editorReset) {
        els.editorReset.addEventListener('click', () => {
            resetEditorForm();
        });
    }
    if (els.editorDelete) {
        els.editorDelete.addEventListener('click', () => {
            if (state.selectedId) {
                handleDelete(state.selectedId);
            }
        });
    }
    if (els.auctionForm) {
        els.auctionForm.addEventListener('submit', handleCreateAuction);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const session = await initAccessControl({
        requireAdmin: true,
        redirectTo: 'account.html',
        onDenied: () => showToast('Доступ дозволено лише адміністраторам.', 'error'),
    });
    if (!session?.user?.is_admin) {
        return;
    }
    if (!els.tableBody || !els.editorForm) {
        return;
    }
    resetEditorForm();
    attachEventListeners();
    loadListings();
});
