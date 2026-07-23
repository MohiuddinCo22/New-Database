// ============================================================================
// DASHBOARD — summary cards, recomputed on every realtime update
// ============================================================================
import { formatTaka } from "./utils.js";

export function renderDashboard(container, orders) {
  const totalKeys = orders.length;
  const paid = orders.filter((o) => o.paymentStatus === "Paid");
  const due = orders.filter((o) => o.paymentStatus === "Due");
  const totalPaid = paid.reduce((sum, o) => sum + (Number(o.price) || 0), 0);
  const totalDue = due.reduce((sum, o) => sum + (Number(o.price) || 0), 0);
  const totalRevenue = totalPaid + totalDue;
  const activated = orders.filter((o) => o.activationStatus === "Activated").length;

  container.innerHTML = `
    <div class="card card--glass stat-card">
      <div class="stat-card__icon stat-card__icon--keys">🔑</div>
      <div>
        <p class="stat-card__label">Total Generated Keys</p>
        <p class="stat-card__value">${totalKeys.toLocaleString()}</p>
      </div>
    </div>
    <div class="card card--glass stat-card">
      <div class="stat-card__icon stat-card__icon--paid">✓</div>
      <div>
        <p class="stat-card__label">Total Paid Amount</p>
        <p class="stat-card__value">${formatTaka(totalPaid)}</p>
      </div>
    </div>
    <div class="card card--glass stat-card">
      <div class="stat-card__icon stat-card__icon--due">⏳</div>
      <div>
        <p class="stat-card__label">Total Due Amount</p>
        <p class="stat-card__value">${formatTaka(totalDue)}</p>
      </div>
    </div>
    <div class="card card--glass stat-card">
      <div class="stat-card__icon stat-card__icon--revenue">📈</div>
      <div>
        <p class="stat-card__label">Total Revenue</p>
        <p class="stat-card__value">${formatTaka(totalRevenue)}</p>
      </div>
    </div>
    <div class="card card--glass stat-card stat-card--wide">
      <div class="stat-card__icon stat-card__icon--activated">⚡</div>
      <div>
        <p class="stat-card__label">Activated Keys</p>
        <p class="stat-card__value">${activated.toLocaleString()} <span class="stat-card__sub">/ ${totalKeys.toLocaleString()}</span></p>
      </div>
    </div>
  `;
}
