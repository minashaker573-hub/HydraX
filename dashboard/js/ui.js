/**
 * HYDRAX dashboard — DOM helpers and shared components.
 *
 * Everything is built with createElement/textContent, never innerHTML, so
 * device-supplied strings (event details, alert messages, device ids) can
 * never be interpreted as markup.
 *
 * Components here call `t()` directly for their own chrome (empty-state
 * labels, chart/legend text) so they stay correct across a live language
 * switch; text a *caller* passes in (titles, labels, messages) is expected to
 * already be translated by that caller.
 */

import { isNum, percent } from './format.js';
import { t } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

export function frag(...nodes) {
  const f = document.createDocumentFragment();
  for (const node of nodes) if (node) f.appendChild(node);
  return f;
}

/* ------------------------------------------------------------------ pills */

export function pill(text, tone = 'idle', { dot = false, pulse = false } = {}) {
  const node = el('span', `pill pill-${tone}`);
  if (dot) {
    const d = el('span', pulse ? 'dot dot-pulse' : 'dot');
    node.appendChild(d);
  }
  node.appendChild(document.createTextNode(text));
  return node;
}

/* ------------------------------------------------------------------ icons */

// A small, fixed icon set in the same line-art language as the sidebar nav
// icons — reused, not "random icons" pulled in from elsewhere. Purely
// decorative (aria-hidden): every icon duplicates information already in the
// label text next to it, never carries meaning on its own.
const ICON_PATHS = {
  moisture: 'M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z',
  temperature: 'M10 13.6V4.5a2 2 0 1 1 4 0v9.1a4 4 0 1 1-4 0Z',
  system: 'M12 3v6M6.6 6.6a7 7 0 1 0 10.8 0',
  irrigation: 'M3 12h4l2-7 4 14 2-7h6',
  flow: 'M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  valve: 'M12 3v4M12 17v4M5 12H1M23 12h-4M8 8l-2-2M18 8l2-2M8 16l-2 2M18 16l2 2M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
};

export function icon(name) {
  const node = svg('svg', { class: 'kpi-icon-svg', viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  const path = ICON_PATHS[name];
  if (path) node.appendChild(svg('path', { d: path }));
  return node;
}

/* -------------------------------------------------------------------- KPI */

/**
 * A headline metric. Pass `value: null` to render the unavailable state —
 * the tile still appears, so a missing signal is visible rather than hidden.
 * `icon` is optional and purely decorative — see ICON_PATHS above.
 *
 * `countUp`, if given, is the same real number `value` already renders
 * (never a separate or guessed figure) — animations.js reads it to run a
 * one-time count-up toward it on first appearance. Omit it for anything that
 * isn't a genuine number (a status word, a duration string): counting up
 * text makes no sense, and animations.js does nothing without this hook.
 */
export function kpi({ label, value, unit, sub, tone, naReason, icon: iconName, countUp }) {
  const card = el('div', `card card-stripe${tone ? ` is-${tone}` : ''}`);
  const inner = el('div', 'kpi-row');

  if (iconName) {
    const badge = el('div', `kpi-icon${tone ? ` is-${tone}` : ''}`);
    badge.appendChild(icon(iconName));
    inner.appendChild(badge);
  }

  const body = el('div', 'kpi');
  body.appendChild(el('div', 'kpi-label', label));

  if (value === null || value === undefined) {
    body.appendChild(el('div', 'kpi-value na', t('common.notAvailable')));
    if (naReason) body.appendChild(el('div', 'kpi-sub', naReason));
  } else {
    const line = el('div', typeof value === 'string' ? 'kpi-value is-text' : 'kpi-value');
    line.appendChild(document.createTextNode(String(value)));
    if (unit) line.appendChild(el('span', 'kpi-unit', unit));
    if (typeof countUp === 'number' && Number.isFinite(countUp)) {
      line.dataset.countUp = String(countUp);
      line.dataset.countUpDecimals = String((String(value).split('.')[1] || '').length);
    }
    body.appendChild(line);
    if (sub) body.appendChild(el('div', 'kpi-sub', sub));
  }

  inner.appendChild(body);
  card.appendChild(inner);
  return card;
}

/* ------------------------------------------------------------------- rows */

export function row(label, value, { tone } = {}) {
  const node = el('div', 'row');
  node.appendChild(el('span', 'row-label', label));

  if (value === null || value === undefined) {
    node.appendChild(el('span', 'row-value is-na', t('common.notAvailable')));
    return node;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    node.appendChild(el('span', `row-value${tone === 'bad' ? ' is-bad' : ''}`, value));
    return node;
  }
  const wrap = el('span', 'row-value');
  wrap.appendChild(value);
  node.appendChild(wrap);
  return node;
}

export function card(title, ...children) {
  const node = el('div', 'card');
  if (title) node.appendChild(el('h3', 'card-title', title));
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

/**
 * A card carrying live, load-bearing system state (the hero cluster, the
 * farm schematic) rather than ordinary reference content — the technical
 * bezel treatment (`.panel-tech`, corner ticks) instead of the flat card.
 */
export function panel(title, ...children) {
  const node = el('div', 'card panel-tech');
  if (title) node.appendChild(el('h3', 'card-title', title));
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

export function section(title, note, ...children) {
  const node = el('section', 'section');
  const head = el('div', 'section-head');
  head.appendChild(el('h2', 'section-title', title));
  if (note) head.appendChild(el('span', 'section-note', note));
  node.appendChild(head);
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

/* --------------------------------------------------------- empty / absent */

export function empty(headline, detail) {
  const node = el('div', 'empty');
  node.appendChild(el('strong', null, headline));
  if (detail) node.appendChild(el('span', null, detail));
  return node;
}

/**
 * The honest placeholder for a signal that has no sensor behind it.
 * `planned` lists the fields the UI is already shaped for, so the architecture
 * is visible without any of it pretending to hold data.
 */
export function notAvailable(reason, planned = []) {
  const node = el('div', 'na-block');
  const title = el('div', 'na-title');
  title.appendChild(pill(t('common.notAvailable'), 'na'));
  node.appendChild(title);
  node.appendChild(el('p', 'na-reason', reason));

  if (planned.length > 0) {
    node.appendChild(el('div', 'kpi-label', t('ui.uiPreparedFor')));
    const list = el('ul', 'na-list');
    for (const item of planned) list.appendChild(el('li', null, item));
    node.appendChild(list);
  }
  return node;
}

export function banner(kind, strongText, message) {
  const node = el('div', `banner banner-${kind}`);
  const body = el('div');
  body.appendChild(el('strong', null, strongText));
  body.appendChild(document.createTextNode(` ${message}`));
  node.appendChild(body);
  return node;
}

/* ------------------------------------------------------------------ gauge */

/** Moisture bar showing the reading against the configured hysteresis band.
 *  Deliberately kept in a fixed left-to-right orientation regardless of page
 *  direction: a 0–100% scale is a measurement axis, not prose, and mirroring
 *  it under RTL would make it harder to read against the printed 0%/100%
 *  labels, not easier. */
export function gauge(average, config) {
  const wrap = el('div', 'ltr-scale');
  const bar = el('div', 'gauge');

  const hasBand =
    config && isNum(config.start_percent) && isNum(config.stop_percent);

  if (hasBand) {
    const band = el('div', 'gauge-band');
    const start = clamp(config.start_percent);
    const stop = clamp(config.stop_percent);
    band.style.left = `${start}%`;
    band.style.width = `${Math.max(0, stop - start)}%`;
    bar.appendChild(band);
  }

  for (const mark of [25, 50, 75]) {
    const tick = el('div', 'gauge-mark');
    tick.style.left = `${mark}%`;
    bar.appendChild(tick);
  }

  if (isNum(average)) {
    const fill = el('div', 'gauge-fill');
    fill.style.width = `${clamp(average)}%`;
    bar.appendChild(fill);
  }
  wrap.appendChild(bar);

  const scale = el('div', 'gauge-scale');
  scale.appendChild(el('span', null, '0%'));
  scale.appendChild(
    el(
      'span',
      null,
      hasBand
        ? t('chart.startStop', { start: config.start_percent, stop: config.stop_percent })
        : t('chart.noThreshold'),
    ),
  );
  scale.appendChild(el('span', null, '100%'));
  wrap.appendChild(scale);
  return wrap;
}

function clamp(v) {
  return Math.max(0, Math.min(100, v));
}

/* ------------------------------------------------------------------ chart */

const CHART_COLORS = ['var(--accent)', 'var(--ok)'];

/**
 * Line chart of zone moisture over time, drawn from real telemetry history.
 *
 * `series` is [{ name, points: [{ t, v }] }]. If there are fewer than two
 * real points the chart is not drawn at all — an empty state is returned
 * instead, because a single point rendered as a line is a fabrication.
 */
export function moistureChart(series, { height = 200 } = {}) {
  const usable = series.filter((s) => s.points.length >= 2);
  if (usable.length === 0) {
    return empty(t('chart.notEnoughHistory'), t('chart.notEnoughDetail'));
  }

  const width = 720;
  const pad = { top: 12, right: 14, bottom: 24, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  let tMin = Infinity;
  let tMax = -Infinity;
  for (const s of usable) {
    for (const p of s.points) {
      if (p.t < tMin) tMin = p.t;
      if (p.t > tMax) tMax = p.t;
    }
  }
  const tSpan = Math.max(1, tMax - tMin);

  const x = (time) => pad.left + ((time - tMin) / tSpan) * plotW;
  const y = (v) => pad.top + (1 - clamp(v) / 100) * plotH;

  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': 'Zone soil moisture over time',
  });

  // horizontal grid + y labels at 0/25/50/75/100 %
  for (const level of [0, 25, 50, 75, 100]) {
    const yy = y(level);
    root.appendChild(
      svg('line', { class: 'chart-grid', x1: pad.left, x2: width - pad.right, y1: yy, y2: yy }),
    );
    const label = svg('text', { class: 'chart-axis', x: pad.left - 7, y: yy + 3, 'text-anchor': 'end' });
    label.textContent = String(level);
    root.appendChild(label);
  }

  usable.forEach((s, i) => {
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const d = s.points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
      .join(' ');
    root.appendChild(svg('path', { class: 'chart-line', d, stroke: color }));

    // emphasized endpoint: the current reading is what the eye should land on
    const last = s.points[s.points.length - 1];
    root.appendChild(
      svg('circle', { cx: x(last.t), cy: y(last.v), r: 3.5, fill: color }),
    );
  });

  // time axis: oldest and newest sample only, kept unambiguous
  const t0 = svg('text', { class: 'chart-axis', x: pad.left, y: height - 7 });
  t0.textContent = new Date(tMin).toLocaleTimeString();
  const t1 = svg('text', { class: 'chart-axis', x: width - pad.right, y: height - 7, 'text-anchor': 'end' });
  t1.textContent = new Date(tMax).toLocaleTimeString();
  root.appendChild(t0);
  root.appendChild(t1);

  const wrap = el('div');
  // The chart's own coordinate system stays LTR (see the gauge note above);
  // only the surrounding legend text follows the page direction.
  const scroll = el('div', 'chart-wrap ltr-scale');
  scroll.appendChild(root);
  wrap.appendChild(scroll);

  const legend = el('div', 'chart-legend');
  usable.forEach((s, i) => {
    const item = el('span');
    const line = el('span', 'legend-line');
    line.style.background = CHART_COLORS[i % CHART_COLORS.length];
    item.appendChild(line);
    item.appendChild(
      document.createTextNode(`${s.name} · ${t('chart.now', { value: percent(s.points[s.points.length - 1].v) })}`),
    );
    legend.appendChild(item);
  });
  legend.appendChild(el('span', null, t('chart.samples', { n: usable[0].points.length })));
  wrap.appendChild(legend);
  return wrap;
}

/* ------------------------------------------------------------------- farm */

/**
 * Schematic farm layout. Deliberately flat and diagrammatic: it encodes zone
 * moisture, valve state and irrigation activity, and nothing else. Kept in a
 * fixed LTR orientation for the same reason as the gauge and chart above.
 *
 * Zones are laid out two per row, with the row count following the number of
 * zones the controller actually reports — the diagram is a real piping
 * schematic that scales with the farm, not a fixed two-slot mockup.
 */
export function farmSchematic(device) {
  const zones = device.zones || [];
  const perRow = 2;
  const columns = Math.max(1, Math.min(perRow, zones.length));
  const rows = Math.max(1, Math.ceil(zones.length / perRow));

  const zoneW = 190;
  const zoneH = 78;
  const rowGap = 26;
  const colGap = 44;
  const startX = 176;
  const topPad = 22;
  const manifoldOffset = 14;
  const width = startX + columns * zoneW + (columns - 1) * colGap + 20;
  const height = topPad + rows * zoneH + (rows - 1) * rowGap + 8;
  const trunkX = 150;
  const rowManifoldY = (r) => topPad + r * (zoneH + rowGap) - manifoldOffset;
  // The pump sits centered on the zone boxes themselves (never on the
  // manifold lines, which sit in the narrow gap above them) so its box
  // always has clearance; the vertical trunk then simply spans from the
  // pump's connection point to the first/last row's manifold, whichever is
  // further, which keeps every row reachable at any zone count.
  const firstBoxMidY = topPad + zoneH / 2;
  const lastBoxMidY = topPad + (rows - 1) * (zoneH + rowGap) + zoneH / 2;
  const pumpMidY = (firstBoxMidY + lastBoxMidY) / 2;
  const trunkTop = Math.min(pumpMidY, rowManifoldY(0));
  const trunkBottom = Math.max(pumpMidY, rowManifoldY(rows - 1));

  const root = svg('svg', {
    class: 'farm',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'Farm layout showing zone moisture and valve state',
  });

  // --- water source + pump -------------------------------------------------
  const pumpOn = device.pump_on === true;
  const pumpColor = pumpOn ? 'var(--water)' : 'var(--border-strong)';

  root.appendChild(svg('rect', {
    x: 14, y: pumpMidY - 27, width: 78, height: 54, rx: 4,
    fill: 'var(--surface-2)', stroke: pumpColor, 'stroke-width': pumpOn ? 2 : 1,
  }));
  const pumpLabel = svg('text', { x: 53, y: pumpMidY - 5, 'text-anchor': 'middle', class: 'chart-axis' });
  pumpLabel.textContent = t('farm.pump');
  root.appendChild(pumpLabel);
  const pumpState = svg('text', {
    x: 53, y: pumpMidY + 13, 'text-anchor': 'middle', class: 'chart-axis',
    fill: pumpOn ? 'var(--water)' : 'var(--dim)',
    'font-weight': '700',
  });
  pumpState.textContent = pumpOn ? t('farm.on') : t('farm.off');
  root.appendChild(pumpState);

  // --- main line + trunk (spans every row's manifold) -----------------------
  root.appendChild(svg('line', {
    x1: 92, y1: pumpMidY, x2: trunkX, y2: pumpMidY,
    stroke: pumpColor, 'stroke-width': pumpOn ? 3 : 2,
  }));
  root.appendChild(svg('line', {
    x1: trunkX, y1: trunkTop, x2: trunkX, y2: trunkBottom,
    stroke: pumpOn ? 'var(--border-strong)' : 'var(--border)', 'stroke-width': 2,
  }));

  // --- zones, two per row, fed from a horizontal manifold per row -----------
  // Each row gets its own manifold line sitting in the gap above its zone
  // boxes; every zone in the row drops straight down from that manifold to
  // its own valve. This is what keeps the diagram correct at any zone count
  // instead of assuming exactly two zones side by side — a third zone (or a
  // fifth row) never has to route its pipe through a neighbour's box.
  for (let r = 0; r < rows; r += 1) {
    const zonesInRow = zones.slice(r * perRow, r * perRow + perRow);
    if (zonesInRow.length === 0) continue;
    const manifoldY = rowManifoldY(r);
    const rowFlowing = zonesInRow.some((z) => z.valve_open === true) && pumpOn;
    const rightmostX = startX + (zonesInRow.length - 1) * (zoneW + colGap) - 20;
    root.appendChild(svg('line', {
      x1: trunkX, y1: manifoldY, x2: rightmostX, y2: manifoldY,
      stroke: rowFlowing ? 'var(--water)' : 'var(--border-strong)',
      'stroke-width': rowFlowing ? 2.5 : 1.5,
    }));
  }

  // --- zones ------------------------------------------------------------
  zones.forEach((zone, i) => {
    const rowIndex = Math.floor(i / perRow);
    const col = i % perRow;
    const zx = startX + col * (zoneW + colGap);
    const zy = topPad + rowIndex * (zoneH + rowGap);
    const zoneMidY = zy + zoneH / 2;
    const manifoldY = rowManifoldY(rowIndex);
    const flowing = zone.valve_open === true && pumpOn;
    const branchColor = flowing ? 'var(--water)' : 'var(--border-strong)';
    const valveX = zx - 20;

    // drop from this row's manifold straight down into the valve — never
    // sideways through another zone's box
    root.appendChild(svg('line', {
      x1: valveX, y1: manifoldY, x2: valveX, y2: zoneMidY,
      stroke: branchColor, 'stroke-width': flowing ? 3 : 1.5,
    }));

    // valve
    root.appendChild(svg('circle', {
      cx: valveX, cy: zoneMidY, r: 8,
      fill: zone.valve_open ? 'var(--water)' : 'var(--surface)',
      stroke: zone.valve_open ? 'var(--water)' : 'var(--border-strong)',
      'stroke-width': 2,
    }));

    // zone body, tinted by moisture when a reading exists
    const avg = zone.average;
    root.appendChild(svg('rect', {
      x: zx, y: zy, width: zoneW, height: zoneH, rx: 4,
      fill: 'var(--surface-2)',
      stroke: zone.irrigating ? 'var(--water)' : 'var(--border)',
      'stroke-width': zone.irrigating ? 2 : 1,
    }));

    if (isNum(avg)) {
      // moisture fill: proportional, drawn from the bottom like a soil column
      const fillH = Math.max(2, (clamp(avg) / 100) * (zoneH - 8));
      root.appendChild(svg('rect', {
        x: zx + 4, y: zy + zoneH - 4 - fillH, width: zoneW - 8, height: fillH, rx: 3,
        fill: 'var(--water)', opacity: 0.13,
      }));
    }

    const name = svg('text', { x: zx + 14, y: zy + 24, class: 'chart-axis', 'font-weight': '700' });
    name.textContent = t('common.zone', { n: zone.zone });
    root.appendChild(name);

    const value = svg('text', {
      x: zx + 14, y: zy + zoneH - 14,
      'font-size': '22', 'font-weight': '650',
      fill: 'var(--ink)', 'font-family': 'var(--font-mono)',
    });
    value.textContent = isNum(avg) ? `${avg.toFixed(1)}%` : '—';
    root.appendChild(value);

    const state = svg('text', {
      x: zx + zoneW - 14, y: zy + 24, 'text-anchor': 'end', class: 'chart-axis',
      fill: zone.valve_open ? 'var(--water)' : 'var(--dim)', 'font-weight': '700',
    });
    state.textContent = zone.valve_open ? t('farm.valveOpen') : t('farm.valveClosed');
    root.appendChild(state);

    // coverage warning, only when genuinely degraded
    if (zone.valid_sensors < 2) {
      const warn = svg('text', {
        x: zx + zoneW - 14, y: zy + zoneH - 14, 'text-anchor': 'end', class: 'chart-axis',
        fill: zone.valid_sensors === 0 ? 'var(--crit)' : 'var(--warn)', 'font-weight': '700',
      });
      warn.textContent = zone.valid_sensors === 0 ? t('farm.noValidProbe') : t('farm.degraded');
      root.appendChild(warn);
    }
  });

  const wrap = el('div');
  const scroll = el('div', 'ltr-scale');
  scroll.appendChild(root);
  wrap.appendChild(scroll);

  const legend = el('div', 'farm-legend');
  legend.appendChild(legendItem('var(--water)', t('farm.waterFlowingOpen')));
  legend.appendChild(legendItem('var(--border-strong)', t('farm.idle')));
  legend.appendChild(legendItem('var(--warn)', t('farm.degradedCoverage')));
  legend.appendChild(el('span', null, t('farm.fillHeightNote')));
  wrap.appendChild(legend);
  return wrap;
}

function legendItem(color, label) {
  const item = el('span');
  const sw = el('span', 'swatch');
  sw.style.background = color;
  item.appendChild(sw);
  item.appendChild(document.createTextNode(label));
  return item;
}
