import Database from "@tauri-apps/plugin-sql";

interface HighRiskFlow {
  id: number;
  src_ip: string;
  dst_ip: string;
  src_port: number;
  dst_port: number;
  proto: string;
  score: number;
  timestamp: number;
}

interface CountResult {
  count: number;
}

interface MaxScoreResult {
  max_score: number | null;
}

let db: Database | null = null;
let currentView = "dashboard";
let pollingInterval = 2000;
let pollingTimer: number | null = null;

async function init() {
  // Always setup navigation first so UI remains responsive even if DB fails
  setupNavigation();

  try {
    // Attempt to connect to the SQLite database
    db = await Database.load(
      "sqlite:/home/j/projects/vesper-insight/src/brain/alerts.db",
    );
    console.log("Database connected");

    // Wire up refresh button
    const refreshBtn = document.getElementById("refresh-alerts");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => fetchAlertsHistory());
    }

    // Settings: Refresh Rate Buttons
    document.querySelectorAll(".setting-btn-rate").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        const rate = parseInt(target.getAttribute("data-rate") || "2000");
        setRefreshRate(rate);
      });
    });

    // Settings: Clear History
    const clearBtn = document.getElementById("btn-clear-history");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => clearHistory());
    }

    startPolling();
  } catch (err) {
    console.warn(
      "Database connection skipped or failed (common in non-Tauri browsers):",
      err,
    );
  }
}

function setupNavigation() {
  const navItems = {
    "nav-dashboard": "dashboard",
    "nav-alerts": "alerts",
    "nav-models": "models",
    "nav-settings": "settings",
  };

  Object.entries(navItems).forEach(([id, view]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", () => switchView(view));
    }
  });
}

function switchView(viewName: string) {
  currentView = viewName;

  // Update Title
  const titleEl = document.getElementById("view-title");
  if (titleEl) {
    titleEl.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
  }

  // Toggle Views
  document.querySelectorAll(".view").forEach((el) => {
    (el as HTMLElement).style.display = "none";
  });

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.style.display = "block";
  }

  // Update Sidebar UI
  document
    .querySelectorAll(".nav-item")
    .forEach((el) => el.classList.remove("active"));
  const activeNavItem = document.getElementById(`nav-${viewName}`);
  if (activeNavItem) {
    activeNavItem.classList.add("active");
  }

  // Trigger data fetch for specific views
  if (viewName === "alerts") {
    fetchAlertsHistory();
  }

  console.log(`Switched to view: ${viewName}`);
}

async function fetchStats() {
  if (!db || currentView !== "dashboard") return;

  const totalRes = await db.select<CountResult[]>(
    "SELECT COUNT(*) as count FROM high_risk_flows",
  );
  const maxScoreRes = await db.select<MaxScoreResult[]>(
    "SELECT MAX(score) as max_score FROM high_risk_flows",
  );

  const totalEl = document.getElementById("stat-total");
  const alertsEl = document.getElementById("stat-alerts");
  const maxScoreEl = document.getElementById("stat-max-score");
  const statusDot = document.getElementById("status-dot");

  const totalRow = totalRes?.[0];
  if (totalRow) {
    if (totalEl) totalEl.textContent = totalRow.count.toString();
    if (alertsEl) alertsEl.textContent = totalRow.count.toString();
    if (statusDot) {
      statusDot.className = "status-normal";
      statusDot.style.backgroundColor = "var(--success)";
    }
  }

  const maxScoreRow = maxScoreRes?.[0];
  if (maxScoreEl && maxScoreRow) {
    maxScoreEl.textContent = (maxScoreRow.max_score ?? 0).toFixed(4);
  }
}

async function fetchAlerts() {
  if (!db || currentView !== "dashboard") return;

  const alerts = await db.select<HighRiskFlow[]>(
    "SELECT * FROM high_risk_flows ORDER BY timestamp DESC LIMIT 10",
  );
  const tbody = document.querySelector("#alerts-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  alerts.forEach((alert) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${new Date(alert.timestamp * 1000).toLocaleString()}</td>
      <td>${alert.src_ip} -> ${alert.dst_ip}</td>
      <td><span style="color: ${alert.score > 0.8 ? "var(--danger)" : "var(--warning)"}">${alert.score.toFixed(4)}</span></td>
      <td><span class="status-badge status-alert">ALERT</span></td>
    `;
    tbody.appendChild(row);
  });
}

async function fetchAlertsHistory() {
  if (!db) return;

  // Initial loading state could be added here

  const alerts = await db.select<HighRiskFlow[]>(
    "SELECT * FROM high_risk_flows ORDER BY timestamp DESC LIMIT 50",
  );
  const tbody = document.querySelector("#all-alerts-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  alerts.forEach((alert) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${new Date(alert.timestamp * 1000).toLocaleString()}</td>
      <td>${alert.src_ip}:${alert.src_port}</td>
      <td>${alert.dst_ip}:${alert.dst_port}</td>
      <td>${alert.proto}</td>
      <td><span style="color: ${alert.score > 0.8 ? "var(--danger)" : "var(--warning)"}">${alert.score.toFixed(4)}</span></td>
      <td><span class="status-badge status-alert">ALERT</span></td>
    `;
    tbody.appendChild(row);
  });
}

function setRefreshRate(ms: number) {
  pollingInterval = ms;
  startPolling();
  console.log(`Polling interval set to ${ms}ms`);
}

async function clearHistory() {
  if (!db) return;

  if (
    confirm(
      "Are you sure you want to clear all history? This cannot be undone.",
    )
  ) {
    try {
      await db.execute("DELETE FROM high_risk_flows");
      await db.execute(
        "DELETE FROM sqlite_sequence WHERE name='high_risk_flows'",
      ); // Reset ID
      alert("History cleared successfully.");

      // Update UI immediately
      const totalEl = document.getElementById("stat-total");
      const alertsEl = document.getElementById("stat-alerts");
      const maxScoreEl = document.getElementById("stat-max-score");

      if (totalEl) totalEl.textContent = "0";
      if (alertsEl) alertsEl.textContent = "0";
      if (maxScoreEl) maxScoreEl.textContent = "0.0000";

      // Clear tables
      const dashboardTable = document.querySelector("#alerts-table tbody");
      const alertsTable = document.querySelector("#all-alerts-table tbody");
      if (dashboardTable) dashboardTable.innerHTML = "";
      if (alertsTable) alertsTable.innerHTML = "";
    } catch (e) {
      console.error("Failed to clear history:", e);
      alert(`Failed to clear history: ${e}`);
    }
  }
}

function startPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
  }

  pollingTimer = setInterval(() => {
    fetchStats();
    fetchAlerts();
  }, pollingInterval);
}

window.addEventListener("DOMContentLoaded", () => {
  init();
});
