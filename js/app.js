// ============================================================================
// APP — bootstraps the SPA: view routing, theme toggle, event wiring
// ============================================================================
import { initAuthForm, initAuthListener, logout, isAdmin, state as authState, watchUsers, adminCreateUser, adminSetUserActive, adminSetUserRole, changeOwnPassword } from "./auth.js";
import {
  watchOrders, generateNewOrder, updateOrder, deleteOrder,
  renderOrdersTable, setSearch, setFilter, setPage, ordersState,
  exportCsv, importCsv, debouncedSearch,
} from "./orders.js";
import { renderDashboard } from "./dashboard.js";
import { toast, confirmDialog, escapeHtml } from "./utils.js";

// ----------------------------- Element refs --------------------------------
const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const userNameEl = document.getElementById("currentUserName");
const userRoleEl = document.getElementById("currentUserRole");
const views = document.querySelectorAll(".view");
const navButtons = document.querySelectorAll(".nav-btn");
const ordersBody = document.getElementById("ordersBody");
const searchOrdersBody = document.getElementById("searchOrdersBody");
const ordersPagination = document.getElementById("ordersPagination");
const searchPagination = document.getElementById("searchPagination");
const dashboardCards = document.getElementById("dashboardCards");
const generateBtn = document.getElementById("generateKeyBtn");
const generateResult = document.getElementById("generateResult");
const reportSummary = document.getElementById("reportSummary");
const usersListEl = document.getElementById("usersList");

let unsubscribeOrders = null;
let unsubscribeUsers = null;

// ----------------------------- Theme ---------------------------------------
function initTheme() {
  const saved = localStorage.getItem("okm-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("themeToggle").checked = saved === "light";
}
document.getElementById("themeToggle").addEventListener("change", (e) => {
  const theme = e.target.checked ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("okm-theme", theme);
});
initTheme();

// ----------------------------- View routing ---------------------------------
function showView(name) {
  views.forEach((v) => v.classList.toggle("view--active", v.dataset.view === name));
  navButtons.forEach((b) => b.classList.toggle("nav-btn--active", b.dataset.view === name));
  document.getElementById("sidebar").classList.remove("sidebar--open");
  if (name === "search") document.getElementById("searchInput").focus();
}
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.view === "logout") { handleLogout(); return; }
    showView(btn.dataset.view);
  });
});
document.getElementById("menuToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("sidebar--open");
});

// ----------------------------- Auth bootstrap -------------------------------
initAuthForm();
initAuthListener({
  onLogin: (user, profile) => {
    loginScreen.classList.remove("screen--active");
    appShell.classList.add("shell--active");
    userNameEl.textContent = profile.displayName || user.email;
    userRoleEl.textContent = profile.role === "admin" ? "Administrator" : "Authorized User";
    document.body.classList.toggle("is-admin", profile.role === "admin");
    startRealtimeSync(user.uid);
    showView("dashboard");
  },
  onLogout: () => {
    appShell.classList.remove("shell--active");
    loginScreen.classList.add("screen--active");
    if (unsubscribeOrders) unsubscribeOrders();
    if (unsubscribeUsers) unsubscribeUsers();
  },
});

function handleLogout() {
  logout().then(() => toast("Signed out")).catch(() => toast("Sign out failed", "error"));
}

// ----------------------------- Realtime sync --------------------------------
function startRealtimeSync(uid) {
  unsubscribeOrders = watchOrders((orders) => {
    renderDashboard(dashboardCards, orders);
    renderOrdersTable(ordersBody, ordersPagination);
    renderOrdersTable(searchOrdersBody, searchPagination);
    renderReport(orders);
  });

  if (isAdmin()) {
    unsubscribeUsers = watchUsers(renderUsersList);
  }
}

// ----------------------------- Generate key ---------------------------------
generateBtn.addEventListener("click", async () => {
  generateBtn.disabled = true;
  generateBtn.classList.add("btn--loading");
  try {
    const result = await generateNewOrder(authState.user.uid);
    generateResult.innerHTML = `
      <div class="generated-card">
        <p class="generated-card__label">New key generated</p>
        <p class="generated-card__serial mono">${escapeHtml(result.serial)}</p>
        <p class="generated-card__key mono">${escapeHtml(result.key)}</p>
        <button class="btn btn--ghost" id="copyGeneratedKey">Copy Key</button>
      </div>`;
    document.getElementById("copyGeneratedKey").addEventListener("click", () => copyToClipboard(result.key));
    toast(`Key ${result.serial} generated`);
  } catch (err) {
    console.error(err);
    toast(err.message || "Failed to generate key", "error");
  } finally {
    generateBtn.disabled = false;
    generateBtn.classList.remove("btn--loading");
  }
});

// ----------------------------- Table interactions ----------------------------
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast("Key copied to clipboard"))
    .catch(() => toast("Couldn't copy key", "error"));
}

document.addEventListener("click", async (e) => {
  const copyBtn = e.target.closest(".copy-key");
  if (copyBtn) { copyToClipboard(copyBtn.dataset.key); return; }

  const delBtn = e.target.closest(".delete-order");
  if (delBtn) {
    const order = ordersState.all.find((o) => o.id === delBtn.dataset.id);
    const ok = await confirmDialog({
      title: "Delete this key?",
      body: `${order.serial} — ${order.key} will be permanently removed.`,
      confirmText: "Delete",
    });
    if (ok) {
      try { await deleteOrder(order); toast("Record deleted"); }
      catch (err) { toast("Delete failed", "error"); }
    }
    return;
  }

  const editBtn = e.target.closest(".edit-order");
  if (editBtn) { openEditModal(editBtn.dataset.id); return; }

  const pageBtn = e.target.closest(".page-btn");
  if (pageBtn && !pageBtn.disabled) {
    setPage(Number(pageBtn.dataset.page));
    renderOrdersTable(ordersBody, ordersPagination);
    renderOrdersTable(searchOrdersBody, searchPagination);
  }
});

document.addEventListener("change", async (e) => {
  if (e.target.classList.contains("pill-payment")) {
    try {
      await updateOrder(e.target.dataset.id, { paymentStatus: e.target.value });
      toast(`Payment marked as ${e.target.value}`);
    } catch { toast("Update failed", "error"); }
  }
  if (e.target.classList.contains("pill-activation")) {
    try {
      await updateOrder(e.target.dataset.id, { activationStatus: e.target.value });
      toast(`Activation set to ${e.target.value}`);
    } catch { toast("Update failed", "error"); }
  }
});

// ----------------------------- Edit modal ------------------------------------
function openEditModal(orderId) {
  const order = ordersState.all.find((o) => o.id === orderId);
  if (!order) return;
  const overlay = document.getElementById("confirmOverlay");
  overlay.innerHTML = `
    <div class="modal">
      <h3>Edit ${escapeHtml(order.serial)}</h3>
      <label class="field">
        <span>Price (৳)</span>
        <input type="number" id="editPrice" value="${order.price}" min="0" />
      </label>
      <label class="field">
        <span>Payment Status</span>
        <select id="editPayment">
          <option value="Due" ${order.paymentStatus === "Due" ? "selected" : ""}>Due</option>
          <option value="Paid" ${order.paymentStatus === "Paid" ? "selected" : ""}>Paid</option>
        </select>
      </label>
      <label class="field">
        <span>Activation Status</span>
        <select id="editActivation">
          <option value="Not Activated" ${order.activationStatus === "Not Activated" ? "selected" : ""}>Not Activated</option>
          <option value="Activated" ${order.activationStatus === "Activated" ? "selected" : ""}>Activated</option>
        </select>
      </label>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="editCancel">Cancel</button>
        <button class="btn btn--primary" id="editSave">Save Changes</button>
      </div>
    </div>`;
  overlay.classList.add("overlay--show");
  overlay.querySelector("#editCancel").onclick = () => { overlay.classList.remove("overlay--show"); overlay.innerHTML = ""; };
  overlay.querySelector("#editSave").onclick = async () => {
    const patch = {
      price: Number(document.getElementById("editPrice").value) || 0,
      paymentStatus: document.getElementById("editPayment").value,
      activationStatus: document.getElementById("editActivation").value,
    };
    try {
      await updateOrder(orderId, patch);
      toast("Record updated");
      overlay.classList.remove("overlay--show");
      overlay.innerHTML = "";
    } catch { toast("Update failed", "error"); }
  };
}

// ----------------------------- Search & filter --------------------------------
document.getElementById("searchInput").addEventListener("input", (e) => {
  debouncedSearch(e.target.value, () => {
    renderOrdersTable(searchOrdersBody, searchPagination);
    renderOrdersTable(ordersBody, ordersPagination);
  });
});

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("filter-chip--active"));
    chip.classList.add("filter-chip--active");
    setFilter(chip.dataset.filter);
    renderOrdersTable(ordersBody, ordersPagination);
    renderOrdersTable(searchOrdersBody, searchPagination);
  });
});

// ----------------------------- Reports ----------------------------------------
function renderReport(orders) {
  const paid = orders.filter((o) => o.paymentStatus === "Paid").length;
  const due = orders.filter((o) => o.paymentStatus === "Due").length;
  const activated = orders.filter((o) => o.activationStatus === "Activated").length;
  const total = orders.length || 1;
  reportSummary.innerHTML = `
    <div class="report-row"><span>Paid keys</span><div class="bar"><div class="bar__fill bar__fill--paid" style="width:${(paid/total)*100}%"></div></div><span>${paid}</span></div>
    <div class="report-row"><span>Due keys</span><div class="bar"><div class="bar__fill bar__fill--due" style="width:${(due/total)*100}%"></div></div><span>${due}</span></div>
    <div class="report-row"><span>Activated</span><div class="bar"><div class="bar__fill bar__fill--activated" style="width:${(activated/total)*100}%"></div></div><span>${activated}</span></div>
  `;
}

document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
document.getElementById("importCsvInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const count = await importCsv(file, authState.user.uid);
    toast(`${count} record(s) imported`);
  } catch (err) {
    console.error(err);
    toast("Import failed — check the CSV format", "error");
  }
  e.target.value = "";
});

// ----------------------------- Settings: users & password ----------------------
let currentUsersCount = 0;
function renderUsersList(users) {
  currentUsersCount = users.length;
  if (!usersListEl) return;
  usersListEl.innerHTML = users.map((u) => `
    <div class="user-row">
      <div>
        <p class="user-row__name">${escapeHtml(u.displayName || u.email)}</p>
        <p class="user-row__email">${escapeHtml(u.email)} · ${u.role}</p>
      </div>
      <label class="switch">
        <input type="checkbox" class="user-active-toggle" data-uid="${u.id}" ${u.active !== false ? "checked" : ""} />
        <span class="switch__slider"></span>
      </label>
    </div>`).join("");
  document.getElementById("userCount").textContent = `${users.length}/5`;
}

document.addEventListener("change", async (e) => {
  if (e.target.classList.contains("user-active-toggle")) {
    try {
      await adminSetUserActive(e.target.dataset.uid, e.target.checked);
      toast("User updated");
    } catch { toast("Update failed", "error"); }
  }
});

const addUserForm = document.getElementById("addUserForm");
if (addUserForm) {
  addUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (currentUsersCount >= 5) {
      toast("Maximum of 5 accounts allowed", "error");
      return;
    }
    const email = addUserForm.newUserEmail.value.trim();
    const password = addUserForm.newUserPassword.value;
    const displayName = addUserForm.newUserName.value.trim();
    const role = addUserForm.newUserRole.value;
    try {
      await adminCreateUser({ email, password, displayName, role });
      toast("User account created");
      addUserForm.reset();
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't create user", "error");
    }
  });
}

const changePasswordForm = document.getElementById("changePasswordForm");
if (changePasswordForm) {
  changePasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = changePasswordForm.newPassword.value;
    try {
      await changeOwnPassword(pw);
      toast("Password updated");
      changePasswordForm.reset();
    } catch (err) {
      toast("Please sign out and back in, then retry", "error");
    }
  });
}
