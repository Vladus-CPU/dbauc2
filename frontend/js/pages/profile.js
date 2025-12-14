import { 
    getMyProfile, 
    meAuctions, 
    meAuctionOrders, 
    meDocuments, 
    meInventory, 
    meClearingInsights,
    getToken,
    setToken,
    bootstrapAdmin
} from '../api.js';
import { showToast } from '../ui/toast.js';
import { initAccessControl, clearCachedSession } from '../ui/session.js';

console.log('[PROFILE] Модуль завантажується...');

// Перевірка авторизації
if (!getToken()) {
    console.warn('[PROFILE] Немає токена, перенаправлення на вхід...');
    window.location.href = 'account.html';
}

// Ініціалізація контролю доступу
initAccessControl();

let currentTab = 'auctions';

function formatDate(dateStr) {
    if (!dateStr) return 'Невідомо';
    const d = new Date(dateStr);
    return d.toLocaleString('uk-UA', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatPrice(price) {
    if (price == null) return '—';
    return `${parseFloat(price).toFixed(2)} грн`;
}

// Рендер заголовку профілю
async function renderProfileHead() {
    const container = document.getElementById('profile-head');
    if (!container) {
        console.error('[PROFILE-HEAD] Контейнер не знайдено!');
        return;
    }
    
    try {
        console.log('[PROFILE-HEAD] Завантаження даних...');
        const data = await getMyProfile();
        console.log('[PROFILE-HEAD] Отримано:', data);
        
        if (!data) {
            throw new Error('API повернула пусті дані');
        }
        
        const profile = data.profile || {};
        const role = data.role === 'admin' ? 'Адміністратор' : 'Трейдер';
        
        const fullName = [profile.first_name, profile.last_name]
            .filter(Boolean)
            .join(' ') || 'Користувач';
        
        const firstLetter = fullName.charAt(0).toUpperCase();
        
        let locationHtml = '';
        if (data.role !== 'admin') {
            const parts = [profile.city, profile.region, profile.country].filter(Boolean);
            if (parts.length > 0) {
                locationHtml = `<p style="margin: 8px 0 0 0; color: #888; font-size: 0.95em;">📍 ${parts.join(', ')}</p>`;
            }
        }

        container.innerHTML = `
            <div style="
                background: linear-gradient(135deg, rgba(100, 150, 200, 0.1) 0%, rgba(150, 100, 200, 0.1) 100%);
                border: 1px solid rgba(150, 200, 255, 0.2);
                border-radius: 12px;
                padding: 24px;
                display: flex;
                gap: 24px;
                align-items: flex-start;
                backdrop-filter: blur(10px);
            ">
                <div style="
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 32px;
                    color: white;
                    font-weight: bold;
                    flex-shrink: 0;
                ">${firstLetter}</div>
                <div style="flex: 1; min-width: 0;">
                    <h2 style="margin: 0 0 8px 0; font-size: 1.8em; color: #fff;">${fullName}</h2>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <span style="
                            display: inline-block;
                            background: ${data.role === 'admin' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(59, 130, 246, 0.2)'};
                            color: ${data.role === 'admin' ? '#4ade80' : '#3b82f6'};
                            padding: 4px 12px;
                            border-radius: 16px;
                            font-size: 0.85em;
                            font-weight: 500;
                        ">${role}</span>
                    </div>
                    ${locationHtml}
                </div>
            </div>
        `;
        console.log('[PROFILE-HEAD] Успішно відрендерено');
        
        // Рендерити кнопки дій
        await renderProfileActions();
    } catch (err) {
        console.error('[PROFILE-HEAD] Помилка:', err);
        container.innerHTML = `<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Помилка: ${err.message}</div>`;
    }
}

// Рендер кнопок дій
async function renderProfileActions() {
    const container = document.getElementById('profile-actions');
    if (!container) return;
    
    try {
        const data = await getMyProfile();
        const isAdmin = data.role === 'admin';
        
        let html = '';
        
        // Кнопка Вийти
        html += `
            <button onclick="handleLogout()" style="
                padding: 8px 16px;
                background: rgba(255, 107, 107, 0.2);
                border: 1px solid rgba(255, 107, 107, 0.4);
                color: #ff6b6b;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
                transition: all 0.2s;
            " onmouseover="this.style.background='rgba(255, 107, 107, 0.3)'" onmouseout="this.style.background='rgba(255, 107, 107, 0.2)'">
                🚪 Вийти
            </button>
        `;
        
        // Кнопка Ініціалізувати адміна (тільки для не-адмінів)
        if (!isAdmin) {
            html += `
                <button onclick="handleBootstrapAdmin()" style="
                    padding: 8px 16px;
                    background: linear-gradient(135deg, rgba(100, 200, 150, 0.2) 0%, rgba(150, 150, 200, 0.2) 100%);
                    border: 1px solid rgba(100, 200, 150, 0.4);
                    color: #4ade80;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                " onmouseover="this.style.background='linear-gradient(135deg, rgba(100, 200, 150, 0.3) 0%, rgba(150, 150, 200, 0.3) 100%)'" onmouseout="this.style.background='linear-gradient(135deg, rgba(100, 200, 150, 0.2) 0%, rgba(150, 150, 200, 0.2) 100%)'">
                    👑 Ініціалізувати адміна
                </button>
            `;
        }
        
        container.innerHTML = html;
    } catch (err) {
        console.error('[PROFILE-ACTIONS] Помилка:', err);
    }
}

// Рендер списку аукціонів
async function renderAuctions() {
    const container = document.getElementById('profile-content');
    container.innerHTML = '<div style="padding: 16px; text-align: center; color: #999;">⏳ Завантаження аукціонів...</div>';
    
    try {
        console.log('[AUCTIONS] Завантаження...');
        const auctions = await meAuctions();
        console.log('[AUCTIONS] Отримано аукціонів:', auctions?.length || 0);
        
        if (!auctions || auctions.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
                    <h3 style="margin: 0 0 8px 0; color: #ccc;">Немає аукціонів</h3>
                    <p style="margin: 0; font-size: 0.95em;">Ви ще не брали участь в жодному аукціоні</p>
                </div>
            `;
            return;
        }

        let html = `
            <div style="overflow-x: auto;">
                <table style="
                    width: 100%;
                    border-collapse: collapse;
                    background: rgba(20,20,30,0.5);
                    border-radius: 8px;
                    overflow: hidden;
                ">
                    <thead>
                        <tr style="
                            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                            color: white;
                        ">
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

        auctions.forEach((auction, idx) => {
            const auctionType = {
                'buy': '🛒 Купівля',
                'sell': '💰 Продаж'
            }[auction.auction_type] || auction.auction_type;
            
            const status = {
                'pending': '⏳ Очікує',
                'active': '🟢 Активний',
                'closed': '🔴 Закритий'
            }[auction.auction_status] || auction.auction_status;
            
            const statusColor = {
                'pending': '#ff9500',
                'active': '#4ade80',
                'closed': '#888'
            }[auction.auction_status] || '#888';
            
            const role = auction.is_creator ? '👑 Створив' : '👤 Учасник';
            
            const bgColor = idx % 2 === 0 ? 'rgba(40,40,50,0.3)' : 'rgba(30,30,40,0.3)';
            
            html += `
                <tr style="
                    border-bottom: 1px solid rgba(100,100,150,0.2);
                    background: ${bgColor};
                    transition: background 0.2s;
                    cursor: pointer;
                " onmouseover="this.style.background='rgba(100,100,150,0.2)'" onmouseout="this.style.background='${bgColor}'">
                    <td style="padding: 12px; color: #4ade80; font-weight: 500;">#${auction.auction_id}</td>
                    <td style="padding: 12px; color: #ccc;"><strong>${auction.product || '—'}</strong></td>
                    <td style="padding: 12px; color: #999;">${auctionType}</td>
                    <td style="padding: 12px;">
                        <span style="
                            display: inline-block;
                            padding: 4px 8px;
                            background: rgba(${statusColor === '#4ade80' ? '74,222,128' : statusColor === '#ff9500' ? '255,149,0' : '136,136,136'},0.2);
                            color: ${statusColor};
                            border-radius: 4px;
                            font-size: 0.85em;
                            font-weight: 500;
                        ">${status}</span>
                    </td>
                    <td style="padding: 12px; color: #999;">${role}</td>
                    <td style="padding: 12px;">
                        <a href="auction.html?id=${auction.auction_id}" style="
                            display: inline-block;
                            padding: 6px 12px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            text-decoration: none;
                            border-radius: 4px;
                            font-size: 0.85em;
                            transition: opacity 0.2s;
                        " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                            Відкрити →
                        </a>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        console.log('[AUCTIONS] Успішно відрендерено');
    } catch (err) {
        console.error('[AUCTIONS] Помилка:', err);
        container.innerHTML = `<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Помилка: ${err.message}</div>`;
    }
}

// Рендер списку ордерів
async function renderOrders() {
    const container = document.getElementById('profile-content');
    container.innerHTML = '<div style="padding: 16px; text-align: center; color: #999;">⏳ Завантаження ордерів...</div>';
    
    try {
        console.log('[ORDERS] Завантаження...');
        const orders = await meAuctionOrders();
        console.log('[ORDERS] Отримано ордерів:', orders?.length || 0);
        
        if (!orders || orders.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
                    <h3 style="margin: 0 0 8px 0; color: #ccc;">Немає ордерів</h3>
                    <p style="margin: 0; font-size: 0.95em;">Ви ще не розмістили жодного ордера</p>
                </div>
            `;
            return;
        }

        let html = `
            <div style="overflow-x: auto;">
                <table style="
                    width: 100%;
                    border-collapse: collapse;
                    background: rgba(20,20,30,0.5);
                    border-radius: 8px;
                    overflow: hidden;
                ">
                    <thead>
                        <tr style="
                            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                            color: white;
                        ">
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

        orders.forEach((order, idx) => {
            const side = order.side === 'buy' ? '🟢 Купити' : '🔴 Продати';
            const sideColor = order.side === 'buy' ? '#4ade80' : '#ff6b6b';
            
            const status = {
                'active': '🟡 Активний',
                'cleared': '✅ Виконано',
                'cancelled': '❌ Скасовано'
            }[order.status] || order.status;
            
            const statusColor = {
                'active': '#3b82f6',
                'cleared': '#4ade80',
                'cancelled': '#888'
            }[order.status] || '#888';
            
            const cleared = order.status === 'cleared' && order.cleared_quantity
                ? `${order.cleared_quantity} шт @ ${formatPrice(order.cleared_price)}`
                : '—';
            
            const bgColor = idx % 2 === 0 ? 'rgba(40,40,50,0.3)' : 'rgba(30,30,40,0.3)';
            
            html += `
                <tr style="
                    border-bottom: 1px solid rgba(100,100,150,0.2);
                    background: ${bgColor};
                    transition: background 0.2s;
                " onmouseover="this.style.background='rgba(100,100,150,0.2)'" onmouseout="this.style.background='${bgColor}'">
                    <td style="padding: 12px; color: #4ade80; font-weight: 500;">#${order.id}</td>
                    <td style="padding: 12px;">
                        <a href="auction.html?id=${order.auction_id}" style="color: #3b82f6; text-decoration: none; cursor: pointer;">
                            #${order.auction_id}
                        </a>
                    </td>
                    <td style="padding: 12px; color: #ccc;">${order.product || '—'}</td>
                    <td style="padding: 12px;">
                        <span style="
                            display: inline-block;
                            padding: 4px 8px;
                            background: rgba(${order.side === 'buy' ? '74,222,128' : '255,107,107'},0.2);
                            color: ${sideColor};
                            border-radius: 4px;
                            font-size: 0.85em;
                            font-weight: 500;
                        ">${side}</span>
                    </td>
                    <td style="padding: 12px; color: #999;">${formatPrice(order.price)}</td>
                    <td style="padding: 12px; color: #999;">${order.quantity} шт</td>
                    <td style="padding: 12px;">
                        <span style="
                            display: inline-block;
                            padding: 4px 8px;
                            background: rgba(${statusColor === '#4ade80' ? '74,222,128' : statusColor === '#3b82f6' ? '59,130,246' : '136,136,136'},0.2);
                            color: ${statusColor};
                            border-radius: 4px;
                            font-size: 0.85em;
                            font-weight: 500;
                        ">${status}</span>
                    </td>
                    <td style="padding: 12px; color: #999; font-size: 0.9em;">${cleared}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        console.log('[ORDERS] Успішно відрендерено');
    } catch (err) {
        console.error('[ORDERS] Помилка:', err);
        container.innerHTML = `<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Помилка: ${err.message}</div>`;
    }
}

// Рендер списку документів
async function renderDocuments() {
    const container = document.getElementById('profile-content');
    container.innerHTML = '<div style="padding: 16px; text-align: center; color: #999;">⏳ Завантаження документів...</div>';
    
    try {
        console.log('[DOCUMENTS] Завантаження...');
        const docs = await meDocuments();
        console.log('[DOCUMENTS] Отримано документів:', docs?.length || 0);
        
        if (!docs || docs.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
                    <h3 style="margin: 0 0 8px 0; color: #ccc;">Немає документів</h3>
                    <p style="margin: 0; font-size: 0.95em;">Документи з'являться після завершення аукціонів</p>
                </div>
            `;
            return;
        }

        let html = `
            <div style="overflow-x: auto;">
                <table style="
                    width: 100%;
                    border-collapse: collapse;
                    background: rgba(20,20,30,0.5);
                    border-radius: 8px;
                    overflow: hidden;
                ">
                    <thead>
                        <tr style="
                            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                            color: white;
                        ">
                            <th style="padding: 12px; text-align: left; font-weight: 600;">Аукціон</th>
                            <th style="padding: 12px; text-align: left; font-weight: 600;">Назва файлу</th>
                            <th style="padding: 12px; text-align: left; font-weight: 600;">Дії</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        docs.forEach((doc, idx) => {
            const bgColor = idx % 2 === 0 ? 'rgba(40,40,50,0.3)' : 'rgba(30,30,40,0.3)';
            
            html += `
                <tr style="
                    border-bottom: 1px solid rgba(100,100,150,0.2);
                    background: ${bgColor};
                    transition: background 0.2s;
                " onmouseover="this.style.background='rgba(100,100,150,0.2)'" onmouseout="this.style.background='${bgColor}'">
                    <td style="padding: 12px;">
                        <a href="auction.html?id=${doc.auction_id}" style="color: #3b82f6; text-decoration: none;">
                            #${doc.auction_id}
                        </a>
                    </td>
                    <td style="padding: 12px; color: #ccc;">${doc.filename}</td>
                    <td style="padding: 12px;">
                        <a href="/api/me/documents/${doc.auction_id}/${encodeURIComponent(doc.filename)}" 
                           style="
                            display: inline-block;
                            padding: 6px 12px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            text-decoration: none;
                            border-radius: 4px;
                            font-size: 0.85em;
                            transition: opacity 0.2s;
                           " 
                           onmouseover="this.style.opacity='0.8'" 
                           onmouseout="this.style.opacity='1'"
                           download>
                            ⬇️ Завантажити
                        </a>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        console.log('[DOCUMENTS] Успішно відрендерено');
    } catch (err) {
        console.error('[DOCUMENTS] Помилка:', err);
        container.innerHTML = `<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Помилка: ${err.message}</div>`;
    }
}

// Налаштування табів
function setupTabs() {
    console.log('[TABS] Налаштування табів...');
    const tabs = document.querySelectorAll('.tab');
    console.log('[TABS] Знайдено табів:', tabs.length);
    
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('[TABS] Клік на таб:', tab.id);
            
            // Видалити активний клас з усіх табів
            tabs.forEach(t => t.classList.remove('tab--active'));
            
            // Додати активний клас до натиснутого табу
            tab.classList.add('tab--active');
            
            // Визначити який таб
            if (tab.id === 'tab-auctions') {
                currentTab = 'auctions';
                renderAuctions();
            } else if (tab.id === 'tab-orders') {
                currentTab = 'orders';
                renderOrders();
            } else if (tab.id === 'tab-docs') {
                currentTab = 'documents';
                renderDocuments();
            }
        });
    });
    console.log('[TABS] Налаштовано успішно');
}

// Рендер інвентарю
async function renderInventory() {
    const container = document.getElementById('inventory-content');
    if (!container) {
        console.error('[INVENTORY] Контейнер не знайдено!');
        return;
    }
    
    container.innerHTML = '<div style="padding: 16px; text-align: center; color: #999;">⏳ Завантаження інвентарю...</div>';
    
    try {
        console.log('[INVENTORY] Завантаження...');
        const inventory = await meInventory();
        console.log('[INVENTORY] Отримано позицій:', inventory?.length || 0);
        
        if (!inventory || inventory.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📦</div>
                    <h3 style="margin: 0 0 8px 0; color: #ccc;">Інвентар порожній</h3>
                    <p style="margin: 0; font-size: 0.95em;">Після клірингу ваші ресурси з'являться тут</p>
                </div>
            `;
            return;
        }

        let html = `
            <div style="
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 16px;
            ">
        `;

        inventory.forEach(item => {
            html += `
                <div style="
                    background: linear-gradient(135deg, rgba(100, 150, 200, 0.1) 0%, rgba(150, 100, 200, 0.1) 100%);
                    border: 1px solid rgba(150, 200, 255, 0.2);
                    border-radius: 12px;
                    padding: 16px;
                    backdrop-filter: blur(10px);
                    transition: all 0.3s;
                    cursor: pointer;
                " onmouseover="this.style.borderColor='rgba(150, 200, 255, 0.5)'; this.style.background='linear-gradient(135deg, rgba(100, 150, 200, 0.15) 0%, rgba(150, 100, 200, 0.15) 100%)'" 
                   onmouseout="this.style.borderColor='rgba(150, 200, 255, 0.2)'; this.style.background='linear-gradient(135deg, rgba(100, 150, 200, 0.1) 0%, rgba(150, 100, 200, 0.1) 100%)'">
                    <div style="
                        font-size: 28px;
                        margin-bottom: 12px;
                        padding: 12px;
                        background: rgba(74, 222, 128, 0.1);
                        border-radius: 8px;
                        text-align: center;
                    ">📦</div>
                    <h4 style="margin: 0 0 12px 0; color: #ccc; font-size: 1.1em;">${item.product}</h4>
                    <div style="
                        background: rgba(0, 0, 0, 0.3);
                        padding: 12px;
                        border-radius: 8px;
                        font-size: 0.9em;
                    ">
                        <div style="color: #999; margin-bottom: 8px;">
                            <span style="color: #aaa;">Кількість:</span>
                            <span style="color: #4ade80; font-weight: 500; float: right;">${parseFloat(item.quantity).toFixed(2)} шт</span>
                        </div>
                        <div style="clear: both; color: #999;">
                            <span style="color: #aaa;">Оновлено:</span>
                            <span style="color: #999; float: right; font-size: 0.85em;">${formatDate(item.updated_at)}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;

        container.innerHTML = html;
        console.log('[INVENTORY] Успішно відрендерено');
    } catch (err) {
        console.error('[INVENTORY] Помилка:', err);
        container.innerHTML = `<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Помилка: ${err.message}</div>`;
    }
}

// Рендер даних клірингу
async function renderClearing() {
    const container = document.getElementById('clearing-content');
    if (!container) {
        console.error('[CLEARING] Контейнер не знайдено!');
        return;
    }
    
    container.innerHTML = '<div style="padding: 16px; text-align: center; color: #999;">⏳ Завантаження даних клірингу...</div>';
    
    try {
        console.log('[CLEARING] Завантаження...');
        const data = await meClearingInsights();
        console.log('[CLEARING] Отримано:', data);
        
        if (!data || (!data.summary && !data.lastRound && (!data.recentFills || data.recentFills.length === 0))) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
                    <h3 style="margin: 0 0 8px 0; color: #ccc;">Немає даних клірингу</h3>
                    <p style="margin: 0; font-size: 0.95em;">Дані з'являться після виконання ваших ордерів</p>
                </div>
            `;
            return;
        }

        let html = '';

        // Зведення
        if (data.summary) {
            html += `
                <div style="
                    background: linear-gradient(135deg, rgba(100, 150, 200, 0.1) 0%, rgba(150, 100, 200, 0.1) 100%);
                    border: 1px solid rgba(150, 200, 255, 0.2);
                    border-radius: 12px;
                    padding: 20px;
                    backdrop-filter: blur(10px);
                    margin-bottom: 20px;
                ">
                    <h3 style="margin: 0 0 16px 0; color: #4ade80;">📊 Зведення</h3>
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 16px;
                    ">
                        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px;">
                            <div style="color: #999; font-size: 0.9em;">Позицій в інвентарі</div>
                            <div style="color: #4ade80; font-size: 1.5em; font-weight: bold; margin-top: 8px;">${data.summary.positions || 0}</div>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px;">
                            <div style="color: #999; font-size: 0.9em;">Загальна кількість</div>
                            <div style="color: #4ade80; font-size: 1.5em; font-weight: bold; margin-top: 8px;">${(data.summary.totalQuantity || 0).toFixed(2)} шт</div>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px;">
                            <div style="color: #999; font-size: 0.9em;">Останній кліринг</div>
                            <div style="color: #999; font-size: 0.9em; margin-top: 8px;">${data.summary.lastClearingAt ? formatDate(data.summary.lastClearingAt) : 'Невідомо'}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Останній раунд
        if (data.lastRound) {
            html += `
                <div style="
                    background: linear-gradient(135deg, rgba(100, 150, 200, 0.1) 0%, rgba(150, 100, 200, 0.1) 100%);
                    border: 1px solid rgba(150, 200, 255, 0.2);
                    border-radius: 12px;
                    padding: 20px;
                    backdrop-filter: blur(10px);
                    margin-bottom: 20px;
                ">
                    <h3 style="margin: 0 0 16px 0; color: #4ade80;">🎯 Останній раунд клірингу</h3>
                    <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.95em;">
                            <div><span style="color: #999;">Аукціон:</span> <a href="auction.html?id=${data.lastRound.auction_id}" style="color: #3b82f6; text-decoration: none;">#${data.lastRound.auction_id} - ${data.lastRound.product}</a></div>
                            <div><span style="color: #999;">Тип:</span> <span style="color: #ccc;">${data.lastRound.type === 'buy' ? '🛒 Купівля' : '💰 Продаж'}</span></div>
                            <div><span style="color: #999;">Раунд:</span> <span style="color: #ccc;">#${data.lastRound.round_number}</span></div>
                            <div><span style="color: #999;">Ціна клірингу:</span> <span style="color: #4ade80;">${formatPrice(data.lastRound.clearing_price)}</span></div>
                            <div><span style="color: #999;">Обсяг клірингу:</span> <span style="color: #ccc;">${data.lastRound.clearing_volume} шт</span></div>
                            <div><span style="color: #999;">Попит:</span> <span style="color: #ccc;">${data.lastRound.clearing_demand} шт</span></div>
                            <div><span style="color: #999;">Пропозиція:</span> <span style="color: #ccc;">${data.lastRound.clearing_supply} шт</span></div>
                            <div><span style="color: #999;">Час:</span> <span style="color: #999;">${formatDate(data.lastRound.cleared_at)}</span></div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Останні виконані ордери
        if (data.recentFills && data.recentFills.length > 0) {
            html += `
                <div style="
                    background: linear-gradient(135deg, rgba(100, 150, 200, 0.1) 0%, rgba(150, 100, 200, 0.1) 100%);
                    border: 1px solid rgba(150, 200, 255, 0.2);
                    border-radius: 12px;
                    padding: 20px;
                    backdrop-filter: blur(10px);
                    margin-bottom: 20px;
                    overflow-x: auto;
                ">
                    <h3 style="margin: 0 0 16px 0; color: #4ade80;">✅ Останні виконані ордери</h3>
                    <table style="
                        width: 100%;
                        border-collapse: collapse;
                        background: rgba(0,0,0,0.3);
                        border-radius: 8px;
                        overflow: hidden;
                    ">
                        <thead>
                            <tr style="background: rgba(102, 126, 234, 0.3); color: #4ade80; border-bottom: 1px solid rgba(100,100,150,0.2);">
                                <th style="padding: 10px; text-align: left; font-weight: 600;">ID</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600;">Аукціон</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600;">Продукт</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600;">Сторона</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600;">Ціна</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600;">Кількість</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600;">Час</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            data.recentFills.forEach((fill, idx) => {
                const bgColor = idx % 2 === 0 ? 'rgba(40,40,50,0.3)' : 'rgba(30,30,40,0.3)';
                html += `
                    <tr style="background: ${bgColor}; border-bottom: 1px solid rgba(100,100,150,0.1);">
                        <td style="padding: 10px; color: #4ade80;">#${fill.id}</td>
                        <td style="padding: 10px;">
                            <a href="auction.html?id=${fill.auction_id}" style="color: #3b82f6; text-decoration: none;">#${fill.auction_id}</a>
                        </td>
                        <td style="padding: 10px; color: #ccc;">${fill.product}</td>
                        <td style="padding: 10px;">
                            <span style="
                                display: inline-block;
                                padding: 2px 6px;
                                background: rgba(${fill.side === 'buy' ? '74,222,128' : '255,107,107'},0.2);
                                color: ${fill.side === 'buy' ? '#4ade80' : '#ff6b6b'};
                                border-radius: 3px;
                                font-size: 0.85em;
                            ">${fill.side === 'buy' ? '🟢 Купити' : '🔴 Продати'}</span>
                        </td>
                        <td style="padding: 10px; color: #999;">${formatPrice(fill.cleared_price)}</td>
                        <td style="padding: 10px; color: #999;">${fill.cleared_quantity} шт</td>
                        <td style="padding: 10px; color: #999; font-size: 0.9em;">${formatDate(fill.cleared_at)}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        // Події інвентарю
        if (data.inventoryEvents && data.inventoryEvents.length > 0) {
            html += `
                <div style="
                    background: linear-gradient(135deg, rgba(100, 150, 200, 0.1) 0%, rgba(150, 100, 200, 0.1) 100%);
                    border: 1px solid rgba(150, 200, 255, 0.2);
                    border-radius: 12px;
                    padding: 20px;
                    backdrop-filter: blur(10px);
                    overflow-x: auto;
                ">
                    <h3 style="margin: 0 0 16px 0; color: #4ade80;">📝 Події інвентарю</h3>
                    <table style="
                        width: 100%;
                        border-collapse: collapse;
                        background: rgba(0,0,0,0.3);
                        border-radius: 8px;
                        overflow: hidden;
                    ">
                        <thead>
                            <tr style="background: rgba(102, 126, 234, 0.3); color: #4ade80; border-bottom: 1px solid rgba(100,100,150,0.2);">
                                <th style="padding: 10px; text-align: left; font-weight: 600;">ID</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600;">Тип</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600;">Кількість</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600;">Час</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600;">Примітки</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            data.inventoryEvents.forEach((event, idx) => {
                const typeIcon = {
                    'clearing': '⚖️',
                    'deposit': '➕',
                    'withdrawal': '➖',
                    'adjustment': '🔧'
                }[event.type] || '📋';
                
                const bgColor = idx % 2 === 0 ? 'rgba(40,40,50,0.3)' : 'rgba(30,30,40,0.3)';
                
                html += `
                    <tr style="background: ${bgColor}; border-bottom: 1px solid rgba(100,100,150,0.1);">
                        <td style="padding: 10px; color: #4ade80;">#${event.id}</td>
                        <td style="padding: 10px; color: #ccc;">${typeIcon} ${event.type}</td>
                        <td style="padding: 10px; color: #ccc;">${event.quantity} шт</td>
                        <td style="padding: 10px; color: #999; font-size: 0.9em;">${formatDate(event.occurred_at)}</td>
                        <td style="padding: 10px; color: #999;">${event.notes || '—'}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        container.innerHTML = html;
        console.log('[CLEARING] Успішно відрендерено');
    } catch (err) {
        console.error('[CLEARING] Помилка:', err);
        container.innerHTML = `<div style="color: #ff8888; padding: 16px; background: rgba(255,136,136,0.1); border-radius: 8px;">❌ Помилка: ${err.message}</div>`;
    }
}

// Ініціалізація сторінки
async function init() {
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   ІНІЦІАЛІЗАЦІЯ СТОРІНКИ ПРОФІЛЮ           ║');
    console.log('╚════════════════════════════════════════════╝');
    
    try {
        console.log('[INIT] Крок 1: Рендер заголовку профілю...');
        await renderProfileHead();
        
        console.log('[INIT] Крок 2: Налаштування табів...');
        setupTabs();
        
        console.log('[INIT] Крок 3: Завантаження аукціонів...');
        await renderAuctions();
        
        console.log('[INIT] Крок 4: Завантаження інвентарю...');
        await renderInventory();
        
        console.log('[INIT] Крок 5: Завантаження клірингу...');
        await renderClearing();
        
        console.log('');
        console.log('╔════════════════════════════════════════════╗');
        console.log('║   ✅ ІНІЦІАЛІЗАЦІЯ ЗАВЕРШЕНА УСПІШНО       ║');
        console.log('╚════════════════════════════════════════════╝');
        console.log('');
    } catch (err) {
        console.error('');
        console.error('╔════════════════════════════════════════════╗');
        console.error('║   ❌ ПОМИЛКА ІНІЦІАЛІЗАЦІЇ                 ║');
        console.error('╚════════════════════════════════════════════╝');
        console.error(err);
        console.error('');
    }
}

// Глобальні функції для кнопок дій
window.handleLogout = async function() {
    console.log('[LOGOUT] Вихід з аккаунта...');
    setToken('');
    clearCachedSession();
    showToast('Ви вийшли', 'info');
    setTimeout(() => {
        window.location.href = 'account.html';
    }, 500);
};

window.handleBootstrapAdmin = async function() {
    console.log('[BOOTSTRAP] Ініціалізація адміна...');
    try {
        const res = await bootstrapAdmin();
        showToast(res.message || 'Тепер у вас є доступ адміна', 'success');
        clearCachedSession();
        setTimeout(() => {
            location.reload();
        }, 500);
    } catch (e) {
        console.error('[BOOTSTRAP] Помилка:', e);
        showToast(e?.message || 'Помилка ініціалізації', 'error');
    }
};

// Запуск ініціалізації
console.log('[PROFILE] Модуль profile.js завантажується...');
init();
