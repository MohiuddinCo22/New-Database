// ============================================================================
// ORDERS — realtime Firestore sync, key generation, CRUD, table rendering,
// search / filter / pagination, CSV import & export.
// ============================================================================
import {
  collection, doc, onSnapshot, query, orderBy, runTransaction,
  updateDoc, deleteDoc, serverTimestamp, setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import {
  toast, confirmDialog, splitDateTime, formatTaka, generateRandomKey,
  generateOrderUserId, formatSerial, debounce, downloadFile, escapeHtml,
} from "./utils.js";
import { isAdmin } from "./auth.js";

const PAGE_SIZE = 15;

export const ordersState = {
  all: [],          // full realtime list, newest first
  filtered: [],      // after search + filter
  page: 1,
  search: "",
  filter: "all",     // all | paid | due | activated | not-activated
};

class DuplicateKeyError extends Error {}

/** Start the realtime listener. Call once after login. */
export function watchOrders(onChange) {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    ordersState.all = [];
    snap.forEach((d) => ordersState.all.push({ id: d.id, ...d.data() }));
    applySearchAndFilter();
    onChange(ordersState.all);
  }, (err) => {
    console.error(err);
    toast("Realtime sync error — check your connection.", "error");
  });
}

// ---------------------------------------------------------------------------
// Generate a brand-new key + order, guaranteed unique, via a Firestore
// transaction (auto-retries on the astronomically rare key collision).
// ---------------------------------------------------------------------------
export async function generateNewOrder(uid) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidateKey = generateRandomKey(16);
    try {
      return await runTransaction(db, async (tx) => {
        const counterRef = doc(db, "meta", "counters");
        const keyRef = doc(db, "keys", candidateKey);
        const counterSnap = await tx.get(counterRef);
        const keySnap = await tx.get(keyRef);
        if (keySnap.exists()) throw new DuplicateKeyError();

        const last = counterSnap.exists() ? (counterSnap.data().lastSerial || 0) : 0;
        const next = last + 1;
        const serial = formatSerial(next);
        const userId = generateOrderUserId();
        const newOrderRef = doc(collection(db, "orders"));

        tx.set(counterRef, { lastSerial: next }, { merge: true });
        tx.set(keyRef, { orderId: newOrderRef.id, createdAt: serverTimestamp() });
        tx.set(newOrderRef, {
          serial,
          userId,
          key: candidateKey,
          price: 675,
          paymentStatus: "Due",
          activationStatus: "Not Activated",
          createdAt: serverTimestamp(),
          createdBy: uid,
        });
        return { id: newOrderRef.id, serial, key: candidateKey };
      });
    } catch (err) {
      if (err instanceof DuplicateKeyError) continue; // retry with a fresh random key
      throw err;
    }
  }
  throw new Error("Could not generate a unique key after several attempts. Please try again.");
}

export async function updateOrder(orderId, patch) {
  await updateDoc(doc(db, "orders", orderId), patch);
}

export async function deleteOrder(order) {
  await deleteDoc(doc(db, "orders", order.id));
  // Free up the key so it (in theory) could be reused / audited later.
  try { await deleteDoc(doc(db, "keys", order.key)); } catch (_) { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Search / filter / pagination (client-side, over the realtime cache)
// ---------------------------------------------------------------------------
export function setSearch(term) {
  ordersState.search = term.trim().toLowerCase();
  ordersState.page = 1;
  applySearchAndFilter();
}

export function setFilter(filter) {
  ordersState.filter = filter;
  ordersState.page = 1;
  applySearchAndFilter();
}

export function setPage(page) {
  ordersState.page = page;
}

function applySearchAndFilter() {
  let rows = ordersState.all;

  if (ordersState.filter === "paid") rows = rows.filter((o) => o.paymentStatus === "Paid");
  else if (ordersState.filter === "due") rows = rows.filter((o) => o.paymentStatus === "Due");
  else if (ordersState.filter === "activated") rows = rows.filter((o) => o.activationStatus === "Activated");
  else if (ordersState.filter === "not-activated") rows = rows.filter((o) => o.activationStatus === "Not Activated");

  const s = ordersState.search;
  if (s) {
    rows = rows.filter((o) =>
      o.userId?.toLowerCase().includes(s) ||
      o.key?.toLowerCase().includes(s) ||
      o.paymentStatus?.toLowerCase().includes(s) ||
      o.serial?.toLowerCase().includes(s)
    );
  }
  ordersState.filtered = rows;
}

export const debouncedSearch = debounce((term, rerender) => {
  setSearch(term);
  rerender();
}, 180);

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
export function renderOrdersTable(container, paginationEl) {
  const admin = isAdmin();
  const { filtered, page } = ordersState;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  ordersState.page = clampedPage;
  const start = (clampedPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  if (pageRows.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">🔑</div>
      <p>No matching keys yet.</p>
      <span>Generate a new key or adjust your search &amp; filters.</span>
    </div>`;
  } else {
    container.innerHTML = pageRows.map((o) => rowHtml(o, admin)).join("");
  }

  renderPagination(paginationEl, clampedPage, totalPages);
}

function rowHtml(o, admin) {
  const { dateStr, timeStr } = splitDateTime(o.createdAt?.toDate ? o.createdAt.toDate() : new Date());
  const paidClass = o.paymentStatus === "Paid" ? "pill--paid" : "pill--due";
  const actClass = o.activationStatus === "Activated" ? "pill--activated" : "pill--inactive";
  return `
    <tr data-id="${o.id}">
      <td class="mono">${escapeHtml(o.serial)}</td>
      <td class="mono">${escapeHtml(o.userId)}</td>
      <td>
        <div class="keycard">
          <span class="mono keycard__value">${escapeHtml(o.key)}</span>
          <button class="icon-btn copy-key" title="Copy key" data-key="${escapeHtml(o.key)}">⧉</button>
        </div>
      </td>
      <td>${formatTaka(o.price)}</td>
      <td>
        ${admin ? `
        <select class="pill-select pill-payment ${paidClass}" data-id="${o.id}">
          <option value="Due" ${o.paymentStatus === "Due" ? "selected" : ""}>Due</option>
          <option value="Paid" ${o.paymentStatus === "Paid" ? "selected" : ""}>Paid</option>
        </select>` : `<span class="pill ${paidClass}">${o.paymentStatus}</span>`}
      </td>
      <td>
        ${admin ? `
        <select class="pill-select pill-activation ${actClass}" data-id="${o.id}">
          <option value="Not Activated" ${o.activationStatus === "Not Activated" ? "selected" : ""}>Not Activated</option>
          <option value="Activated" ${o.activationStatus === "Activated" ? "selected" : ""}>Activated</option>
        </select>` : `<span class="pill ${actClass}">${o.activationStatus}</span>`}
      </td>
      <td>${dateStr}</td>
      <td>${timeStr}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn copy-key" title="Copy key" data-key="${escapeHtml(o.key)}">⧉</button>
          ${admin ? `<button class="icon-btn edit-order" title="Edit" data-id="${o.id}">✎</button>
          <button class="icon-btn danger delete-order" title="Delete" data-id="${o.id}">🗑</button>` : ""}
        </div>
      </td>
    </tr>`;
}

function renderPagination(el, page, totalPages) {
  if (totalPages <= 1) { el.innerHTML = ""; return; }
  let html = `<button class="page-btn" data-page="${page - 1}" ${page === 1 ? "disabled" : ""}>‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
      html += `<button class="page-btn ${i === page ? "page-btn--active" : ""}" data-page="${i}">${i}</button>`;
    } else if (Math.abs(i - page) === 2) {
      html += `<span class="page-dots">…</span>`;
    }
  }
  html += `<button class="page-btn" data-page="${page + 1}" ${page === totalPages ? "disabled" : ""}>›</button>`;
  el.innerHTML = html;
}

// ---------------------------------------------------------------------------
// CSV export / import (admin only for import)
// ---------------------------------------------------------------------------
export function exportCsv() {
  const header = ["Serial No.", "User ID", "Generated Key", "Price", "Payment Status", "Activation Status", "Created Date", "Created Time"];
  const lines = [header.join(",")];
  ordersState.all.forEach((o) => {
    const { dateStr, timeStr } = splitDateTime(o.createdAt?.toDate ? o.createdAt.toDate() : new Date());
    lines.push([o.serial, o.userId, o.key, o.price, o.paymentStatus, o.activationStatus, dateStr, timeStr]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  });
  downloadFile(`orders-export-${Date.now()}.csv`, lines.join("\n"));
  toast("CSV exported");
}

/** Parses a CSV file (Serial,UserID,Key,Price,PaymentStatus,ActivationStatus) and
 *  imports each row as a new order, generating a fresh unique key/serial to avoid
 *  collisions (imported price/status values are preserved). */
export async function importCsv(file, uid) {
  const text = await file.text();
  const rows = text.split(/\r?\n/).filter((r) => r.trim().length);
  rows.shift(); // header
  let imported = 0;
  for (const row of rows) {
    const cols = row.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const [, , , price, paymentStatus, activationStatus] = cols;
    const created = await generateNewOrder(uid);
    const patch = {};
    if (price) patch.price = Number(price) || 675;
    if (paymentStatus === "Paid" || paymentStatus === "Due") patch.paymentStatus = paymentStatus;
    if (activationStatus === "Activated" || activationStatus === "Not Activated") patch.activationStatus = activationStatus;
    if (Object.keys(patch).length) await updateOrder(created.id, patch);
    imported++;
  }
  return imported;
}
