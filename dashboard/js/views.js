/**
 * HYDRAX dashboard — view renderers.
 *
 * Each view receives the shared app state and returns a DOM node. Views never
 * fetch; they render whatever the poller last obtained, including its absence.
 *
 * THE RULE THAT GOVERNS THIS FILE: a signal with no sensor behind it renders as
 * NOT AVAILABLE. Flow rate, pump current/temperature/vibration, leak detection
 * and the environmental safety sensors are not in the Phase 1 telemetry schema,
 * so they are shown as missing — never as zero, never as a plausible number.
 *
 * A SECOND RULE, just as firm: this dashboard has no command channel to the
 * controller. There is no API endpoint that starts or stops irrigation
 * remotely — see docs/ARCHITECTURE.md and api.js — because the network is
 * explicitly never in the decision path. So "System control" below renders
 * real, read-only state, not a start/stop button that would have nothing
 * behind it.
 *
 * Every user-visible string here goes through `t()` so the whole page renders
 * correctly in English or Arabic and re-renders correctly on a live language
 * switch (see app.js, which re-renders the current view on `onLangChange`).
 */

import {
  alertCategory,
  coverage,
  dateTime,
  duration,
  eventCategory,
  eventTone,
  humanize,
  irrigationTone,
  isNum,
  localizedLabel,
  moistureStatus,
  percent,
  relativeTime,
  statusTone,
} from './format.js';
import { t } from './i18n.js';
import {
  banner,
  card,
  el,
  empty,
  farmSchematic,
  frag,
  gauge,
  icon,
  kpi,
  moistureChart,
  notAvailable,
  pill,
  row,
  section,
} from './ui.js';

/* ========================================================================= */
/* shared helpers                                                            */
/* ========================================================================= */

/** Mean of the zone averages that actually have a reading. */
function farmAverage(zones) {
  const values = (zones || []).map((z) => z.average).filter(isNum);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function latestEventFor(events, zoneNumber, types) {
  return (
    (events || []).find(
      (e) => e.zone === zoneNumber && types.includes(e.type),
    ) || null
  );
}

function noDeviceState() {
  return frag(empty(t('noDevice.headline'), t('noDevice.detail')));
}

/**
 * Stamps a zone card with its zone number and a compact signature of the
 * real state that would make it worth animating (valve, irrigating, moisture
 * status) — animations.js diffs this against the previous poll's signature
 * so only a zone whose actual state changed animates, without that file
 * having to duplicate this page's business logic to know what "changed"
 * means for a zone.
 */
function markZoneState(node, zone, status) {
  node.dataset.zone = String(zone.zone);
  node.dataset.zoneSignature = [
    zone.valve_open ? 'open' : 'closed',
    zone.irrigating ? 'irrigating' : 'idle',
    status ? status.label : '',
  ].join('|');
}

function alertList(alerts) {
  const wrap = el('div');
  for (const alertItem of alerts) {
    const node = el(
      'div',
      `alert alert-${alertItem.severity === 'critical' ? 'critical' : 'warning'}`,
    );
    // Lets animations.js tell a genuinely new alert apart from one already on
    // screen across the app's polling renders — see onViewRendered there.
    if (alertItem.id !== undefined) node.dataset.alertId = String(alertItem.id);
    const body = el('div', 'alert-body');
    body.appendChild(el('strong', 'alert-type', localizedLabel('alertType', alertItem.type)));
    body.appendChild(el('div', 'alert-msg', alertItem.message));
    node.appendChild(body);
    node.appendChild(el('span', 'alert-time', relativeTime(alertItem.raised_at)));
    wrap.appendChild(node);
  }
  return wrap;
}

function eventTimeline(events, limit) {
  if (!events || events.length === 0) {
    return empty(t('alertsPage.noEventsRecorded'), t('alertsPage.eventsAppearHere'));
  }
  const list = el('ul', 'timeline');
  for (const event of events.slice(0, limit)) {
    const item = el('li', 'event');
    // See alertList() above — same purpose, for the event timeline.
    if (event.id !== undefined) item.dataset.eventId = String(event.id);
    item.appendChild(pill(localizedLabel('eventType', event.type), eventTone(event.type)));

    const parts = [];
    if (isNum(event.zone)) parts.push(t('common.zone', { n: event.zone }));
    if (event.detail) parts.push(event.detail);
    if (isNum(event.moisture) && event.moisture > 0) parts.push(`${percent(event.moisture)}%`);
    if (isNum(event.duration_ms) && event.duration_ms > 0) {
      parts.push(t('chart.ran', { duration: duration(event.duration_ms) }));
    }
    item.appendChild(el('span', 'event-detail', parts.join(' · ')));
    item.appendChild(el('span', 'event-time', relativeTime(event.received_at)));
    list.appendChild(item);
  }
  return list;
}

/* ========================================================================= */
/* 1. OVERVIEW                                                               */
/* ========================================================================= */

export function overviewView(state, { onNavigate } = {}) {
  const device = state.device;
  if (!device) return noDeviceState();

  const out = el('div');
  const zones = device.zones || [];
  const avg = farmAverage(zones);
  const irrigation = device.irrigation;

  /* --- welcome header + zone count --------------------------------------- */
  out.appendChild(welcomeHeader(zones.length));

  /* --- KPI strip: the 10-second read ------------------------------------ */
  const kpis = el('div', 'grid grid-kpi');

  kpis.appendChild(
    kpi({
      label: t('overview.system'),
      value: device.online ? t('overview.online') : t('overview.offline'),
      sub: t('overview.lastReport', { time: relativeTime(device.last_seen_at) }),
      tone: device.online ? 'ok' : 'crit',
      icon: 'system',
    }),
  );

  kpis.appendChild(
    kpi({
      label: t('overview.soilMoisture'),
      value: isNum(avg) ? avg.toFixed(1) : null,
      unit: '%',
      sub: isNum(avg) ? t('overview.farmAverageAcross', { n: zones.length }) : undefined,
      naReason: isNum(avg) ? undefined : t('overview.noValidReadings'),
      tone: 'water',
      icon: 'moisture',
      countUp: isNum(avg) ? avg : undefined,
    }),
  );

  // No ambient temperature sensor exists in the Phase 1 hardware — see
  // safetyView's "Environmental safety sensing" for the full honesty note.
  kpis.appendChild(
    kpi({ label: t('overview.temperature'), value: null, naReason: t('overview.noTemperatureSensor'), icon: 'temperature' }),
  );

  kpis.appendChild(
    kpi({
      label: t('overview.pump'),
      value: device.pump_on ? t('overview.running') : t('overview.off'),
      sub:
        irrigation && irrigation.run_ms > 0
          ? t('overview.currentRun', { duration: duration(irrigation.run_ms) })
          : t('overview.noActiveRun'),
      tone: device.pump_on ? 'water' : 'idle',
      icon: 'valve',
    }),
  );

  kpis.appendChild(
    kpi({
      label: t('overview.irrigation'),
      value: irrigation ? localizedLabel('irrigationState', irrigation.state) : null,
      sub:
        irrigation && isNum(irrigation.active_zone)
          ? t('overview.zoneActive', { n: irrigation.active_zone })
          : t('overview.noActiveZone'),
      naReason: irrigation ? undefined : t('overview.noTelemetryReceived'),
      tone: irrigation ? irrigationTone(irrigation.state) : undefined,
      icon: 'irrigation',
    }),
  );

  // Explicitly present and explicitly missing: there is no flow sensor in the
  // Phase 1 hardware, so this tile can only ever report its own absence.
  kpis.appendChild(
    kpi({ label: t('overview.waterFlow'), value: null, naReason: t('overview.noFlowSensor'), icon: 'flow' }),
  );

  out.appendChild(section(t('overview.systemStatus'), null, kpis));

  /* --- SENSE -> UNDERSTAND -> DECIDE -> ACT -> MONITOR ------------------- */
  out.appendChild(
    section(t('overview.whatHydraxIsDoing'), t('overview.controlLoopLive'), card(null, pipeline(device))),
  );

  /* --- control (honest, read-only) + active alerts ----------------------- */
  const controlRow = el('div', 'grid grid-2');
  controlRow.appendChild(card(t('overview.systemControl'), systemControlPanel(device)));

  const alerts = device.alerts || [];
  controlRow.appendChild(
    card(
      alerts.length > 0 ? `${t('overview.activeAlerts')} (${alerts.length})` : t('overview.activeAlerts'),
      alerts.length > 0
        ? alertList(alerts)
        : empty(t('overview.noActiveAlerts'), t('overview.noFaultCondition')),
    ),
  );
  out.appendChild(section(null, null, controlRow));

  /* --- farm schematic ------------------------------------------------------ */
  out.appendChild(section(t('overview.farm'), null, card(t('overview.farmLayout'), farmSchematic(device))));

  /* --- zones: compact summary cards, full detail lives on the Irrigation
     page — a 3-up grid here mirrors a farm floor plan rather than a data
     sheet, which is what the home view is for. --------------------------- */
  if (zones.length > 0) {
    const zoneGrid = el('div', 'grid grid-3');
    for (const zone of zones) {
      zoneGrid.appendChild(zoneSummaryCard(zone, device, () => onNavigate && onNavigate('irrigation')));
    }
    out.appendChild(section(t('irrigationPage.zones'), t('irrigationPage.liveControllerState'), zoneGrid));
  }

  /* --- recent events ----------------------------------------------------- */
  out.appendChild(
    section(t('overview.recentEvents'), t('overview.newestFirst'), card(null, eventTimeline(device.events, 8))),
  );

  return out;
}

function welcomeHeader(zoneCount) {
  const wrap = el('div', 'welcome-header');

  const copy = el('div', 'welcome-copy');
  const heading = el('h2', 'welcome-title');
  heading.appendChild(brandLeaf());
  heading.appendChild(document.createTextNode(t('overview.welcome')));
  copy.appendChild(heading);
  copy.appendChild(el('p', 'welcome-sub', t('brand.tagline')));
  wrap.appendChild(copy);

  const summary = el('div', 'zone-summary');
  summary.appendChild(el('span', 'zone-summary-label', t('topbar.allZones')));
  summary.appendChild(el('span', 'zone-summary-count', String(zoneCount)));
  summary.appendChild(el('span', 'zone-summary-note', t('common.zonesConfigured')));
  wrap.appendChild(summary);

  return wrap;
}

function brandLeaf() {
  const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgNode.setAttribute('class', 'welcome-mark');
  svgNode.setAttribute('viewBox', '0 0 100 100');
  svgNode.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M50 14 C50 14 76 44 76 62 a26 26 0 0 1-52 0 C24 44 50 14 50 14Z');
  svgNode.appendChild(path);
  return svgNode;
}

/**
 * Real, read-only control state. There is deliberately no start/stop button:
 * the backend exposes no command endpoint that would start or stop
 * irrigation remotely (see api.js) — every write the dashboard could make
 * would either be fictional or would put the network in the decision path,
 * which is exactly what the architecture forbids. See docs/ARCHITECTURE.md.
 */
function systemControlPanel(device) {
  const wrap = el('div');
  const states = el('div', 'control-states');

  const pumpOn = device.pump_on === true;
  const pumpBlock = el('div', 'control-state');
  pumpBlock.appendChild(el('span', 'control-state-label', t('overview.pump')));
  pumpBlock.appendChild(
    pill(pumpOn ? t('overview.running') : t('overview.off'), pumpOn ? 'water' : 'idle', { dot: true, pulse: pumpOn }),
  );
  states.appendChild(pumpBlock);

  const irrigation = device.irrigation;
  const irrigating = Boolean(irrigation) && irrigation.state === 'IRRIGATING';
  const irrBlock = el('div', 'control-state');
  irrBlock.appendChild(el('span', 'control-state-label', t('overview.irrigation')));
  irrBlock.appendChild(
    irrigation
      ? pill(localizedLabel('irrigationState', irrigation.state), irrigationTone(irrigation.state), { dot: true, pulse: irrigating })
      : pill(t('common.notAvailable'), 'na'),
  );
  states.appendChild(irrBlock);

  wrap.appendChild(states);
  wrap.appendChild(el('p', 'control-note', t('overview.controlReadOnlyNote')));
  return wrap;
}

/**
 * Compact zone card for the Overview grid — a farm floor plan, not a data
 * sheet. The full breakdown (both probes, coverage, run history) lives on
 * the Irrigation page; "View details" is a real in-app navigation, not a
 * decorative link.
 */
function zoneSummaryCard(zone, device, onViewDetails) {
  const status = moistureStatus(zone.average, zone.config);
  const node = el('div', `card zone-summary-card${zone.irrigating ? ' is-active' : ''}`);
  markZoneState(node, zone, status);

  const head = el('div', 'card-head');
  head.appendChild(el('h3', 'card-title', t('common.zone', { n: zone.zone })));
  head.appendChild(
    status
      ? pill(status.label, status.tone)
      : pill(zone.irrigating ? t('zoneCard.active') : t('zoneCard.idle'), zone.irrigating ? 'water' : 'idle'),
  );
  node.appendChild(head);

  const metricRow = el('div', 'kpi-row');
  const badge = el('div', `kpi-icon${isNum(zone.average) ? ' is-water' : ''}`);
  badge.appendChild(icon('moisture'));
  metricRow.appendChild(badge);
  const metric = el('div', 'zone-metric-compact');
  const value = el('div', 'zone-metric');
  value.appendChild(el('span', 'zone-value', percent(zone.average)));
  value.appendChild(el('span', 'zone-unit', '%'));
  metric.appendChild(value);
  metric.appendChild(el('p', 'zone-caption', t('overview.soilMoisture')));
  metricRow.appendChild(metric);
  node.appendChild(metricRow);

  const rows = el('div', 'rows');
  rows.appendChild(
    row(t('zoneCard.valve'), pill(zone.valve_open ? t('zoneCard.open') : t('zoneCard.closed'), zone.valve_open ? 'water' : 'idle')),
  );
  const lastRun = latestEventFor(device.events, zone.zone, ['IRRIGATION_STOPPED', 'IRRIGATION_TIMEOUT']);
  rows.appendChild(row(t('zoneCard.lastIrrigation'), lastRun ? relativeTime(lastRun.received_at) : null));
  node.appendChild(rows);

  const button = el('button', 'btn-details');
  button.type = 'button';
  button.appendChild(document.createTextNode(t('common.viewDetails')));
  button.appendChild(svgEye());
  button.addEventListener('click', onViewDetails);
  node.appendChild(button);

  return node;
}

function svgEye() {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('class', 'btn-details-icon');
  node.setAttribute('aria-hidden', 'true');
  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '3');
  node.appendChild(path1);
  node.appendChild(circle);
  return node;
}

/**
 * The product story as live state rather than a diagram: each stage shows what
 * the controller actually has, concluded, or done right now.
 */
function pipeline(device) {
  const zones = device.zones || [];
  const irrigation = device.irrigation;
  const wrap = el('div', 'pipeline');

  // SENSE
  const totalProbes = zones.length * 2;
  const validProbes = zones.reduce((n, z) => n + (z.valid_sensors || 0), 0);
  wrap.appendChild(
    stage('SENSE', `${validProbes} / ${totalProbes}`,
      totalProbes === 0 ? '—' : t('overview.farmAverageAcross', { n: zones.length }),
      validProbes === totalProbes && totalProbes > 0),
  );

  // UNDERSTAND
  const driest = zones
    .filter((z) => isNum(z.average))
    .sort((a, b) => a.average - b.average)[0];
  const driestStatus = driest ? moistureStatus(driest.average, driest.config) : null;
  wrap.appendChild(
    stage(
      'UNDERSTAND',
      driest ? `${t('common.zone', { n: driest.zone })} · ${percent(driest.average)}%` : '—',
      driestStatus ? driestStatus.label : '—',
      Boolean(driest),
    ),
  );

  // DECIDE
  //
  // Only the controller knows why it is holding. The dashboard can see that a
  // zone reads dry while nothing is running, but it cannot see whether that is
  // a cooldown, a timeout lockout or degraded probe coverage — so it reports
  // the observation and names the possibilities rather than asserting a cause.
  const dryZone = zones.find((z) => {
    const s = moistureStatus(z.average, z.config);
    return s && s.label === t('moistureStatus.dry');
  });

  let decision = '—';
  let decisionDetail = dryZone ? t('common.zone', { n: dryZone.zone }) : '—';

  if (irrigation) {
    if (irrigation.state === 'IRRIGATING' || irrigation.state === 'STARTING') {
      decision = localizedLabel('irrigationState', irrigation.state);
      decisionDetail = t('common.zone', { n: irrigation.active_zone ?? '—' });
    } else if (irrigation.state === 'SENSOR_ERROR') {
      decision = localizedLabel('irrigationState', 'SENSOR_ERROR');
      decisionDetail = t('overview.noValidReadings');
    } else if (irrigation.state === 'ACTUATOR_ERROR') {
      decision = localizedLabel('irrigationState', 'ACTUATOR_ERROR');
      decisionDetail = t('safetyPage.requiresFaultClear');
    } else if (irrigation.state === 'TIMEOUT') {
      decision = localizedLabel('irrigationState', 'TIMEOUT');
      decisionDetail = t('safetyPage.maxRuntimeAborts');
    } else {
      decision = localizedLabel('irrigationState', irrigation.state);
    }
  }
  wrap.appendChild(stage('DECIDE', decision, decisionDetail, irrigation && irrigation.state === 'IRRIGATING'));

  // ACT
  const openZone = zones.find((z) => z.valve_open);
  wrap.appendChild(
    stage(
      'ACT',
      device.pump_on ? t('overview.running') : t('zoneCard.idle'),
      openZone ? t('farm.valveOpen') : t('farm.valveClosed'),
      device.pump_on,
    ),
  );

  // MONITOR
  wrap.appendChild(
    stage(
      'MONITOR',
      device.online ? t('overview.online') : t('overview.offline'),
      relativeTime(device.last_seen_at),
      device.online,
    ),
  );

  return wrap;
}

function stage(name, value, detail, active) {
  const node = el('div', `stage${active ? ' is-active' : ''}`);
  // Read by animations.js to tell which stage newly became active between
  // one poll and the next — see syncControlLoop() there.
  node.dataset.stage = name;
  node.appendChild(el('div', 'stage-name', name));
  node.appendChild(el('div', 'stage-value', value));
  node.appendChild(el('div', 'stage-detail', detail));
  return node;
}

/* ========================================================================= */
/* 2. SMART IRRIGATION                                                       */
/* ========================================================================= */

export function irrigationView(state) {
  const device = state.device;
  if (!device) return noDeviceState();

  const out = el('div');
  const zones = device.zones || [];

  if (zones.length === 0) {
    out.appendChild(empty(t('irrigationPage.noZonesHeadline'), t('irrigationPage.noZonesDetail')));
    return out;
  }

  // The device decides on its compiled-in thresholds. The backend copy is
  // advisory and is what this page classifies against, so say so when it is
  // missing instead of leaving an unexplained "NO BAND SET".
  const missingBand = zones.some((z) => !z.config);
  if (missingBand) {
    out.appendChild(
      banner('demo', t('irrigationPage.noBandTitle'), t('irrigationPage.noBandBody', { id: device.device_id })),
    );
  }

  const grid = el('div', 'grid grid-2');
  for (const zone of zones) grid.appendChild(zoneCard(zone, device));
  out.appendChild(section(t('irrigationPage.zones'), t('irrigationPage.liveControllerState'), grid));

  /* --- history chart, drawn only from real samples ---------------------- */
  const series = buildMoistureSeries(state.history, zones);
  out.appendChild(
    section(
      t('irrigationPage.moistureHistory'),
      state.history ? t('irrigationPage.samplesRetained', { n: state.history.length }) : null,
      card(null, moistureChart(series)),
    ),
  );

  return out;
}

function zoneCard(zone, device) {
  const status = moistureStatus(zone.average, zone.config);
  const cov = coverage(zone.valid_sensors);
  const node = el('div', `card zone-card${zone.irrigating ? ' is-active' : ''}`);
  markZoneState(node, zone, status);

  const head = el('div', 'card-head');
  head.appendChild(el('h3', 'card-title', t('common.zone', { n: zone.zone })));
  if (status) head.appendChild(pill(status.label, status.tone));
  else head.appendChild(pill(zone.irrigating ? t('zoneCard.active') : t('zoneCard.idle'), zone.irrigating ? 'water' : 'idle'));
  node.appendChild(head);

  const metric = el('div', 'zone-metric');
  metric.appendChild(el('span', 'zone-value', percent(zone.average)));
  metric.appendChild(el('span', 'zone-unit', '%'));
  node.appendChild(metric);
  node.appendChild(el('p', 'zone-caption', t('zoneCard.caption')));

  node.appendChild(gauge(zone.average, zone.config));

  const rows = el('div', 'rows');
  rows.appendChild(
    row(t('zoneCard.sensor1'), zone.sensor_1_valid ? `${percent(zone.sensor_1)}%` : null, {
      tone: zone.sensor_1_valid ? undefined : 'bad',
    }),
  );
  rows.appendChild(
    row(t('zoneCard.sensor2'), zone.sensor_2_valid ? `${percent(zone.sensor_2)}%` : null, {
      tone: zone.sensor_2_valid ? undefined : 'bad',
    }),
  );
  rows.appendChild(row(t('zoneCard.average'), isNum(zone.average) ? `${percent(zone.average)}%` : null));
  rows.appendChild(row(t('zoneCard.sensorCoverage'), pill(cov.label, cov.tone)));
  rows.appendChild(
    row(t('zoneCard.valve'), pill(zone.valve_open ? t('zoneCard.open') : t('zoneCard.closed'), zone.valve_open ? 'water' : 'idle')),
  );

  const zoneIrrigating =
    device.irrigation && device.irrigation.active_zone === zone.zone
      ? device.irrigation.state
      : 'IDLE';
  rows.appendChild(row(t('overview.irrigation'), pill(localizedLabel('irrigationState', zoneIrrigating), irrigationTone(zoneIrrigating))));

  if (zone.irrigating && device.irrigation && device.irrigation.run_ms > 0) {
    rows.appendChild(row(t('zoneCard.currentRun'), duration(device.irrigation.run_ms)));
  }

  // Last completed run for this zone, taken from the real event log.
  const lastRun = latestEventFor(device.events, zone.zone, [
    'IRRIGATION_STOPPED',
    'IRRIGATION_TIMEOUT',
  ]);
  rows.appendChild(
    row(t('zoneCard.lastIrrigation'), lastRun ? relativeTime(lastRun.received_at) : null),
  );
  rows.appendChild(
    row(
      t('zoneCard.lastDuration'),
      lastRun && isNum(lastRun.duration_ms) && lastRun.duration_ms > 0
        ? duration(lastRun.duration_ms)
        : null,
    ),
  );

  // No flow meter exists, so consumption cannot be derived from runtime.
  rows.appendChild(row(t('zoneCard.waterUsed'), null));

  node.appendChild(rows);
  return node;
}

/** Builds chart series from telemetry history — real samples only. */
function buildMoistureSeries(history, zones) {
  if (!Array.isArray(history) || history.length === 0) return [];

  // History arrives newest-first; the chart needs chronological order.
  const ordered = history.slice().reverse();

  return zones.map((zone) => ({
    name: t('common.zone', { n: zone.zone }),
    points: ordered
      .map((sample) => {
        const match = (sample.zones || []).find((z) => z.zone === zone.zone);
        const time = Date.parse(sample.received_at);
        if (!match || !isNum(match.average) || Number.isNaN(time)) return null;
        return { t: time, v: match.average };
      })
      .filter(Boolean),
  }));
}

/* ========================================================================= */
/* 3. PUMP HEALTH                                                            */
/* ========================================================================= */

export function pumpView(state) {
  const device = state.device;
  if (!device) return noDeviceState();

  const out = el('div');
  const irrigation = device.irrigation;

  /* --- what the device genuinely reports -------------------------------- */
  const kpis = el('div', 'grid grid-kpi');
  kpis.appendChild(
    kpi({
      label: t('pumpPage.pumpState'),
      value: device.pump_on ? t('overview.running') : t('overview.off'),
      sub: t('pumpPage.commandedState'),
      tone: device.pump_on ? 'water' : 'idle',
    }),
  );
  kpis.appendChild(
    kpi({
      label: t('pumpPage.currentRun'),
      value: irrigation && irrigation.run_ms > 0 ? duration(irrigation.run_ms) : '—',
      sub: device.pump_on ? t('pumpPage.sincePumpStart') : t('pumpPage.notRunning'),
      tone: 'idle',
    }),
  );

  // Real usage counters, derived from the irrigation event log — these are
  // observations, not predictions.
  const events = device.events || [];
  const starts = events.filter((e) => e.type === 'IRRIGATION_STARTED').length;
  const timeouts = events.filter((e) => e.type === 'IRRIGATION_TIMEOUT').length;
  const faults = events.filter((e) => e.type === 'ACTUATOR_ERROR').length;

  kpis.appendChild(
    kpi({
      label: t('pumpPage.startsRecentLog'),
      value: String(starts),
      sub: t('pumpPage.fromEventsNotCounter'),
      tone: 'idle',
      countUp: starts,
    }),
  );
  kpis.appendChild(
    kpi({
      label: t('pumpPage.abnormalStops'),
      value: String(timeouts + faults),
      sub: t('pumpPage.timeoutFaultBreakdown', { timeouts, faults }),
      tone: timeouts + faults > 0 ? 'warn' : 'ok',
      countUp: timeouts + faults,
    }),
  );
  out.appendChild(section(t('pumpPage.reportedState'), t('pumpPage.realDataFrom'), kpis));

  /* --- what has no sensor behind it ------------------------------------- */
  out.appendChild(
    section(
      t('pumpPage.conditionMonitoring'),
      null,
      notAvailable(t('pumpPage.conditionReason'), [
        t('pumpPage.motorCurrent'),
        t('pumpPage.windingTemp'),
        t('pumpPage.vibration'),
        t('pumpPage.healthScore'),
        t('pumpPage.anomalyStatus'),
        t('pumpPage.historicalTrends'),
      ]),
    ),
  );

  out.appendChild(
    section(
      t('pumpPage.predictiveMaintenance'),
      null,
      notAvailable(t('pumpPage.predictiveReason'), [
        t('pumpPage.remainingLife'),
        t('pumpPage.failureProbability'),
        t('pumpPage.maintenanceDue'),
        t('pumpPage.degradationTrend'),
      ]),
    ),
  );

  return out;
}

/* ========================================================================= */
/* 4. WATER NETWORK                                                          */
/* ========================================================================= */

export function waterView(state) {
  const device = state.device;
  if (!device) return noDeviceState();

  const out = el('div');
  const zones = device.zones || [];

  const kpis = el('div', 'grid grid-kpi');
  kpis.appendChild(
    kpi({
      label: t('overview.pump'),
      value: device.pump_on ? t('overview.running') : t('overview.off'),
      tone: device.pump_on ? 'water' : 'idle',
    }),
  );
  for (const zone of zones) {
    kpis.appendChild(
      kpi({
        label: t('waterPage.zoneValve', { n: zone.zone }),
        value: zone.valve_open ? t('zoneCard.open') : t('zoneCard.closed'),
        sub: zone.irrigating ? t('waterPage.waterFlowing') : t('waterPage.noFlowCommanded'),
        tone: zone.valve_open ? 'water' : 'idle',
      }),
    );
  }
  kpis.appendChild(kpi({ label: t('waterPage.flowRate'), value: null, naReason: t('waterPage.noFlowSensorFitted') }));
  out.appendChild(section(t('waterPage.networkState'), t('waterPage.realActuatorStates'), kpis));

  out.appendChild(section(t('waterPage.distribution'), null, card(null, farmSchematic(device))));

  out.appendChild(
    section(
      t('waterPage.flowAndConsumption'),
      null,
      notAvailable(t('waterPage.flowReason'), [
        t('waterPage.flowRateUnit'),
        t('waterPage.consumptionPerRun'),
        t('waterPage.dailySeasonalTotals'),
        t('waterPage.perZoneVolume'),
      ]),
    ),
  );

  out.appendChild(
    section(
      t('waterPage.leakDetection'),
      null,
      notAvailable(t('waterPage.leakReason'), [
        t('waterPage.leakStatus'),
        t('waterPage.affectedZone'),
        t('waterPage.estimatedLossRate'),
        t('waterPage.localization'),
      ]),
    ),
  );

  return out;
}

/* ========================================================================= */
/* 5. SAFETY CENTER                                                          */
/* ========================================================================= */

export function safetyView(state) {
  const device = state.device;
  if (!device) return noDeviceState();

  const out = el('div');
  const status = device.controller_status;
  const irrigation = device.irrigation;
  const events = device.events || [];

  /* --- fail-safe state the firmware genuinely reports -------------------- */
  const kpis = el('div', 'grid grid-kpi');
  kpis.appendChild(
    kpi({
      label: t('safetyPage.controllerStatus'),
      value: status ? localizedLabel('controllerStatus', status) : null,
      naReason: status ? undefined : t('overview.noTelemetryReceived'),
      sub: status === 'OK' ? t('safetyPage.allSubsystemsNominal') : t('safetyPage.seeSafetyConditions'),
      tone: statusTone(status),
    }),
  );

  const latched = irrigation && irrigation.state === 'ACTUATOR_ERROR';
  kpis.appendChild(
    kpi({
      label: t('safetyPage.actuatorInterlock'),
      value: latched ? t('safetyPage.latchedOff') : t('safetyPage.armed'),
      sub: latched ? t('safetyPage.requiresFaultClear') : t('safetyPage.noActuatorFault'),
      tone: latched ? 'crit' : 'ok',
    }),
  );

  const sensorFail = irrigation && irrigation.state === 'SENSOR_ERROR';
  kpis.appendChild(
    kpi({
      label: t('safetyPage.sensorIntegrity'),
      value: sensorFail ? t('safetyPage.noValidData') : t('safetyPage.ok'),
      sub: sensorFail ? t('safetyPage.irrigationHeldOff') : t('safetyPage.usableReadingsPresent'),
      tone: sensorFail ? 'crit' : 'ok',
    }),
  );

  const timedOut = events.filter((e) => e.type === 'IRRIGATION_TIMEOUT').length;
  kpis.appendChild(
    kpi({
      label: t('safetyPage.runtimeCutOuts'),
      value: String(timedOut),
      sub: t('safetyPage.maxRuntimeAborts'),
      tone: timedOut > 0 ? 'warn' : 'ok',
      countUp: timedOut,
    }),
  );
  out.appendChild(section(t('safetyPage.failsafeState'), t('safetyPage.realSafetyTelemetry'), kpis));

  /* --- the guarantees, as verified behaviour ---------------------------- */
  const guarantees = el('div', 'rows');
  const enforced = t('safetyPage.enforced');
  guarantees.appendChild(row(t('safetyPage.outputsDeenergized'), pill(enforced, 'ok')));
  guarantees.appendChild(row(t('safetyPage.pumpBlocked'), pill(enforced, 'ok')));
  guarantees.appendChild(row(t('safetyPage.oneValveAtATime'), pill(enforced, 'ok')));
  guarantees.appendChild(row(t('safetyPage.maxRuntimeCutoff'), pill(enforced, 'ok')));
  guarantees.appendChild(row(t('safetyPage.independentOfNetwork'), pill(enforced, 'ok')));
  out.appendChild(
    section(t('safetyPage.firmwareInterlocks'), t('safetyPage.coveredByTests'), card(null, guarantees)),
  );

  /* --- safety events ----------------------------------------------------- */
  const safetyEvents = events.filter((e) =>
    ['SAFE_SHUTDOWN', 'ACTUATOR_ERROR', 'SENSOR_ERROR', 'SENSOR_RECOVERED', 'FAULT_CLEARED', 'IRRIGATION_TIMEOUT'].includes(e.type),
  );
  out.appendChild(
    section(
      t('safetyPage.safetyEvents'),
      null,
      card(
        null,
        safetyEvents.length > 0
          ? eventTimeline(safetyEvents, 20)
          : empty(t('safetyPage.noSafetyEvents'), t('safetyPage.noFaultReported')),
      ),
    ),
  );

  /* --- environmental sensing that does not exist ------------------------ */
  out.appendChild(
    section(
      t('safetyPage.envSensing'),
      null,
      notAvailable(t('safetyPage.envReason'), [
        t('safetyPage.ambientTemp'),
        t('safetyPage.gasDetection'),
        t('safetyPage.smokeDetection'),
        t('safetyPage.waterFloodDetection'),
        t('safetyPage.emergencyStop'),
      ]),
    ),
  );

  return out;
}

/* ========================================================================= */
/* 6. ALERTS & EVENTS                                                        */
/* ========================================================================= */

const CATEGORIES = ['ALL', 'IRRIGATION', 'PUMP', 'WATER', 'SAFETY', 'SYSTEM'];

export function alertsView(state, { onFilter }) {
  const device = state.device;
  if (!device) return noDeviceState();

  const out = el('div');
  const active = state.filter || 'ALL';

  /* --- active alerts ---------------------------------------------------- */
  const alerts = (device.alerts || []).filter(
    (a) => active === 'ALL' || alertCategory(a.type) === active,
  );
  out.appendChild(
    section(
      t('alertsPage.activeAlerts'),
      t('alertsPage.openCount', { n: (device.alerts || []).length }),
      card(
        null,
        alerts.length > 0
          ? alertList(alerts)
          : empty(t('alertsPage.noAlertsInCategory'), t('alertsPage.alertsClearThemselves')),
      ),
    ),
  );

  /* --- filters + unified timeline --------------------------------------- */
  const filters = el('div', 'filters');
  for (const category of CATEGORIES) {
    const button = el('button', 'filter', t(`categories.${category}`));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(category === active));
    button.addEventListener('click', () => onFilter(category));
    filters.appendChild(button);
  }

  const events = (device.events || []).filter(
    (e) => active === 'ALL' || eventCategory(e.type) === active,
  );

  const body = el('div');
  body.appendChild(filters);
  body.appendChild(
    events.length > 0
      ? eventTimeline(events, 100)
      : empty(t('alertsPage.noEventsInCategory'), t('alertsPage.tryDifferentFilter')),
  );
  out.appendChild(section(t('alertsPage.eventTimeline'), t('alertsPage.fromEventLog'), card(null, body)));

  /* --- resolved alert history ------------------------------------------- */
  const resolved = (state.allAlerts || []).filter((a) => !a.active);
  out.appendChild(
    section(
      t('alertsPage.resolvedAlerts'),
      null,
      card(
        null,
        resolved.length > 0
          ? resolvedList(resolved.slice(0, 25))
          : empty(t('alertsPage.noResolvedYet'), t('alertsPage.clearedKeptHere')),
      ),
    ),
  );

  return out;
}

function resolvedList(alerts) {
  const list = el('ul', 'timeline');
  for (const alertItem of alerts) {
    const item = el('li', 'event');
    item.appendChild(pill(localizedLabel('alertType', alertItem.type), 'idle'));
    item.appendChild(el('span', 'event-detail', alertItem.message));
    item.appendChild(
      el('span', 'event-time', t('alertsPage.cleared', { time: relativeTime(alertItem.resolved_at || alertItem.raised_at) })),
    );
    list.appendChild(item);
  }
  return list;
}

/* ========================================================================= */
/* 7. DEVICE                                                                 */
/* ========================================================================= */

export function deviceView(state) {
  const device = state.device;
  if (!device) return noDeviceState();

  const out = el('div');
  const detail = state.deviceDetail;

  const sourceLabel = device.simulated ? t('devicePage.demo') : device.online ? t('devicePage.live') : t('devicePage.offline');
  const sourceTone = device.simulated ? 'warn' : device.online ? 'ok' : 'crit';

  const kpis = el('div', 'grid grid-kpi');
  kpis.appendChild(
    kpi({
      label: t('devicePage.dataSource'),
      value: sourceLabel,
      sub: device.simulated
        ? t('devicePage.syntheticTelemetry')
        : device.online
          ? t('devicePage.liveHardwareTelemetry')
          : t('devicePage.noRecentTelemetry'),
      tone: sourceTone,
    }),
  );
  kpis.appendChild(
    kpi({
      label: t('devicePage.connection'),
      value: device.online ? t('overview.online') : t('overview.offline'),
      sub: t('devicePage.lastSeen', { time: relativeTime(device.last_seen_at) }),
      tone: device.online ? 'ok' : 'crit',
    }),
  );
  kpis.appendChild(
    kpi({
      label: t('devicePage.backend'),
      value: state.error ? t('devicePage.unreachable') : t('devicePage.connected'),
      sub: state.error ? state.error : t('devicePage.apiResponding'),
      tone: state.error ? 'crit' : 'ok',
    }),
  );
  kpis.appendChild(
    kpi({
      label: t('devicePage.wifi'),
      value: device.wifi ? (device.wifi.connected ? t('devicePage.wifiConnected') : t('devicePage.wifiDisconnected')) : null,
      sub:
        device.wifi && isNum(device.wifi.rssi) ? `RSSI ${device.wifi.rssi} dBm` : undefined,
      naReason: device.wifi ? undefined : t('devicePage.notReported'),
      tone: device.wifi && device.wifi.connected ? 'ok' : 'warn',
    }),
  );
  out.appendChild(section(t('devicePage.status'), null, kpis));

  const rows = el('div', 'rows');
  rows.appendChild(row(t('devicePage.deviceId'), device.device_id));
  rows.appendChild(row(t('devicePage.firmware'), device.firmware || null));
  rows.appendChild(row(t('safetyPage.controllerStatus'), device.controller_status ? localizedLabel('controllerStatus', device.controller_status) : null));
  rows.appendChild(row(t('devicePage.lastTelemetry'), dateTime(device.last_seen_at)));
  rows.appendChild(row(t('devicePage.dataSource'), pill(sourceLabel, sourceTone)));
  rows.appendChild(
    row(t('devicePage.deviceUptime'), detail && detail.current ? duration(detail.current.device_uptime_ms) : null),
  );
  rows.appendChild(
    row(t('devicePage.deviceClock'), detail && detail.current && detail.current.device_time
      ? dateTime(detail.current.device_time)
      : null),
  );
  rows.appendChild(
    row(t('devicePage.telemetrySamplesStored'), detail ? String(detail.telemetry_count) : null),
  );
  out.appendChild(section(t('devicePage.deviceDetail'), null, card(null, rows)));

  if (device.simulated) {
    out.appendChild(banner('demo', t('devicePage.demoSimulationTitle'), t('devicePage.demoSimulationBody')));
  }

  return out;
}
