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
 *
 * Language is a client-only concern: switching it re-renders the current view
 * from the state already in memory (see `onLangChange` below) — no re-fetch,
 * no reload. See i18n.js for the dictionary and persistence.
 */

import { fetchAllAlerts, fetchDashboard, fetchDevice, fetchHistory } from './api.js';
import { relativeTime } from './format.js';
import { applyStaticTranslations, getLang, onLangChange, setLang, t } from './i18n.js';
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
  overview: { titleKey: 'nav.overview', render: overviewView },
  irrigation: { titleKey: 'nav.irrigation', render: irrigationView },
  pump: { titleKey: 'nav.pump', render: pumpView },
  water: { titleKey: 'nav.water', render: waterView },
  safety: { titleKey: 'nav.safety', render: safetyView },
  alerts: { titleKey: 'nav.alerts', render: alertsView },
  device: { titleKey: 'nav.device', render: deviceView },
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
  systemChip: document.getElementById('system-chip'),
  topbarStatusDot: document.getElementById('topbar-status-dot'),
  topbarStatusText: document.getElementById('topbar-status-text'),
  sourceBadge: document.getElementById('source-badge'),
  navCount: document.getElementById('nav-alert-count'),
  navItems: Array.from(document.querySelectorAll('.nav-item')),
  sidebar: document.getElementById('sidebar'),
  scrim: document.getElementById('sidebar-scrim'),
  navToggle: document.getElementById('nav-toggle'),
  notifButton: document.getElementById('notif-button'),
  notifCount: document.getElementById('notif-count'),
  deviceStatusDot: document.getElementById('device-status-dot'),
  deviceStatusText: document.getElementById('device-status-text'),
  deviceLastContact: document.getElementById('device-last-contact'),
  langButtons: Array.from(document.querySelectorAll('[data-lang]')),
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
  closeSidebar();
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

/* --------------------------------------------------------- mobile drawer -- */

function openSidebar() {
  if (!nodes.sidebar) return;
  nodes.sidebar.classList.add('is-open');
  if (nodes.scrim) nodes.scrim.hidden = false;
  if (nodes.navToggle) nodes.navToggle.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  if (!nodes.sidebar) return;
  nodes.sidebar.classList.remove('is-open');
  if (nodes.scrim) nodes.scrim.hidden = true;
  if (nodes.navToggle) nodes.navToggle.setAttribute('aria-expanded', 'false');
}

if (nodes.navToggle) {
  nodes.navToggle.addEventListener('click', () => {
    if (nodes.sidebar && nodes.sidebar.classList.contains('is-open')) closeSidebar();
    else openSidebar();
  });
}
if (nodes.scrim) nodes.scrim.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSidebar();
});
// A resize back to desktop must not leave the drawer state stuck open behind
// a layout that no longer has a scrim for it.
const wide = window.matchMedia('(min-width: 861px)');
wide.addEventListener('change', (event) => {
  if (event.matches) closeSidebar();
});

/* ------------------------------------------------------------- language -- */

for (const button of nodes.langButtons) {
  button.addEventListener('click', () => setLang(button.dataset.lang));
}

function syncLangButtons() {
  const active = getLang();
  for (const button of nodes.langButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === active));
  }
}

onLangChange(() => {
  applyStaticTranslations();
  syncLangButtons();
  render();
});

/* ----------------------------------------------------------- notification -- */

if (nodes.notifButton) {
  nodes.notifButton.addEventListener('click', () => setView('alerts', { focus: true }));
}

/* --------------------------------------------------------------- chrome -- */

function renderChrome() {
  const view = VIEWS[state.view];
  nodes.title.textContent = t(view.titleKey);

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
      badge.textContent = t('chrome.demo');
    } else if (device.online) {
      badge.className = 'source-badge is-live';
      badge.textContent = t('chrome.live');
    } else {
      badge.className = 'source-badge is-offline';
      badge.textContent = t('chrome.deviceOffline');
    }
  }

  const openAlerts = device && device.alerts ? device.alerts.length : 0;
  nodes.navCount.hidden = openAlerts === 0;
  nodes.navCount.textContent = String(openAlerts);
  if (nodes.notifCount) {
    nodes.notifCount.hidden = openAlerts === 0;
    nodes.notifCount.textContent = String(openAlerts);
  }

  // System chip reflects the DASHBOARD's own connection to the backend — a
  // different signal from the sidebar's device status below, and says
  // plainly (via the banner, and this chip's title tooltip) that it has no
  // bearing on whether the farm is being watered.
  if (nodes.topbarStatusDot && nodes.topbarStatusText && nodes.systemChip) {
    if (state.error) {
      const stale = Date.now() - state.lastSuccessAt > STALE_AFTER_MS;
      nodes.topbarStatusDot.className = 'status-dot';
      nodes.topbarStatusDot.classList.toggle('is-crit', stale);
      nodes.topbarStatusText.textContent = t('sidebar.disconnected');
      nodes.systemChip.title = t('chrome.backendUnreachable');
    } else {
      nodes.topbarStatusDot.className = 'status-dot is-online';
      nodes.topbarStatusText.textContent = t('sidebar.connected');
      nodes.systemChip.title = t('chrome.updatedAt', { time: new Date().toLocaleTimeString() });
    }
  }

  // Sidebar device status footer — only real fields, mirroring what the
  // device detail already reports elsewhere on the dashboard.
  if (nodes.deviceStatusDot && nodes.deviceStatusText) {
    const online = Boolean(device && device.online);
    nodes.deviceStatusDot.className = `status-dot${online ? ' is-online' : ''}`;
    nodes.deviceStatusText.textContent = online ? t('sidebar.connected') : t('sidebar.disconnected');
  }
  if (nodes.deviceLastContact) {
    nodes.deviceLastContact.textContent = device
      ? `${t('sidebar.lastContact')}: ${relativeTime(device.last_seen_at)}`
      : '';
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
      banner('error', t('banner.backendUnreachableTitle'), t('banner.backendUnreachableBody', { reason: state.error })),
    );
    return;
  }

  if (state.error && state.device) {
    container.appendChild(
      banner(
        'error',
        t('banner.lastKnownTitle'),
        t('banner.lastKnownBody', { time: relativeTime(new Date(state.lastSuccessAt).toISOString()) }),
      ),
    );
  }

  if (state.device && state.device.simulated) {
    container.appendChild(banner('demo', t('banner.demoTitle'), t('banner.demoBody')));
  }

  if (state.device && !state.device.online && !state.device.simulated) {
    container.appendChild(
      banner(
        'error',
        t('banner.deviceOfflineTitle'),
        t('banner.deviceOfflineBody', { time: relativeTime(state.device.last_seen_at) }),
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
      onNavigate: (name) => setView(name, { focus: true }),
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
  applyStaticTranslations();
  syncLangButtons();
  await pollLive();
  await pollSlow();
  setInterval(pollLive, LIVE_POLL_MS);
  setInterval(pollSlow, SLOW_POLL_MS);
}

void start();
