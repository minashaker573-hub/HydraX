/**
 * HYDRAX dashboard — DOM helpers and shared components.
 *
 * Everything is built with createElement/textContent, never innerHTML, so
 * device-supplied strings (event details, alert messages, device ids) can
 * never be interpreted as markup.
 */

import { isNum, NOT_AVAILABLE, percent } from './format.js';

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

/* -------------------------------------------------------------------- KPI */

/**
 * A headline metric. Pass `value: null` to render the unavailable state —
 * the tile still appears, so a missing signal is visible rather than hidden.
 */
export function kpi({ label, value, unit, sub, tone, naReason }) {
  const card = el('div', `card card-stripe${tone ? ` is-${tone}` : ''}`);
  const body = el('div', 'kpi');
  body.appendChild(el('div', 'kpi-label', label));

  if (value === null || value === undefined) {
    body.appendChild(el('div', 'kpi-value na', NOT_AVAILABLE));
    if (naReason) body.appendChild(el('div', 'kpi-sub', naReason));
  } else {
    const line = el('div', typeof value === 'string' ? 'kpi-value is-text' : 'kpi-value');
    line.appendChild(document.createTextNode(String(value)));
    if (unit) line.appendChild(el('span', 'kpi-unit', unit));
    body.appendChild(line);
    if (sub) body.appendChild(el('div', 'kpi-sub', sub));
  }

  card.appendChild(body);
  return card;
}

/* ------------------------------------------------------------------- rows */

export function row(label, value, { tone } = {}) {
  const node = el('div', 'row');
  node.appendChild(el('span', 'row-label', label));

  if (value === null || value === undefined) {
    node.appendChild(el('span', 'row-value is-na', NOT_AVAILABLE));
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
  title.appendChild(pill(NOT_AVAILABLE, 'na'));
  node.appendChild(title);
  node.appendChild(el('p', 'na-reason', reason));

  if (planned.length > 0) {
    node.appendChild(el('div', 'kpi-label', 'UI prepared for'));
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

/** Moisture bar showing the reading against the configured hysteresis band. */
export function gauge(average, config) {
  const wrap = el('div');
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
        ? `start ${config.start_percent}% · stop ${config.stop_percent}%`
        : 'no threshold configured',
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
    return empty(
      'Not enough history yet',
      'A chart appears once at least two telemetry samples have been recorded.',
    );
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

  const x = (t) => pad.left + ((t - tMin) / tSpan) * plotW;
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
  const scroll = el('div', 'chart-wrap');
  scroll.appendChild(root);
  wrap.appendChild(scroll);

  const legend = el('div', 'chart-legend');
  usable.forEach((s, i) => {
    const item = el('span');
    const line = el('span', 'legend-line');
    line.style.background = CHART_COLORS[i % CHART_COLORS.length];
    item.appendChild(line);
    item.appendChild(document.createTextNode(`${s.name} · now ${percent(s.points[s.points.length - 1].v)}%`));
    legend.appendChild(item);
  });
  legend.appendChild(el('span', null, `${usable[0].points.length} samples`));
  wrap.appendChild(legend);
  return wrap;
}

/* ------------------------------------------------------------------- farm */

/**
 * Schematic farm layout. Deliberately flat and diagrammatic: it encodes zone
 * moisture, valve state and irrigation activity, and nothing else.
 */
export function farmSchematic(device) {
  const zones = device.zones || [];
  const width = 620;
  const height = 210;

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
    x: 14, y: 78, width: 78, height: 54, rx: 6,
    fill: 'var(--surface-2)', stroke: pumpColor, 'stroke-width': pumpOn ? 2 : 1,
  }));
  const pumpLabel = svg('text', { x: 53, y: 100, 'text-anchor': 'middle', class: 'chart-axis' });
  pumpLabel.textContent = 'PUMP';
  root.appendChild(pumpLabel);
  const pumpState = svg('text', {
    x: 53, y: 118, 'text-anchor': 'middle', class: 'chart-axis',
    fill: pumpOn ? 'var(--water)' : 'var(--dim)',
    'font-weight': '700',
  });
  pumpState.textContent = pumpOn ? 'ON' : 'OFF';
  root.appendChild(pumpState);

  // --- main line -----------------------------------------------------------
  root.appendChild(svg('line', {
    x1: 92, y1: 105, x2: 150, y2: 105,
    stroke: pumpColor, 'stroke-width': pumpOn ? 3 : 2,
  }));

  // --- zones ---------------------------------------------------------------
  const zoneW = 190;
  const zoneH = 82;
  const startX = 176;

  zones.slice(0, 2).forEach((zone, i) => {
    const zy = i === 0 ? 12 : 116;
    const flowing = zone.valve_open === true && pumpOn;
    const branchColor = flowing ? 'var(--water)' : 'var(--border-strong)';

    // branch from the main line to this zone's valve
    root.appendChild(svg('path', {
      d: `M150 105 L150 ${zy + zoneH / 2} L${startX - 34} ${zy + zoneH / 2}`,
      fill: 'none', stroke: branchColor, 'stroke-width': flowing ? 3 : 1.5,
    }));

    // valve
    root.appendChild(svg('circle', {
      cx: startX - 20, cy: zy + zoneH / 2, r: 9,
      fill: zone.valve_open ? 'var(--water)' : 'var(--surface)',
      stroke: zone.valve_open ? 'var(--water)' : 'var(--border-strong)',
      'stroke-width': 2,
    }));

    // zone body, tinted by moisture when a reading exists
    const avg = zone.average;
    root.appendChild(svg('rect', {
      x: startX, y: zy, width: zoneW, height: zoneH, rx: 8,
      fill: 'var(--surface-2)',
      stroke: zone.irrigating ? 'var(--water)' : 'var(--border)',
      'stroke-width': zone.irrigating ? 2 : 1,
    }));

    if (isNum(avg)) {
      // moisture fill: proportional, drawn from the bottom like a soil column
      const fillH = Math.max(2, (clamp(avg) / 100) * (zoneH - 8));
      root.appendChild(svg('rect', {
        x: startX + 4, y: zy + zoneH - 4 - fillH, width: zoneW - 8, height: fillH, rx: 5,
        fill: 'var(--water)', opacity: 0.13,
      }));
    }

    const name = svg('text', { x: startX + 14, y: zy + 26, class: 'chart-axis', 'font-weight': '700' });
    name.textContent = `ZONE ${zone.zone}`;
    root.appendChild(name);

    const value = svg('text', {
      x: startX + 14, y: zy + 56,
      'font-size': '24', 'font-weight': '650',
      fill: 'var(--ink)', 'font-family': 'var(--font-sans)',
    });
    value.textContent = isNum(avg) ? `${avg.toFixed(1)}%` : '—';
    root.appendChild(value);

    const state = svg('text', {
      x: startX + zoneW - 14, y: zy + 26, 'text-anchor': 'end', class: 'chart-axis',
      fill: zone.valve_open ? 'var(--water)' : 'var(--dim)', 'font-weight': '700',
    });
    state.textContent = zone.valve_open ? 'VALVE OPEN' : 'VALVE CLOSED';
    root.appendChild(state);

    // coverage warning, only when genuinely degraded
    if (zone.valid_sensors < 2) {
      const warn = svg('text', {
        x: startX + zoneW - 14, y: zy + zoneH - 12, 'text-anchor': 'end', class: 'chart-axis',
        fill: zone.valid_sensors === 0 ? 'var(--crit)' : 'var(--warn)', 'font-weight': '700',
      });
      warn.textContent = zone.valid_sensors === 0 ? 'NO VALID PROBE' : 'DEGRADED';
      root.appendChild(warn);
    }
  });

  const wrap = el('div');
  wrap.appendChild(root);

  const legend = el('div', 'farm-legend');
  legend.appendChild(legendItem('var(--water)', 'Water flowing / valve open'));
  legend.appendChild(legendItem('var(--border-strong)', 'Idle'));
  legend.appendChild(legendItem('var(--warn)', 'Degraded sensor coverage'));
  legend.appendChild(el('span', null, 'Fill height = zone average moisture'));
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
