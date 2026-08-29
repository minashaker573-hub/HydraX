/**
 * HYDRAX dashboard — application shell.
 *
 * Transport is polling against the existing REST API. The backend has no SSE or
 * WebSocket endpoint, and adding one was not necessary: the aggregate
 * /api/v1/dashboard call already returns everything a refresh needs, and
 * polling degrades more gracefully on a farm LAN than a long-lived socket.
 *
 * Two cadences, because the data changes at two different rates:
 *   - live state  every 3s   (/api/v1/dashboard)
 *   - history     every 15s  (telemetry history, alert history, device detail)
 */

import { fetchAllAlerts, fetchDashboard, fetchDevice, fetchHistory } from './api.js';
import { relativeTime } from './format.js';
import { banner, el } from './ui.js';
import {
  alertsView,
  deviceView,
  irrigationView,
  overviewView,
  pumpView,
  safetyView,
  waterView,
} from './views.js';

const LIVE_POLL_MS = 3000;
const SLOW_POLL_MS = 15000;
const STALE_AFTER_MS = 12000;
const HISTORY_LIMIT = 150;

const VIEWS = {
  overview: { title: 'Overview', render: overviewView },
  irrigation: { title: 'Smart Irrigation', render: irrigationView },
  pump: { title: 'Pump Health', render: pumpView },
  water: { title: 'Water Network', render: waterView },
  safety: { title: 'Safety Center', render: safetyView },
  alerts: { title: 'Alerts & Events', render: alertsView },
  device: { title: 'Device', render: deviceView },
};

/* --------------------------------------------------------------- state -- */

const state = {
  view: readViewFromHash(),
  device: null,
  history: null,
  allAlerts: [],
  deviceDetail: null,
  filter: 'ALL',
  error: null,
  lastSuccessAt: 0,
};

const nodes = {
  view: document.getElementById('view'),
  title: document.getElementById('view-title'),
  linkState: document.getElementById('link-state'),
  sourceBadge: document.getElementById('source-badge'),
  navCount: document.getElementById('nav-alert-count'),
  navItems: Array.from(document.querySelectorAll('.nav-item')),
};

/* ------------------------------------------------------------- routing -- */

function readViewFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return Object.prototype.hasOwnProperty.call(VIEWS, raw) ? raw : 'overview';
}

function setView(name, { focus = false } = {}) {
  if (!VIEWS[name]) name = 'overview';
  state.view = name;
  if (window.location.hash !== `#${name}`) {
    window.location.hash = name;
  }
  render();
  if (focus) nodes.view.focus();
}

for (const item of nodes.navItems) {
  item.addEventListener('click', () => setView(item.dataset.view, { focus: true }));
}
window.addEventListener('hashchange', () => {
  state.view = readViewFromHash();
  render();
});

/* --------------------------------------------------------------- chrome -- */

function renderChrome() {
  const view = VIEWS[state.view];
  nodes.title.textContent = view.title;

  for (const item of nodes.navItems) {
    if (item.dataset.view === state.view) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  }

  // Source badge: DEMO / LIVE / OFFLINE, always visible so a viewer never has
  // to wonder whether they are looking at real soil.
  const device = state.device;
  const badge = nodes.sourceBadge;
  if (!device) {
    badge.hidden = true;
  } else {
    badge.hidden = false;
    if (device.simulated) {
      badge.className = 'source-badge is-demo';
      badge.textContent = 'DEMO / SIMULATION';
    } else if (device.online) {
      badge.className = 'source-badge is-live';
      badge.textContent = 'LIVE DATA';
    } else {
      badge.className = 'source-badge is-offline';
      badge.textContent = 'DEVICE OFFLINE';
    }
  }

  const openAlerts = device && device.alerts ? device.alerts.length : 0;
  nodes.navCount.hidden = openAlerts === 0;
  nodes.navCount.textContent = String(openAlerts);

  // Link state reflects the DASHBOARD's own connection, and says plainly that
  // it has no bearing on whether the farm is being watered.
  if (state.error) {
    const stale = Date.now() - state.lastSuccessAt > STALE_AFTER_MS;
    nodes.linkState.className = stale ? 'link-state is-stale' : 'link-state';
    nodes.linkState.textContent = `backend unreachable — controller unaffected`;
  } else {
    nodes.linkState.className = 'link-state';
    nodes.linkState.textContent = `updated ${new Date().toLocaleTimeString()}`;
  }
}

/* --------------------------------------------------------------- render -- */

function render() {
  renderChrome();
  const container = nodes.view;
  container.replaceChildren();

  // Backend down and nothing cached: say so, don't render an empty skeleton
  // that reads like "everything is zero".
  if (state.error && !state.device) {
    container.appendChild(
      banner(
        'error',
        'Backend unreachable.',
        `${state.error}. The controller keeps irrigating locally — only this dashboard is affected.`,
      ),
    );
    return;
  }

  if (state.error && state.device) {
    container.appendChild(
      banner(
        'error',
        'Showing last known state.',
        `The backend stopped responding ${relativeTime(new Date(state.lastSuccessAt).toISOString())}. Values below may be out of date.`,
      ),
    );
  }

  if (state.device && state.device.simulated) {
    container.appendChild(
      banner(
        'demo',
        'DEMO / SIMULATION.',
        'Telemetry on this page is synthetic, produced by the mock device fixture. It is not measured from soil.',
      ),
    );
  }

  if (state.device && !state.device.online && !state.device.simulated) {
    container.appendChild(
      banner(
        'error',
        'Device offline.',
        `No telemetry since ${relativeTime(state.device.last_seen_at)}. The controller continues irrigating on its own rules; these values are the last reported.`,
      ),
    );
  }

  const view = VIEWS[state.view];
  container.appendChild(
    view.render(state, {
      onFilter: (category) => {
        state.filter = category;
        render();
      },
    }),
  );
}

/* -------------------------------------------------------------- polling -- */

async function pollLive() {
  try {
    const data = await fetchDashboard(80);
    // Phase 1 is a single-controller system; the dashboard shows the first
    // reporting device and does not pretend to be a fleet view.
    state.device = data.devices.length > 0 ? data.devices[0] : null;
    state.error = null;
    state.lastSuccessAt = Date.now();
  } catch (error) {
    state.error = error.message;
  }
  render();
}

async function pollSlow() {
  if (!state.device) return;
  const deviceId = state.device.device_id;

  const [history, alerts, detail] = await Promise.allSettled([
    fetchHistory(deviceId, HISTORY_LIMIT),
    fetchAllAlerts(200),
    fetchDevice(deviceId),
  ]);

  if (history.status === 'fulfilled') state.history = history.value.telemetry;
  if (alerts.status === 'fulfilled') state.allAlerts = alerts.value.alerts;
  if (detail.status === 'fulfilled') state.deviceDetail = detail.value;

  render();
}

/* ----------------------------------------------------------------- boot -- */

async function start() {
  await pollLive();
  await pollSlow();
  setInterval(pollLive, LIVE_POLL_MS);
  setInterval(pollSlow, SLOW_POLL_MS);
}

void start();
