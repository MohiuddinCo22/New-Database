// ============================================================================
// UTILITIES — toasts, formatting helpers, confirm dialog, random key generator
// ============================================================================

/** Show a toast notification. type: 'success' | 'error' | 'info' */
export function toast(message, type = "success") {
  const wrap = document.getElementById("toastWrap");
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <span class="toast__icon">${iconFor(type)}</span>
    <span class="toast__msg">${escapeHtml(message)}</span>
  `;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast--show"));
  setTimeout(() => {
    el.classList.remove("toast--show");
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

function iconFor(type) {
  if (type === "success") return "✓";
  if (type === "error") return "✕";
  return "ℹ";
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Custom-styled confirm dialog. Returns a Promise<boolean>. */
export function confirmDialog({ title = "Are you sure?", body = "", confirmText = "Delete", danger = true }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirmOverlay");
    overlay.innerHTML = `
      <div class="modal modal--confirm">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(body)}</p>
        <div class="modal__actions">
          <button class="btn btn--ghost" id="confirmCancel">Cancel</button>
          <button class="btn ${danger ? "btn--danger" : "btn--primary"}" id="confirmOk">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    overlay.classList.add("overlay--show");
    const close = (val) => {
      overlay.classList.remove("overlay--show");
      overlay.innerHTML = "";
      resolve(val);
    };
    overlay.querySelector("#confirmCancel").onclick = () => close(false);
    overlay.querySelector("#confirmOk").onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
  });
}

/** Format a Firestore Timestamp / Date / ISO-ish value into date + time strings. */
export function splitDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const dateStr = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { dateStr, timeStr };
}

export function formatTaka(amount) {
  const n = Number(amount) || 0;
  return "৳" + n.toLocaleString("en-IN");
}

/** Generate a random 16-character key using A-Z and 0-9. */
export function generateRandomKey(length = 16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) {
    out += chars[arr[i] % chars.length];
  }
  return out;
}

/** Generate a short random customer/order User ID, e.g. UID-7F3K2Q */
export function generateOrderUserId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const arr = new Uint32Array(6);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) out += chars[arr[i] % chars.length];
  return `UID-${out}`;
}

/** Build a zero-padded serial like DH0001 from a numeric counter. */
export function formatSerial(n, prefix = "DH", pad = 4) {
  return `${prefix}${String(n).padStart(pad, "0")}`;
}

export function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function downloadFile(filename, content, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
