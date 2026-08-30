/**
 * HYDRAX — operator console for quote requests.
 *
 * The operator key is held in sessionStorage: it survives a reload of this tab
 * and disappears when the tab closes. It is never written to localStorage
 * (which would persist on a shared machine), never placed in a URL, and never
 * baked into the served page — the page asks for it.
 *
 * Every value rendered here came from a public form. Nothing is inserted as
 * markup; textContent only.
 */

const KEY_STORAGE = 'hydrax-admin-key';

const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const gateError = document.getElementById('gate-error');
const keyInput = document.getElementById('admin-key');
const consoleEl = document.getElementById('console');
const listEl = document.getElementById('list');
const countsEl = document.getElementById('counts');
const filtersEl = document.getElementById('filters');
const linkState = document.getElementById('link-state');
const signOut = document.getElementById('sign-out');

let adminKey = null;
let statusFilter = 'ALL';

const STATUSES = ['NEW', 'CONTACTED', 'QUOTED', 'CLOSED'];

const CAPABILITY_LABELS = {
  SMART_IRRIGATION: 'Smart irrigation',
  PUMP_MONITORING: 'Pump monitoring',
  WATER_NETWORK_MONITORING: 'Water network',
  SAFETY_MONITORING: 'Safety monitoring',
};

const IRRIGATION_LABELS = { DRIP: 'Drip', SPRINKLER: 'Sprinkler', OTHER: 'Other' };

/* ------------------------------------------------------------------- dom -- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function formatDate(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : new Date(t).toLocaleString();
}

/* ------------------------------------------------------------------ api -- */

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: { ...(options.headers ?? {}), 'X-Admin-Key': adminKey ?? '' },
  });
  if (response.status === 401) {
    forgetKey('That key was not accepted.');
    throw new Error('unauthorized');
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/* ----------------------------------------------------------------- gate -- */

function forgetKey(message) {
  adminKey = null;
  try {
    sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    /* private mode: nothing to clear */
  }
  consoleEl.hidden = true;
  gate.hidden = false;
  signOut.hidden = true;
  linkState.textContent = '';
  if (message) {
    gateError.textContent = message;
    gateError.hidden = false;
  }
  keyInput.value = '';
  keyInput.focus();
}

gateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  gateError.hidden = true;
  const candidate = keyInput.value.trim();
  if (candidate === '') return;

  adminKey = candidate;
  try {
    await api('/api/v1/requests?limit=1');
  } catch {
    // forgetKey already reported a 401; anything else is a transport problem.
    if (adminKey !== null) {
      gateError.textContent = 'Could not reach the server. Is the backend running?';
      gateError.hidden = false;
      adminKey = null;
    }
    return;
  }

  try {
    sessionStorage.setItem(KEY_STORAGE, adminKey);
  } catch {
    /* private mode: the key simply will not survive a reload */
  }
  enterConsole();
});

signOut.addEventListener('click', () => forgetKey(null));

function enterConsole() {
  gate.hidden = true;
  consoleEl.hidden = false;
  signOut.hidden = false;
  void load();
}

/* --------------------------------------------------------------- render -- */

function statusPill(status) {
  return el('span', `pill pill-${status.toLowerCase()}`, status);
}

function renderCounts(counts) {
  countsEl.replaceChildren();
  const total = STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  const all = el('div', 'count');
  all.appendChild(el('span', 'count-value', String(total)));
  all.appendChild(el('span', 'count-label', 'total'));
  countsEl.appendChild(all);

  for (const status of STATUSES) {
    const card = el('div', `count count-${status.toLowerCase()}`);
    card.appendChild(el('span', 'count-value', String(counts[status] ?? 0)));
    card.appendChild(el('span', 'count-label', status.toLowerCase()));
    countsEl.appendChild(card);
  }
}

function renderRequest(request) {
  const card = el('article', 'req');

  // --- header -------------------------------------------------------------
  const head = el('div', 'req-head');
  const ref = el('div', 'req-ref');
  ref.appendChild(el('span', 'req-reference', request.reference));
  ref.appendChild(el('span', 'req-date', formatDate(request.created_at)));
  head.appendChild(ref);
  head.appendChild(statusPill(request.status));
  card.appendChild(head);

  // --- customer -----------------------------------------------------------
  const body = el('div', 'req-body');

  const customer = el('div', 'req-col');
  customer.appendChild(el('h3', 'req-col-title', 'Customer'));
  customer.appendChild(field('Name', request.customer.full_name));
  customer.appendChild(field('Phone', request.customer.phone));
  customer.appendChild(field('Email', request.customer.email ?? 'not provided'));
  body.appendChild(customer);

  const farm = el('div', 'req-col');
  farm.appendChild(el('h3', 'req-col-title', 'Farm'));
  farm.appendChild(field('Size', request.farm.size));
  farm.appendChild(field('Location', request.farm.location));
  farm.appendChild(
    field('Irrigation', IRRIGATION_LABELS[request.farm.irrigation_type] ?? request.farm.irrigation_type),
  );
  farm.appendChild(field('Zones', String(request.farm.zone_count)));
  body.appendChild(farm);

  card.appendChild(body);

  // --- capabilities -------------------------------------------------------
  const caps = el('div', 'req-caps');
  caps.appendChild(el('span', 'req-caps-label', 'Requested'));
  for (const capability of request.capabilities) {
    caps.appendChild(el('span', 'cap', CAPABILITY_LABELS[capability] ?? capability));
  }
  card.appendChild(caps);

  // --- notes --------------------------------------------------------------
  if (request.notes) {
    const notes = el('div', 'req-notes');
    notes.appendChild(el('span', 'req-caps-label', 'Notes'));
    notes.appendChild(el('p', null, request.notes));
    card.appendChild(notes);
  }

  // --- status control -----------------------------------------------------
  const actions = el('div', 'req-actions');
  actions.appendChild(el('span', 'req-caps-label', 'Set status'));
  for (const status of STATUSES) {
    const button = el('button', 'status-btn', status);
    button.type = 'button';
    button.disabled = status === request.status;
    button.addEventListener('click', () => void setStatus(request.reference, status, button));
    actions.appendChild(button);
  }
  card.appendChild(actions);

  return card;
}

function field(label, value) {
  const row = el('div', 'req-field');
  row.appendChild(el('span', 'req-field-label', label));
  row.appendChild(el('span', 'req-field-value', value));
  return row;
}

/* ----------------------------------------------------------------- data -- */

async function setStatus(reference, status, button) {
  button.disabled = true;
  try {
    await api(`/api/v1/requests/${encodeURIComponent(reference)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  } catch {
    button.disabled = false;
    linkState.textContent = 'update failed';
  }
}

async function load() {
  try {
    const query = statusFilter === 'ALL' ? '' : `&status=${encodeURIComponent(statusFilter)}`;
    const data = await api(`/api/v1/requests?limit=200${query}`);

    renderCounts(data.counts ?? {});
    listEl.replaceChildren();

    if (data.requests.length === 0) {
      const empty = el('div', 'empty');
      empty.appendChild(
        el(
          'strong',
          null,
          statusFilter === 'ALL' ? 'No requests yet' : `No requests with status ${statusFilter}`,
        ),
      );
      empty.appendChild(
        el('span', null, 'Submissions from the public request form appear here.'),
      );
      listEl.appendChild(empty);
    } else {
      for (const request of data.requests) listEl.appendChild(renderRequest(request));
    }

    linkState.textContent = `updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') return;
    linkState.textContent = 'backend unreachable';
  }
}

/* -------------------------------------------------------------- filters -- */

filtersEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.dataset.status === undefined) return;

  statusFilter = target.dataset.status;
  for (const button of filtersEl.querySelectorAll('.filter')) {
    button.setAttribute('aria-pressed', String(button.dataset.status === statusFilter));
  }
  void load();
});

document.getElementById('refresh').addEventListener('click', () => void load());

/* ----------------------------------------------------------------- boot -- */

try {
  const stored = sessionStorage.getItem(KEY_STORAGE);
  if (stored) {
    adminKey = stored;
    enterConsole();
  } else {
    keyInput.focus();
  }
} catch {
  keyInput.focus();
}
