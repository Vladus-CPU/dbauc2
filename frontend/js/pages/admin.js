import {
  getMyProfile,
  listAuctions,
  createAuction,
  clearAuction,
  closeAuction,
  listParticipantsAdmin,
  approveParticipant,
  listAuctionOrdersAdmin,
  listAuctionDocuments,
  listAdminUsers,
  promoteUser,
  demoteUser,
  authorizedFetch,
  adminWalletSummary,
  adminWalletAction,
  adminWalletTransactions,
  seedRandomAuctionOrders,
  cleanupAuctionBots,
  listPendingAuctionOrders,
  approveAuctionOrder,
  rejectAuctionOrder,
  batchApproveAuctionOrders,
  batchRejectAuctionOrders,
  getClearingHistory,
  getPendingAuctions,
  approveAuction,
  rejectAuction,
  getAuctionBook,
  confirmAuctionK,
} from "../api.js";
import { showToast } from "../ui/toast.js";
import { initAccessControl } from "../ui/session.js";

const S = {
  currentUser: null,
  walletSelected: null,
  showBots: false,
  pendingOrders: [],
  pendingSelected: new Set(),
};

const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) {
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

function fmtDT(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("uk-UA", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return String(v);
  }
}

function tile(label, val, meta) {
  const t = el(
    "div",
    { className: "metrics-tile" },
    el("span", { className: "metrics-tile__value" }, val ?? "—"),
    el("span", { className: "metrics-tile__label" }, label),
  );
  if (meta)
    t.appendChild(el("span", { className: "metrics-tile__meta" }, meta));
  return t;
}

function collapsible(section, id) {
  section.classList.add("admin-collapsible");
  section.id = id;
  section.setAttribute("aria-expanded", "true");
  const btn = el(
    "button",
    { className: "admin-collapsible__toggle", type: "button" },
    "Згорнути",
  );
  btn.addEventListener("click", () => {
    const exp = section.getAttribute("aria-expanded") === "true";
    section.setAttribute("aria-expanded", exp ? "false" : "true");
    btn.textContent = exp ? "Розгорнути" : "Згорнути";
  });
  section.appendChild(btn);
  const body = el("div", { className: "admin-collapsible__body" });
  [...section.children]
    .filter(
      (c) =>
        !c.classList.contains("section-heading") &&
        !c.classList.contains("admin-collapsible__toggle"),
    )
    .forEach((c) => body.appendChild(c));
  section.appendChild(body);
}

function updateActiveNav() {
  const links = document.querySelectorAll(".admin-nav-link");
  let active = null;
  [...document.querySelectorAll(".admin-content > section")].forEach((sec) => {
    const r = sec.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.4 && r.bottom > 120) active = sec.id;
  });
  links.forEach((l) =>
    l.classList.toggle("is-active", l.getAttribute("href") === "#" + active),
  );
}

async function refreshOrdersInfo(id) {
  const box = $(`#orders-info-${id}`);
  if (!box) return;
  try {
    const orders = await listAuctionOrdersAdmin(id);
    const b = orders.filter((o) => o.side === "bid").length;
    const a = orders.filter((o) => o.side === "ask").length;
    const reserved = orders.reduce((s, o) => s + (+o.reserved_amount || 0), 0);
    const cleared = orders.reduce((s, o) => s + (+o.cleared_quantity || 0), 0);
    box.textContent = `${orders.length} заявок • b${b}/a${a} • рез ${reserved.toFixed(2)} • клір ${cleared.toFixed(2)}`;
  } catch {
    box.textContent = "Помилка заявок";
  }
}

function seedForm(auctionId) {
  const f = el("form", {
    className: "inline-form auction-seed-form",
    style: "margin-top:10px;",
  });
  f.innerHTML = `<fieldset style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end;border:1px solid var(--surface-border-soft);padding:6px 8px;border-radius:8px;font-size:0.68rem;"> <legend style="font-size:0.55rem;letter-spacing:.1em;text-transform:uppercase;padding:0 4px;">Боти</legend> <label style="display:flex;flex-direction:column;gap:2px;"><span>K-сть</span><input name="count" type="number" value="5" min="1" max="50" class="form__input" style="width:52px;"></label> <label style="display:flex;flex-direction:column;gap:2px;"><span>Bid/tr</span><input name="bidsPerTrader" type="number" value="1" min="0" max="10" class="form__input" style="width:52px;"></label> <label style="display:flex;flex-direction:column;gap:2px;"><span>Ask/tr</span><input name="asksPerTrader" type="number" value="1" min="0" max="10" class="form__input" style="width:52px;"></label> <label style="display:flex;flex-direction:column;gap:2px;"><span>Спред%</span><input name="priceSpread" type="number" value="5" step="0.1" min="0.1" max="50" class="form__input" style="width:58px;"></label> <label style="display:flex;flex-direction:column;gap:2px;"><span>QtyMin</span><input name="quantityMin" type="number" value="1" min="0" class="form__input" style="width:58px;"></label> <label style="display:flex;flex-direction:column;gap:2px;"><span>QtyMax</span><input name="quantityMax" type="number" value="10" min="0" class="form__input" style="width:58px;"></label> <label style="display:flex;flex-direction:column;gap:2px;"><span>Центр</span><input name="priceCenter" type="number" step="0.0001" placeholder="auto" class="form__input" style="width:68px;"></label> <label style="display:flex;align-items:center;gap:4px;margin-top:14px;"><input name="allowCross" type="checkbox" value="1"><span>Cross</span></label> <button class="btn btn-primary btn-compact" style="margin-left:4px;">Go</button> <button type="button" data-role="refresh" class="btn btn-ghost btn-compact">↻</button> <button type="button" data-role="cleanup" class="btn btn-ghost btn-compact">🗑</button> <span class="seed-status muted" style="margin-left:auto;"></span> </fieldset>`;
  const statusEl = f.querySelector(".seed-status");
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(f);
    const payload = Object.fromEntries(
      [...fd.entries()].map(([k, v]) => [
        k,
        v === "" ? undefined : isNaN(Number(v)) ? v : Number(v),
      ]),
    );
    payload.allowCross = !!fd.get("allowCross");
    statusEl.textContent = "…";
    try {
      await seedRandomAuctionOrders(auctionId, payload);
      statusEl.textContent = "OK";
      showToast("Бот-заявки згенеровано", "success");
      setTimeout(() => (statusEl.textContent = ""), 1600);
      await render();
    } catch (e) {
      statusEl.textContent = "X";
      showToast(e?.message || "Помилка", "error");
    }
  });
  f.querySelector('[data-role="refresh"]').addEventListener(
    "click",
    async () => {
      showToast("Оновлення", "info");
      await render();
    },
  );
  f.querySelector('[data-role="cleanup"]').addEventListener(
    "click",
    async () => {
      if (!confirm("Очистити ботів?")) return;
      statusEl.textContent = "…";
      try {
        await cleanupAuctionBots(auctionId, { removeUsers: false });
        statusEl.textContent = "OK";
        showToast("Очищено", "success");
        setTimeout(() => (statusEl.textContent = ""), 1600);
        await render();
      } catch (e) {
        statusEl.textContent = "X";
        showToast(e?.message || "Помилка", "error");
      }
    },
  );
  return f;
}

function auctionCard(a) {
  const card = el("article", { className: "stack-card compact" });
  card.append(
    el(
      "div",
      { className: "stack-card__header auction-mini-header" },
      el("strong", {}, `#${a.id} ${a.product}`),
      el("span", { className: "chip" }, a.type),
      el("span", { className: "chip" }, `k=${a.k_value}`),
      el(
        "span",
        {
          className: `chip ${a.status === "collecting" ? "chip--accent" : ""}`,
        },
        a.status,
      ),
    ),
    el(
      "div",
      { className: "auction-mini-meta" },
      el("span", {}, fmtDT(a.window_start)),
      el("span", {}, fmtDT(a.window_end)),
      el("span", {}, fmtDT(a.created_at)),
    ),
    el(
      "div",
      {
        className: "auction-mini-meta",
        style: "font-size:0.68rem;",
        id: `orders-info-${a.id}`,
      },
      "…",
    ),
    (() => {
      // K-control area (shows current k, recommendedK, and confirm button)
      const box = el("div", { className: "auction-k-box", style: "display:flex;gap:8px;align-items:center;font-size:0.75rem;color:var(--muted);" },
        el("span", { className: "chip" }, `k=${a.k_value}`),
        el("span", { className: "muted" }, "рекомендоване: …")
      );
      // Load book metrics to get recommendedK
      (async () => {
        try {
          const data = await getAuctionBook(a.id);
          const rec = data?.metrics?.recommendedK ?? data?.metrics?.adaptiveK;
          if (typeof rec === 'number') {
            // update label
            box.children[1].textContent = `рекомендоване: ${rec.toFixed(2)}`;
            // add confirm button if different
            const currentK = Number(a.k_value);
            const diff = isFinite(currentK) ? Math.abs(rec - currentK) : 1;
            const btn = el("button", { className: "btn btn-compact btn-primary" }, "Підтвердити k");
            btn.addEventListener("click", async () => {
              btn.disabled = true;
              try {
                await confirmAuctionK(a.id, rec);
                showToast("k оновлено", "success");
                await render();
              } catch (e) {
                showToast(e?.message || "Помилка", "error");
              } finally {
                btn.disabled = false;
              }
            });
            if (diff >= 0.005) {
              box.appendChild(btn);
            }
          } else {
            box.children[1].textContent = "рекомендоване: —";
          }
        } catch {
          box.children[1].textContent = "рекомендоване: —";
        }
      })();
      return box;
    })(),
    (() => {
      const actions = el("div", { className: "stack-card__actions" });
      const btnView = el(
        "button",
        {
          className: "btn btn-ghost btn-compact",
          onclick: () => loadParticipants(a.id, card),
        },
        "Учасники",
      );
      const btnDocs = el(
        "button",
        {
          className: "btn btn-ghost btn-compact",
          onclick: () => loadDocs(a.id, card),
        },
        "Документи",
      );
      const btnHistory = el(
        "button",
        {
          className: "btn btn-ghost btn-compact",
          onclick: () => loadClearingHistory(a.id, card),
        },
        "Історія раундів",
      );
      if (a.status === "collecting")
        actions.append(
          el(
            "button",
            {
              className: "btn btn-primary btn-compact",
              onclick: () => doClear(a.id),
            },
            "Кліринг",
          ),
        );
      if (a.status !== "closed")
        actions.append(
          el(
            "button",
            {
              className: "btn btn-ghost btn-compact",
              onclick: () => doClose(a.id),
            },
            "Закрити",
          ),
        );
      actions.append(btnView, btnDocs, btnHistory);
      return actions;
    })(),
  );
  if (a.status === "collecting") card.append(seedForm(a.id));
  refreshOrdersInfo(a.id);
  return card;
}

async function loadClearingHistory(auctionId, host) {
  let wrap = host.querySelector(".clearing-history-wrap");
  if (!wrap) {
    wrap = el("div", { className: "data-list clearing-history-wrap" });
    host.appendChild(wrap);
  }
  wrap.hidden = false;
  wrap.textContent = "Завантаження…";
  try {
    const data = await getClearingHistory(auctionId);
    const rounds = data.rounds || [];
    if (!rounds.length) {
      wrap.textContent = "Немає історії раундів";
      return;
    }
    wrap.innerHTML = "";
    const table = el("table", { style: "width:100%;font-size:0.68rem;border-collapse:collapse;" });
    const thead = el("thead", {}, el("tr", {}, ...["Раунд","Ціна","Обсяг","Попит","Пропозиція","Bid","Ask","Виконано","Час"].map(h => el("th", { style: "padding:4px;border-bottom:1px solid var(--surface-border-soft);text-align:left;" }, h))));
    const tbody = el("tbody");
    rounds.forEach(r => {
      const tr = el("tr", {});
      tr.appendChild(el("td", { style: "padding:4px;" }, `#${r.roundNumber}`));
      tr.appendChild(el("td", { style: "padding:4px;" }, r.clearingPrice ? (+r.clearingPrice).toFixed(4) : "—"));
      tr.appendChild(el("td", { style: "padding:4px;" }, r.clearingVolume ? (+r.clearingVolume).toFixed(4) : "—"));
      tr.appendChild(el("td", { style: "padding:4px;" }, r.clearingDemand ? (+r.clearingDemand).toFixed(4) : "—"));
      tr.appendChild(el("td", { style: "padding:4px;" }, r.clearingSupply ? (+r.clearingSupply).toFixed(4) : "—"));
      tr.appendChild(el("td", { style: "padding:4px;" }, String(r.totalBids ?? "—")));
      tr.appendChild(el("td", { style: "padding:4px;" }, String(r.totalAsks ?? "—")));
      tr.appendChild(el("td", { style: "padding:4px;" }, String(r.matchedOrders ?? "—")));
      tr.appendChild(el("td", { style: "padding:4px;white-space:nowrap;" }, fmtDT(r.clearedAt)));
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    wrap.appendChild(table);
  } catch (e) {
    wrap.textContent = `Помилка: ${e?.message || "невідома"}`;
  }
}

async function loadParticipants(auctionId, host) {
  let wrap = host.querySelector(".participants-wrap");
  if (!wrap) {
    wrap = el("div", { className: "data-list participants-wrap" });
    host.appendChild(wrap);
  }
  wrap.hidden = false;
  wrap.textContent = "Завантаження…";
  try {
    const list = await listParticipantsAdmin(auctionId);
    if (!list.length) {
      wrap.textContent = "Немає учасників";
      return;
    }
    wrap.innerHTML = "";
    list.forEach((p) => {
      const line = el(
        "div",
        { className: "data-list__item" },
        el(
          "span",
          { className: "data-list__label" },
          `#${p.id} тр ${p.trader_id}`,
        ),
        el("span", { className: "chip" }, p.status),
      );
      if (p.status === "pending")
        line.appendChild(
          el(
            "button",
            {
              className: "btn btn-primary btn-compact",
              onclick: async () => {
                try {
                  await approveParticipant(auctionId, p.id);
                  showToast("Схвалено", "success");
                  await loadParticipants(auctionId, host);
                } catch (e) {
                  showToast(e?.message || "Помилка", "error");
                }
              },
            },
            "OK",
          ),
        );
      wrap.appendChild(line);
    });
  } catch {
    wrap.textContent = "Помилка";
  }
}

async function loadDocs(auctionId, host) {
  let wrap = host.querySelector(".docs-wrap");
  if (!wrap) {
    wrap = el("div", { className: "data-list docs-wrap" });
    host.appendChild(wrap);
  }
  wrap.hidden = false;
  wrap.textContent = "Завантаження…";
  try {
    const files = await listAuctionDocuments(auctionId);
    if (!files.length) {
      wrap.textContent = "Немає документів";
      return;
    }
    wrap.innerHTML = "";
    files.forEach((f) => {
      const line = el(
        "div",
        { className: "data-list__item" },
        el("span", { className: "data-list__label" }, f),
        el(
          "button",
          {
            className: "btn btn-ghost btn-compact",
            onclick: () => downloadDoc(auctionId, f),
          },
          "↓",
        ),
      );
      wrap.appendChild(line);
    });
  } catch {
    wrap.textContent = "Помилка";
  }
}

async function downloadDoc(auctionId, fname) {
  try {
    const res = await authorizedFetch(
      `${location.origin.replace(/\/$/, "")}/api/admin/auctions/${auctionId}/documents/${encodeURIComponent(fname)}`,
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Завантажено", "success");
  } catch (e) {
    showToast(e?.message || "Не вдалося завантажити", "error");
  }
}

async function doClear(id) {
  if (!confirm("Кліринг зараз?")) return;
  const res = await clearAuction(id);
  showToast(`Cleared ${res.price ?? "—"}`, "success");
  await render();
}

async function doClose(id) {
  if (!confirm("Закрити аукціон?")) return;
  await closeAuction(id);
  showToast("Закрито", "success");
  await render();
}

async function render() {
  const root = document.getElementById("admin-content-root");
  if (!root) return;
  root.innerHTML = "";
  let users = [],
    auctions = [],
    walletOverview = {
      users: [],
      totals: { available: 0, reserved: 0, total: 0 },
    };
  try {
    [users, auctions, walletOverview] = await Promise.all([
      listAdminUsers().catch(() => []),
      listAuctions().catch(() => []),
      adminWalletSummary().catch(() => ({
        users: [],
        totals: { available: 0, reserved: 0, total: 0 },
      })),
    ]);
  } catch {}
  const adminCount = users.filter((u) => u.is_admin).length,
    traderCount = users.length - adminCount;
  const collecting = auctions.filter((a) => a.status === "collecting");
  const cleared = auctions.filter((a) => a.status === "cleared");
  const closed = auctions.filter((a) => a.status === "closed");
  const upcoming =
    auctions
      .map((a) => (a.window_start ? new Date(a.window_start) : null))
      .filter((d) => d && d > new Date())
      .sort((a, b) => a - b)[0] || null;
  const overview = el("section", { className: "dashboard-card" });
  overview.append(
    el(
      "div",
      { className: "section-heading" },
      el("span", { className: "eyebrow" }, "Центр керування"),
      el("h2", { className: "section-heading__title" }, "Оперативний знімок"),
    ),
    (() => {
      const g = el("div", { className: "metrics-grid" });
      g.append(
        tile("Аукціонів", String(auctions.length)),
        tile("Збір", String(collecting.length)),
        tile("Кліринг", String(cleared.length)),
        tile("Закрито", String(closed.length)),
        tile(
          "Адміни",
          String(adminCount),
          traderCount ? `${traderCount} трейдерів` : "—",
        ),
        tile("Найближче", upcoming ? fmtDT(upcoming) : "—"),
      );
      return g;
    })(),
  );
  collapsible(overview, "overview");
  root.appendChild(overview);
  const wallet = el("section", { className: "dashboard-card" });
  wallet.append(
    el(
      "div",
      { className: "section-heading" },
      el("span", { className: "eyebrow" }, "Гаманці"),
      el("h2", { className: "section-heading__title" }, "Баланс користувачів"),
    ),
    (() => {
      const g = el("div", { className: "metrics-grid" });
      const t = walletOverview.totals;
      g.append(
        tile("Доступно", t.available.toFixed(2)),
        tile("Резерв", t.reserved.toFixed(2)),
        tile("Разом", t.total.toFixed(2)),
      );
      return g;
    })(),
  );
  const walletUsers = el("div", {
    className: "data-list wallet-users-list scroll-panel",
  });
  if (!walletOverview.users.length) walletUsers.textContent = "Немає гаманців";
  else
    walletOverview.users.forEach((u) => {
      const avail = +u.available || 0,
        res = +u.reserved || 0;
      walletUsers.appendChild(
        el(
          "div",
          { className: "data-list__item" },
          el(
            "span",
            { className: "data-list__label" },
            `#${u.id} ${u.username}`,
          ),
          el("span", { className: "chip" }, `Дост ${avail.toFixed(2)}`),
          el("span", { className: "chip" }, `Рез ${res.toFixed(2)}`),
          el(
            "span",
            { className: "data-list__meta" },
            (avail + res).toFixed(2),
          ),
        ),
      );
    });
  wallet.append(walletUsers);
  const usrSel = el(
    "select",
    { className: "field" },
    el("option", { value: "" }, "Користувач"),
  );
  walletOverview.users.forEach((u) =>
    usrSel.appendChild(
      el("option", { value: String(u.id) }, `#${u.id} ${u.username}`),
    ),
  );
  if (walletOverview.users.length) {
    if (!walletOverview.users.some((u) => u.id === S.walletSelected))
      S.walletSelected = walletOverview.users[0].id;
    usrSel.value = S.walletSelected ? String(S.walletSelected) : "";
  }
  const actionForm = el(
    "form",
    { className: "inline-form wallet-action-form" },
    el(
      "select",
      { className: "field", name: "action" },
      el("option", { value: "deposit" }, "Поповнити"),
      el("option", { value: "withdraw" }, "Списати"),
      el("option", { value: "reserve" }, "Резерв"),
      el("option", { value: "release" }, "Розморозити"),
      el("option", { value: "spend" }, "Списати резерв"),
    ),
    el("input", {
      className: "field",
      name: "amount",
      type: "number",
      step: "0.01",
      min: "0",
      placeholder: "Сума",
      required: true,
    }),
    el("input", { className: "field", name: "note", placeholder: "Нотатка" }),
    el(
      "button",
      { className: "btn btn-primary btn-compact", type: "submit" },
      "OK",
    ),
  );
  const controls = el(
    "div",
    { className: "wallet-controls" },
    el(
      "label",
      { className: "form-field", style: "flex:1;" },
      el("span", { className: "form-field__label" }, "Користувач"),
      usrSel,
    ),
    actionForm,
  );
  wallet.append(controls);
  const txList = el("div", {
    className: "data-list wallet-transactions scroll-panel",
  });
  wallet.append(txList);
  async function loadTx(id) {
    if (!id) {
      txList.textContent = "Оберіть користувача";
      return;
    }
    txList.textContent = "...";
    try {
      const txs = await adminWalletTransactions(id, 50);
      if (!txs.length) {
        txList.textContent = "Порожньо";
        return;
      }
      txList.innerHTML = "";
      txs.forEach((tx) =>
        txList.appendChild(
          el(
            "div",
            { className: "data-list__item" },
            el(
              "span",
              { className: "data-list__label" },
              `#${tx.id} ${tx.type}`,
            ),
            el("span", { className: "chip" }, (+tx.amount || 0).toFixed(2)),
            el("span", { className: "data-list__meta" }, fmtDT(tx.createdAt)),
          ),
        ),
      );
    } catch {
      txList.textContent = "Помилка";
    }
  }
  if (S.walletSelected) loadTx(S.walletSelected);
  usrSel.addEventListener("change", () => {
    S.walletSelected = usrSel.value ? Number(usrSel.value) : null;
    loadTx(S.walletSelected);
  });
  actionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(actionForm);
    const action = String(fd.get("action"));
    const amountRaw = String(fd.get("amount") || "").trim();
    const note = String(fd.get("note") || "").trim() || undefined;
    const num = Number(amountRaw);
    if (!(num > 0)) {
      showToast("Сума > 0", "error");
      return;
    }
    if (!S.walletSelected) {
      showToast("Оберіть користувача", "error");
      return;
    }
    try {
      await adminWalletAction(S.walletSelected, {
        action,
        amount: amountRaw,
        note,
      });
      showToast("Готово", "success");
      await render();
    } catch (err) {
      showToast(err?.message || "Помилка", "error");
    }
  });
  collapsible(wallet, "wallet");
  root.appendChild(wallet);
  const auctionsSec = el("section", { className: "dashboard-card" });
  auctionsSec.append(
    el(
      "div",
      { className: "section-heading" },
      el("span", { className: "eyebrow" }, "Аукціони"),
      el("h2", { className: "section-heading__title" }, "Керування вікнами"),
    ),
  );
  const aWrap = el("div", {
    className: "stack-grid stack-grid--dense scroll-panel",
  });
  if (!auctions.length) aWrap.textContent = "Ще немає аукціонів";
  else auctions.forEach((a) => aWrap.appendChild(auctionCard(a)));
  auctionsSec.append(aWrap);
  collapsible(auctionsSec, "auctions");
  root.appendChild(auctionsSec);
  const pendingSec = el("section", { className: "dashboard-card" });
  pendingSec.append(
    el(
      "div",
      { className: "section-heading" },
      el("span", { className: "eyebrow" }, "Заявки"),
      el("h2", { className: "section-heading__title" }, "Очікують підтвердження"),
    ),
  );
  const pendingControls = el("div", { className: "inline-form", style: "display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:8px;" });
  const kInput = el("input", { className: "form__input", type: "number", min: "0", max: "1", step: "0.01", value: "0.5", style: "width:80px;", title: "k для пакетного схвалення" });
  const reasonInput = el("input", { className: "form__input", type: "text", placeholder: "Причина відхилення (опц)", style: "flex:1;min-width:160px;" });
  const btnRefreshPending = el("button", { className: "btn btn-ghost btn-compact", type: "button" }, "Оновити");
  const btnApproveSel = el("button", { className: "btn btn-primary btn-compact", type: "button" }, "Схвалити вибрані");
  const btnRejectSel = el("button", { className: "btn btn-danger btn-compact", type: "button" }, "Відхилити вибрані");
  pendingControls.append(
    el("label", { style: "display:flex;flex-direction:column;gap:4px;width:90px;" }, el("span", { className: "form-field__label" }, "k"), kInput),
    el("label", { style: "display:flex;flex-direction:column;gap:4px;flex:1;" }, el("span", { className: "form-field__label" }, "Причина"), reasonInput),
    btnApproveSel,
    btnRejectSel,
    btnRefreshPending,
  );
  const pendingWrap = el("div", { className: "scroll-panel", style: "max-height:260px;overflow:auto;border:1px solid var(--surface-border-soft);border-radius:8px;" });
  pendingSec.append(pendingControls, pendingWrap);
  async function loadPending() {
    pendingWrap.textContent = "Завантаження…";
    S.pendingSelected.clear();
    try {
      const res = await listPendingAuctionOrders();
      S.pendingOrders = res.orders || [];
      if (!S.pendingOrders.length) {
        pendingWrap.textContent = "Немає";
        return;
      }
      const table = el("table", { className: "admin-pending-table", style: "width:100%;font-size:0.68rem;border-collapse:collapse;" });
      const thead = el("thead", {}, el("tr", {}, ...["☑","#","Aукціон","Продукт","Трейдер","Side","Ціна","К-сть","k деф","Створено","Дії"].map(h => el("th", { style: "position:sticky;top:0;background:var(--surface);padding:4px;border-bottom:1px solid var(--surface-border-soft);" }, h))));
      const tbody = el("tbody");
      S.pendingOrders.forEach(o => {
        const tr = el("tr", {});
        const cb = el("input", { type: "checkbox" });
        cb.addEventListener("change", () => {
          if (cb.checked) S.pendingSelected.add(o.id); else S.pendingSelected.delete(o.id);
        });
        tr.appendChild(el("td", { style: "padding:4px;" }, cb));
        tr.appendChild(el("td", { style: "padding:4px;" }, `#${o.auctionId}`));
        tr.appendChild(el("td", { style: "padding:4px;" }, o.auctionProduct || '-'));
        tr.appendChild(el("td", { style: "padding:4px;" }, o.traderUsername));
        tr.appendChild(el("td", { style: "padding:4px;" }, o.side));
        tr.appendChild(el("td", { style: "padding:4px;" }, (+o.price).toFixed(4)));
        tr.appendChild(el("td", { style: "padding:4px;" }, (+o.quantity).toFixed(4)));
        tr.appendChild(el("td", { style: "padding:4px;" }, (+o.auctionDefaultK).toFixed(2)));
        tr.appendChild(el("td", { style: "padding:4px;white-space:nowrap;" }, fmtDT(o.createdAt)));
        const actTd = el("td", { style: "padding:4px;display:flex;gap:4px;" });
        const perK = el("input", { type: "number", min: "0", max: "1", step: "0.01", value: String(o.auctionDefaultK ?? 0.5), style: "width:60px;" });
        const btnOk = el("button", { className: "btn btn-primary btn-compact", type: "button" }, "OK");
        const btnX = el("button", { className: "btn btn-danger btn-compact", type: "button" }, "X");
        btnOk.addEventListener("click", async () => {
          const kv = Number(perK.value);
          if (!(kv >= 0 && kv <= 1)) { showToast("k 0..1", "error"); return; }
          btnOk.disabled = true; btnX.disabled = true;
          try { await approveAuctionOrder(o.id, kv); showToast("Схвалено", "success"); await loadPending(); } catch(e) { showToast(e?.message||"Помилка", "error"); } finally { btnOk.disabled=false; btnX.disabled=false; }
        });
        btnX.addEventListener("click", async () => {
          btnOk.disabled = true; btnX.disabled = true;
          try { await rejectAuctionOrder(o.id, reasonInput.value || undefined); showToast("Відхилено", "success"); await loadPending(); } catch(e) { showToast(e?.message||"Помилка", "error"); } finally { btnOk.disabled=false; btnX.disabled=false; }
        });
        actTd.append(perK, btnOk, btnX);
        tr.appendChild(actTd);
        tbody.appendChild(tr);
      });
      table.append(thead, tbody);
      pendingWrap.innerHTML = "";
      pendingWrap.appendChild(table);
    } catch(e) {
      pendingWrap.textContent = "Помилка";
    }
  }
  btnRefreshPending.addEventListener("click", loadPending);
  btnApproveSel.addEventListener("click", async () => {
    if (!S.pendingSelected.size) { showToast("Нічого не вибрано", "error"); return; }
    const kv = Number(kInput.value);
    if (!(kv >= 0 && kv <= 1)) { showToast("k 0..1", "error"); return; }
    btnApproveSel.disabled = true;
    try { await batchApproveAuctionOrders([...S.pendingSelected], kv); showToast("Пакет схвалено", "success"); await loadPending(); } catch(e) { showToast(e?.message||"Помилка", "error"); } finally { btnApproveSel.disabled=false; }
  });
  btnRejectSel.addEventListener("click", async () => {
    if (!S.pendingSelected.size) { showToast("Нічого не вибрано", "error"); return; }
    btnRejectSel.disabled = true;
    try { await batchRejectAuctionOrders([...S.pendingSelected], reasonInput.value || undefined); showToast("Пакет відхилено", "success"); await loadPending(); } catch(e) { showToast(e?.message||"Помилка", "error"); } finally { btnRejectSel.disabled=false; }
  });
  collapsible(pendingSec, "pending");
  root.appendChild(pendingSec);
  await loadPending();
  const team = el("section", { className: "dashboard-card" });
  team.append(
    el(
      "div",
      { className: "section-heading" },
      el("span", { className: "eyebrow" }, "Команда"),
      el(
        "h2",
        { className: "section-heading__title" },
        "Адміністратори та трейдери",
      ),
    ),
  );
  const toggles = el(
    "div",
    { style: "display:flex;gap:8px;margin-bottom:8px;" },
    el(
      "button",
      {
        className: "btn btn-ghost btn-compact",
        onclick: () => {
          S.showBots = !S.showBots;
          render();
        },
      },
      S.showBots ? "Приховати ботів" : "Показати ботів",
    ),
    el(
      "button",
      {
        className: "btn btn-danger btn-compact",
        onclick: async () => {
          if (!confirm("Видалити ВСІХ ботів?")) return;
          try {
            const { purgeAllBots } = await import("../api/auctions.js");
            const res = await purgeAllBots({ usernamePrefix: "bot_" });
            showToast(`Ботів видалено: ${res.removedUsers || 0}`, "success");
            await render();
          } catch (e) {
            showToast(e?.message || "Помилка", "error");
          }
        },
      },
      "Пург ботів",
    ),
  );
  const filtered = S.showBots
    ? users
    : users.filter((u) => !(u.username || "").startsWith("bot_"));
  const userList = el("div", { className: "data-list team-list scroll-panel" });
  if (!filtered.length)
    userList.textContent = S.showBots ? "Порожньо" : "Немає (боти приховані)";
  else
    filtered.forEach((u) => {
      const isSelf = S.currentUser && +S.currentUser.id === +u.id;
      const box = el(
        "div",
        { className: "data-list__item" },
        el(
          "span",
          { className: "data-list__label" },
          `#${u.id} ${u.username}${isSelf ? " (ви)" : ""}`,
        ),
        u.is_admin
          ? el("span", { className: "chip chip--accent" }, "Адмін")
          : el("span", { className: "chip" }, "Трейдер"),
      );
      const act = el("div", {});
      if (!u.is_admin)
        act.appendChild(
          el(
            "button",
            {
              className: "btn btn-primary btn-compact",
              onclick: async () => {
                if (!confirm(`Підвищити ${u.username}?`)) return;
                try {
                  await promoteUser(u.id);
                  showToast("Підвищено", "success");
                  await render();
                } catch (e) {
                  showToast(e?.message || "Помилка", "error");
                }
              },
            },
            "↑",
          ),
        );
      else if (!isSelf)
        act.appendChild(
          el(
            "button",
            {
              className: "btn btn-ghost btn-compact",
              onclick: async () => {
                if (!confirm(`Зняти права з ${u.username}?`)) return;
                try {
                  await demoteUser(u.id);
                  showToast("Готово", "success");
                  await render();
                } catch (e) {
                  showToast(e?.message || "Помилка", "error");
                }
              },
            },
            "↓",
          ),
        );
      else act.appendChild(el("span", { className: "chip" }, "Ви"));
      box.appendChild(act);
      userList.appendChild(box);
    });
  team.append(toggles, userList);
  collapsible(team, "team");
  root.appendChild(team);
  const create = el("section", { className: "dashboard-card" });
  create.append(
    el(
      "div",
      { className: "section-heading" },
      el("span", { className: "eyebrow" }, "Новий аукціон"),
      el("h2", { className: "section-heading__title" }, "Запуск"),
    ),
  );
  const form = el(
    "form",
    { className: "form-grid form-grid--compact" },
    el(
      "label",
      { className: "form-field" },
      el("span", { className: "form-field__label" }, "Продукт"),
      el("input", {
        className: "form__input",
        name: "product",
        required: true,
        placeholder: "Пшениця 100т",
      }),
    ),
    el(
      "label",
      { className: "form-field" },
      el("span", { className: "form-field__label" }, "Тип"),
      el(
        "select",
        { className: "form__input", name: "type" },
        el("option", { value: "open" }, "open"),
        el("option", { value: "closed" }, "closed"),
      ),
    ),
    el(
      "label",
      { className: "form-field" },
      el("span", { className: "form-field__label" }, "k"),
      el("input", {
        className: "form__input",
        name: "k",
        type: "number",
        min: "0",
        max: "1",
        step: "0.01",
        value: "0.5",
      }),
    ),
    el(
      "label",
      { className: "form-field" },
      el("span", { className: "form-field__label" }, "Початок"),
      el("input", {
        className: "form__input",
        name: "ws",
        type: "datetime-local",
      }),
    ),
    el(
      "label",
      { className: "form-field" },
      el("span", { className: "form-field__label" }, "Кінець"),
      el("input", {
        className: "form__input",
        name: "we",
        type: "datetime-local",
      }),
    ),
    el(
      "div",
      { className: "form-actions" },
      el(
        "button",
        { className: "btn btn-primary", type: "submit" },
        "Створити",
      ),
    ),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const product = String(fd.get("product") || "").trim();
    const type = String(fd.get("type") || "open");
    const k = Number(fd.get("k"));
    const ws = String(fd.get("ws") || "").trim() || undefined;
    const we = String(fd.get("we") || "").trim() || undefined;
    if (!product || Number.isNaN(k)) {
      showToast("Вкажіть продукт та k", "error");
      return;
    }
    try {
      await createAuction({ product, type, k, windowStart: ws, windowEnd: we });
      showToast("Аукціон створено", "success");
      form.reset();
      await render();
    } catch (err) {
      showToast(err?.message || "Помилка", "error");
    }
  });
  create.append(form);
  collapsible(create, "create");

  // СЕКЦІЯ: Аукціони на модерації
  const moderationSection = el("section", { className: "admin-section" });
  const moderationHeader = el("h2", {}, "Аукціони на модерації");
  moderationSection.appendChild(moderationHeader);

  const moderationList = el("div", { id: "moderation-list", className: "moderation-container" });
  moderationSection.appendChild(moderationList);

  async function loadPendingAuctions() {
    try {
      moderationList.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Завантаження...</p></div>';
      const pending = await getPendingAuctions();

      if (!pending || pending.length === 0) {
        moderationList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p class="empty-state-text">Немає аукціонів на модерації</p></div>';
        return;
      }

      moderationList.innerHTML = '';
      pending.forEach(auction => {
        const card = el("article", { className: "user-auction-card", style: "margin-bottom: 1rem;" });

        const header = el("div", { style: "display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;" });
        
        const titleSection = el("div", { style: "flex: 1;" });
        const title = el("h4", { style: "margin: 0 0 0.5rem 0; font-size: 1.1rem;" }, `#${auction.id} ${auction.product}`);
        
        const badges = el("div", { style: "display: flex; gap: 0.5rem; flex-wrap: wrap;" });
        badges.append(
          el("span", { className: "chip chip--info" }, auction.type),
          el("span", { className: "chip" }, `k=${auction.k_value}`),
          el("span", { className: "chip chip--warning" }, "⏳ pending")
        );
        
        titleSection.append(title, badges);
        header.appendChild(titleSection);

        const meta = el("div", { style: "font-size: 0.9rem; color: rgba(255, 255, 255, 0.7); margin: 0.75rem 0; display: flex; gap: 1rem; flex-wrap: wrap;" });
        const creatorBadge = el("span", { className: "pill-author" }, `👤 ${auction.creator_username || 'N/A'}`);
        const createdDate = el("span", {}, `📅 ${fmtDT(auction.created_at)}`);
        meta.append(creatorBadge, createdDate);
        
        if (auction.window_start || auction.window_end) {
          const windowDiv = el("div", { style: "margin: 0.5rem 0; font-size: 0.85rem; color: rgba(255, 255, 255, 0.6);" });
          windowDiv.innerHTML = `<div>⏰ Вікно: ${fmtDT(auction.window_start)} — ${fmtDT(auction.window_end)}</div>`;
          meta.appendChild(windowDiv);
        }

        const noteInput = el("input", {
          type: "text",
          placeholder: "Примітка (опціонально)",
          className: "form__input",
          style: "margin: 0.75rem 0; width: 100%; padding: 0.5rem; border-radius: 4px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);"
        });

        const actions = el("div", { style: "display: flex; gap: 0.5rem; margin-top: 1rem;" });

        const btnApprove = el("button", {
          className: "btn btn-primary btn-compact",
          style: "flex: 1;"
        }, "✓ Схвалити");

        const btnReject = el("button", {
          className: "btn btn-danger btn-compact",
          style: "flex: 1;"
        }, "✗ Відхилити");

        btnApprove.addEventListener("click", async () => {
          if (!confirm(`Схвалити аукціон #${auction.id}?`)) return;
          try {
            await approveAuction(auction.id, noteInput.value.trim() || null);
            showToast("Аукціон схвалено", "success");
            await loadPendingAuctions();
            await render();
          } catch (err) {
            showToast(err?.message || "Помилка", "error");
          }
        });

        btnReject.addEventListener("click", async () => {
          const note = noteInput.value.trim();
          if (!note) {
            showToast("Вкажіть причину відхилення", "error");
            return;
          }
          if (!confirm(`Відхилити аукціон #${auction.id}?`)) return;
          try {
            await rejectAuction(auction.id, note);
            showToast("Аукціон відхилено", "success");
            await loadPendingAuctions();
            await render();
          } catch (err) {
            showToast(err?.message || "Помилка", "error");
          }
        });

        actions.append(btnApprove, btnReject);
        card.append(header, meta, noteInput, actions);
        moderationList.appendChild(card);
      });

    } catch (err) {
      console.error("Load pending auctions error:", err);
      moderationList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">❌</div>
          <p class="empty-state-text" style="color: var(--error-color);">${err?.message || 'Помилка завантаження'}</p>
          <button type="button" class="btn btn-primary btn-compact" onclick="location.reload()">Перезавантажити</button>
        </div>
      `;
    }
  }

  await loadPendingAuctions();
  collapsible(moderationSection, "moderation");
  moderationSection.id = "moderation";
  root.appendChild(moderationSection);

  root.appendChild(create);
  updateActiveNav();
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = await initAccessControl({
    requireAdmin: true,
    redirectTo: "account.html",
    onDenied: () => showToast("Потрібен доступ адміністратора", "error"),
  });
  if (!session?.user) return;
  S.currentUser = session.user;
  try {
    const profileInfo = await getMyProfile().catch(() => null);
    const box = document.getElementById("admin-profile-summary");
    if (box) {
      box.innerHTML = "";
      const strong = document.createElement("strong");
      strong.textContent = session.user.username;
      box.append("Увійшли як ", strong);
      if (profileInfo?.profile) {
        const full = [
          profileInfo.profile.first_name,
          profileInfo.profile.last_name,
        ]
          .filter(Boolean)
          .join(" ");
        if (full) {
          const span = document.createElement("span");
          span.className = "muted";
          span.style.marginLeft = "8px";
          span.textContent = full;
          box.appendChild(span);
        }
      }
      const link = document.createElement("a");
      link.href = "account.html";
      link.className = "btn";
      link.style.marginLeft = "8px";
      link.textContent = "Профіль";
      box.appendChild(link);
    }
  } catch {}
  await render();
  document.addEventListener(
    "scroll",
    () => requestAnimationFrame(updateActiveNav),
    { passive: true },
  );
});
