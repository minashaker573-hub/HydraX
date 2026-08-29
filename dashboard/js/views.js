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
  moistureStatus,
  percent,
  relativeTime,
  statusTone,
} from './format.js';
import {
  banner,
  card,
  el,
  empty,
  farmSchematic,
  frag,
  gauge,
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
  return frag(
    empty(
      'No device has reported yet',
      'Start the firmware, or run the mock device: npm run mock-device -- --key <your-key>',
    ),
  );
}

function alertList(alerts) {
  const wrap = el('div');
  for (const alert of alerts) {
    const node = el(
      'div',
      `alert alert-${alert.severity === 'critical' ? 'critical' : 'warning'}`,
    );
    const body = el('div', 'alert-body');
    body.appendChild(el('strong', 'alert-type', humanize(alert.type)));
    body.appendChild(el('div', 'alert-msg', alert.message));
    node.appendChild(body);
    node.appendChild(el('span', 'alert-time', relativeTime(alert.raised_at)));
    wrap.appendChild(node);
  }
  return wrap;
}

function eventTimeline(events, limit) {
  if (!events || events.length === 0) {
    return empty('No events recorded yet', 'Controller events appear here as they happen.');
  }
  const list = el('ul', 'timeline');
  for (const event of events.slice(0, limit)) {
    const item = el('li', 'event');
    item.appendChild(pill(humanize(event.type), eventTone(event.type)));

    const parts = [];
    if (isNum(event.zone)) parts.push(`zone ${event.zone}`);
    if (event.detail) parts.push(event.detail);
    if (isNum(event.moisture) && event.moisture > 0) parts.push(`${percent(event.moisture)}%`);
    if (isNum(event.duration_ms) && event.duration_ms > 0) {
      parts.push(`ran ${duration(event.duration_ms)}`);
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

export function overviewView(state) {
  const device = state.device;
  if (!device) return noDeviceState();

  const out = el('div');
  const zones = device.zones || [];
  const avg = farmAverage(zones);
  const irrigation = device.irrigation;

  /* --- KPI strip: the 10-second read ------------------------------------ */
  const kpis = el('div', 'grid grid-kpi');

  kpis.appendChild(
    kpi({
      label: 'System',
      value: device.online ? 'ONLINE' : 'OFFLINE',
      sub: `last report ${relativeTime(device.last_seen_at)}`,
      tone: device.online ? 'ok' : 'crit',
    }),
  );

  kpis.appendChild(
    kpi({
      label: 'Soil moisture',
      value: isNum(avg) ? avg.toFixed(1) : null,
      unit: '%',
      sub: isNum(avg) ? `farm average across ${zones.length} zones` : undefined,
      naReason: isNum(avg) ? undefined : 'no valid probe readings',
      tone: 'water',
    }),
  );

  kpis.appendChild(
    kpi({
      label: 'Pump',
      value: device.pump_on ? 'RUNNING' : 'OFF',
      sub:
        irrigation && irrigation.run_ms > 0
          ? `current run ${duration(irrigation.run_ms)}`
          : 'no active run',
      tone: device.pump_on ? 'water' : 'idle',
    }),
  );

  kpis.appendChild(
    kpi({
      label: 'Irrigation',
      value: irrigation ? irrigation.state : null,
      sub:
        irrigation && isNum(irrigation.active_zone)
          ? `zone ${irrigation.active_zone} active`
          : 'no active zone',
      naReason: irrigation ? undefined : 'no telemetry received',
      tone: irrigation ? irrigationTone(irrigation.state) : undefined,
    }),
  );

  // Explicitly present and explicitly missing: there is no flow sensor in the
  // Phase 1 hardware, so this tile can only ever report its own absence.
  kpis.appendChild(
    kpi({
      label: 'Water flow',
      value: null,
      naReason: 'no flow sensor on this device',
    }),
  );

  out.appendChild(section('System status', null, kpis));

  /* --- SENSE -> UNDERSTAND -> DECIDE -> ACT -> MONITOR ------------------- */
  out.appendChild(
    section(
      'What HYDRAX is doing',
      'the control loop, live',
      card(null, pipeline(device)),
    ),
  );

  /* --- farm schematic + alerts ------------------------------------------ */
  const split = el('div', 'grid grid-wide');
  split.appendChild(card('Farm layout', farmSchematic(device)));

  const right = el('div');
  const alerts = device.alerts || [];
  right.appendChild(
    card(
      `Active alerts${alerts.length > 0 ? ` (${alerts.length})` : ''}`,
      alerts.length > 0
        ? alertList(alerts)
        : empty('No active alerts', 'The controller is not reporting any fault condition.'),
    ),
  );
  split.appendChild(right);
  out.appendChild(section('Farm', null, split));

  /* --- recent events ----------------------------------------------------- */
  out.appendChild(
    section('Recent events', 'newest first', card(null, eventTimeline(device.events, 8))),
  );

  return out;
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
    stage('SENSE', `${validProbes} / ${totalProbes} probes valid`,
      totalProbes === 0 ? 'no zones reported' : `across ${zones.length} zones`,
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
      driest ? `Zone ${driest.zone} at ${percent(driest.average)}%` : 'No usable reading',
      driestStatus ? `driest zone · ${driestStatus.label}` : 'cannot assess soil',
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
    return s && s.label === 'DRY';
  });

  let decision = 'Holding';
  let decisionDetail = dryZone
    ? `zone ${dryZone.zone} reads dry — held by cooldown, lockout or probe coverage`
    : 'no zone below its start threshold';

  if (irrigation) {
    if (irrigation.state === 'IRRIGATING' || irrigation.state === 'STARTING') {
      decision = 'Irrigate';
      decisionDetail = `zone ${irrigation.active_zone ?? '—'} below start threshold`;
    } else if (irrigation.state === 'SENSOR_ERROR') {
      decision = 'Refuse';
      decisionDetail = 'no usable sensor data — failing safe';
    } else if (irrigation.state === 'ACTUATOR_ERROR') {
      decision = 'Latch off';
      decisionDetail = 'actuator fault — awaiting operator';
    } else if (irrigation.state === 'TIMEOUT') {
      decision = 'Abort';
      decisionDetail = 'maximum runtime exceeded';
    }
  } else {
    decision = '—';
    decisionDetail = 'no telemetry';
  }
  wrap.appendChild(stage('DECIDE', decision, decisionDetail, decision === 'Irrigate'));

  // ACT
  const openZone = zones.find((z) => z.valve_open);
  wrap.appendChild(
    stage(
      'ACT',
      device.pump_on ? 'Pump running' : 'Actuators idle',
      openZone ? `zone ${openZone.zone} valve open` : 'all valves closed',
      device.pump_on,
    ),
  );

  // MONITOR
  wrap.appendChild(
    stage(
      'MONITOR',
      device.online ? 'Telemetry live' : 'Device offline',
      device.online
        ? `last report ${relativeTime(device.last_seen_at)}`
        : 'irrigation continues locally',
      device.online,
    ),
  );

  return wrap;
}

function stage(name, value, detail, active) {
  const node = el('div', `stage${active ? ' is-active' : ''}`);
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
    out.appendChild(empty('No zones reported', 'The device has not sent zone telemetry yet.'));
    return out;
  }

  // The device decides on its compiled-in thresholds. The backend copy is
  // advisory and is what this page classifies against, so say so when it is
  // missing instead of leaving an unexplained "NO BAND SET".
  const missingBand = zones.some((z) => !z.config);
  if (missingBand) {
    out.appendChild(
      banner(
        'demo',
        'No threshold band recorded for this device.',
        'The controller is still running on its own compiled-in thresholds — irrigation is ' +
          'unaffected. Set the advisory copy with PUT /api/v1/devices/' +
          `${device.device_id}/config to classify zones as DRY / NORMAL / WET here.`,
      ),
    );
  }

  const grid = el('div', 'grid grid-2');
  for (const zone of zones) grid.appendChild(zoneCard(zone, device));
  out.appendChild(section('Zones', 'live controller state', grid));

  /* --- history chart, drawn only from real samples ---------------------- */
  const series = buildMoistureSeries(state.history, zones);
  out.appendChild(
    section(
      'Soil moisture history',
      state.history ? `${state.history.length} samples retained` : null,
      card(null, moistureChart(series)),
    ),
  );

  return out;
}

function zoneCard(zone, device) {
  const status = moistureStatus(zone.average, zone.config);
  const cov = coverage(zone.valid_sensors);
  const node = el('div', `card zone-card${zone.irrigating ? ' is-active' : ''}`);

  const head = el('div', 'card-head');
  head.appendChild(el('h3', 'card-title', `Zone ${zone.zone}`));
  if (status) head.appendChild(pill(status.label, status.tone));
  node.appendChild(head);

  const metric = el('div', 'zone-metric');
  metric.appendChild(el('span', 'zone-value', percent(zone.average)));
  metric.appendChild(el('span', 'zone-unit', '%'));
  node.appendChild(metric);
  node.appendChild(
    el('p', 'zone-caption', 'zone average · relative soil moisture (not volumetric water content)'),
  );

  node.appendChild(gauge(zone.average, zone.config));

  const rows = el('div', 'rows');
  rows.appendChild(
    row('Sensor 1', zone.sensor_1_valid ? `${percent(zone.sensor_1)}%` : null, {
      tone: zone.sensor_1_valid ? undefined : 'bad',
    }),
  );
  rows.appendChild(
    row('Sensor 2', zone.sensor_2_valid ? `${percent(zone.sensor_2)}%` : null, {
      tone: zone.sensor_2_valid ? undefined : 'bad',
    }),
  );
  rows.appendChild(row('Average', isNum(zone.average) ? `${percent(zone.average)}%` : null));
  rows.appendChild(row('Sensor coverage', pill(cov.label, cov.tone)));
  rows.appendChild(
    row('Valve', pill(zone.valve_open ? 'OPEN' : 'CLOSED', zone.valve_open ? 'water' : 'idle')),
  );

  const zoneIrrigating =
    device.irrigation && device.irrigation.active_zone === zone.zone
      ? device.irrigation.state
      : 'IDLE';
  rows.appendChild(row('Irrigation', pill(zoneIrrigating, irrigationTone(zoneIrrigating))));

  if (zone.irrigating && device.irrigation && device.irrigation.run_ms > 0) {
    rows.appendChild(row('Current run', duration(device.irrigation.run_ms)));
  }

  // Last completed run for this zone, taken from the real event log.
  const lastRun = latestEventFor(device.events, zone.zone, [
    'IRRIGATION_STOPPED',
    'IRRIGATION_TIMEOUT',
  ]);
  rows.appendChild(
    row('Last irrigation', lastRun ? relativeTime(lastRun.received_at) : null),
  );
  rows.appendChild(
    row(
      'Last duration',
      lastRun && isNum(lastRun.duration_ms) && lastRun.duration_ms > 0
        ? duration(lastRun.duration_ms)
        : null,
    ),
  );

  // No flow meter exists, so consumption cannot be derived from runtime.
  rows.appendChild(row('Water used', null));

  node.appendChild(rows);
  return node;
}

/** Builds chart series from telemetry history — real samples only. */
function buildMoistureSeries(history, zones) {
  if (!Array.isArray(history) || history.length === 0) return [];

  // History arrives newest-first; the chart needs chronological order.
  const ordered = history.slice().reverse();

  return zones.map((zone) => ({
    name: `Zone ${zone.zone}`,
    points: ordered
      .map((sample) => {
        const match = (sample.zones || []).find((z) => z.zone === zone.zone);
        const t = Date.parse(sample.received_at);
        if (!match || !isNum(match.average) || Number.isNaN(t)) return null;
        return { t, v: match.average };
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
      label: 'Pump state',
      value: device.pump_on ? 'RUNNING' : 'OFF',
      sub: 'commanded state reported by the controller',
      tone: device.pump_on ? 'water' : 'idle',
    }),
  );
  kpis.appendChild(
    kpi({
      label: 'Current run',
      value: irrigation && irrigation.run_ms > 0 ? duration(irrigation.run_ms) : '—',
      sub: device.pump_on ? 'since pump start' : 'not running',
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
      label: 'Starts (recent log)',
      value: String(starts),
      sub: 'from irrigation events, not a cycle counter',
      tone: 'idle',
    }),
  );
  kpis.appendChild(
    kpi({
      label: 'Abnormal stops',
      value: String(timeouts + faults),
      sub: `${timeouts} timeout · ${faults} actuator fault`,
      tone: timeouts + faults > 0 ? 'warn' : 'ok',
    }),
  );
  out.appendChild(section('Pump — reported state', 'real data from Phase 1 telemetry', kpis));

  /* --- what has no sensor behind it ------------------------------------- */
  out.appendChild(
    section(
      'Pump condition monitoring',
      null,
      notAvailable(
        'The Phase 1 hardware has no pump instrumentation. There is no current sensor, ' +
          'temperature probe or accelerometer on the pump, and no such fields exist in the ' +
          'telemetry schema. These readings are shown as unavailable rather than estimated ' +
          'from runtime, which would be a guess presented as a measurement.',
        [
          'Motor current (A)',
          'Winding temperature (°C)',
          'Vibration (RMS)',
          'Health score',
          'Anomaly status',
          'Historical trends',
        ],
      ),
    ),
  );

  out.appendChild(
    section(
      'Predictive maintenance',
      null,
      notAvailable(
        'No predictive model exists yet, and none will be claimed before one is implemented ' +
          'and validated against real failure data. Remaining useful life, failure probability ' +
          'and maintenance scheduling belong to a later phase.',
        ['Remaining useful life', 'Failure probability', 'Maintenance due', 'Degradation trend'],
      ),
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
      label: 'Pump',
      value: device.pump_on ? 'RUNNING' : 'OFF',
      tone: device.pump_on ? 'water' : 'idle',
    }),
  );
  for (const zone of zones) {
    kpis.appendChild(
      kpi({
        label: `Zone ${zone.zone} valve`,
        value: zone.valve_open ? 'OPEN' : 'CLOSED',
        sub: zone.irrigating ? 'water flowing' : 'no flow commanded',
        tone: zone.valve_open ? 'water' : 'idle',
      }),
    );
  }
  kpis.appendChild(kpi({ label: 'Flow rate', value: null, naReason: 'no flow sensor fitted' }));
  out.appendChild(section('Network state', 'real actuator states', kpis));

  out.appendChild(section('Distribution', null, card(null, farmSchematic(device))));

  out.appendChild(
    section(
      'Flow and consumption',
      null,
      notAvailable(
        'No flow meter is fitted, so volumetric flow and water consumption cannot be measured. ' +
          'They are deliberately not inferred from pump runtime: without a calibrated flow rate ' +
          'that figure would be a fabrication, and it would be wrong exactly when it matters — ' +
          'a blocked line or a burst pipe both run the pump while moving very different volumes.',
        ['Flow rate (L/min)', 'Consumption per run', 'Daily / seasonal totals', 'Per-zone volume'],
      ),
    ),
  );

  out.appendChild(
    section(
      'Leak detection',
      null,
      notAvailable(
        'Leak detection requires flow instrumentation that does not exist on this hardware. ' +
          'No leak status is displayed, because showing a reassuring "no leak" from a system ' +
          'that cannot detect one would be worse than showing nothing.',
        ['Leak status', 'Affected zone', 'Estimated loss rate', 'Localization'],
      ),
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
      label: 'Controller status',
      value: status || null,
      naReason: status ? undefined : 'no telemetry received',
      sub: status === 'OK' ? 'all subsystems nominal' : 'see safety conditions below',
      tone: statusTone(status),
    }),
  );

  const latched = irrigation && irrigation.state === 'ACTUATOR_ERROR';
  kpis.appendChild(
    kpi({
      label: 'Actuator interlock',
      value: latched ? 'LATCHED OFF' : 'ARMED',
      sub: latched ? 'requires an operator fault clear' : 'no actuator fault',
      tone: latched ? 'crit' : 'ok',
    }),
  );

  const sensorFail = irrigation && irrigation.state === 'SENSOR_ERROR';
  kpis.appendChild(
    kpi({
      label: 'Sensor integrity',
      value: sensorFail ? 'NO VALID DATA' : 'OK',
      sub: sensorFail ? 'irrigation held off — failing safe' : 'usable readings present',
      tone: sensorFail ? 'crit' : 'ok',
    }),
  );

  const timedOut = events.filter((e) => e.type === 'IRRIGATION_TIMEOUT').length;
  kpis.appendChild(
    kpi({
      label: 'Runtime cut-outs',
      value: String(timedOut),
      sub: 'maximum-runtime aborts in the recent log',
      tone: timedOut > 0 ? 'warn' : 'ok',
    }),
  );
  out.appendChild(section('Fail-safe state', 'real safety telemetry', kpis));

  /* --- the guarantees, as verified behaviour ---------------------------- */
  const guarantees = el('div', 'rows');
  guarantees.appendChild(row('Outputs de-energized at startup', pill('ENFORCED', 'ok')));
  guarantees.appendChild(row('Pump blocked with all valves closed', pill('ENFORCED', 'ok')));
  guarantees.appendChild(row('One zone valve open at a time', pill('ENFORCED', 'ok')));
  guarantees.appendChild(row('Maximum runtime cut-off', pill('ENFORCED', 'ok')));
  guarantees.appendChild(row('Irrigation independent of network', pill('ENFORCED', 'ok')));
  out.appendChild(
    section(
      'Firmware safety interlocks',
      'covered by the firmware test suite',
      card(null, guarantees),
    ),
  );

  /* --- safety events ----------------------------------------------------- */
  const safetyEvents = events.filter((e) =>
    ['SAFE_SHUTDOWN', 'ACTUATOR_ERROR', 'SENSOR_ERROR', 'SENSOR_RECOVERED', 'FAULT_CLEARED', 'IRRIGATION_TIMEOUT'].includes(e.type),
  );
  out.appendChild(
    section(
      'Safety events',
      null,
      card(
        null,
        safetyEvents.length > 0
          ? eventTimeline(safetyEvents, 20)
          : empty('No safety events', 'No fault, shutdown or timeout has been reported.'),
      ),
    ),
  );

  /* --- environmental sensing that does not exist ------------------------ */
  out.appendChild(
    section(
      'Environmental safety sensing',
      null,
      notAvailable(
        'No environmental safety sensors are fitted to this device. Ambient temperature, gas, ' +
          'smoke and water-ingress detection are not part of the Phase 1 hardware and do not ' +
          'appear in the telemetry schema. A dashboard showing green for a hazard it cannot ' +
          'detect is worse than one showing nothing.',
        [
          'Ambient temperature',
          'Gas detection',
          'Smoke detection',
          'Water / flood detection',
          'Hardware emergency stop',
        ],
      ),
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
      'Active alerts',
      `${(device.alerts || []).length} open`,
      card(
        null,
        alerts.length > 0
          ? alertList(alerts)
          : empty(
              'No active alerts in this category',
              'Alerts clear themselves when the underlying condition ends.',
            ),
      ),
    ),
  );

  /* --- filters + unified timeline --------------------------------------- */
  const filters = el('div', 'filters');
  for (const category of CATEGORIES) {
    const button = el('button', 'filter', category);
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
      : empty('No events in this category', 'Try a different filter.'),
  );
  out.appendChild(section('Event timeline', 'from the controller event log', card(null, body)));

  /* --- resolved alert history ------------------------------------------- */
  const resolved = (state.allAlerts || []).filter((a) => !a.active);
  out.appendChild(
    section(
      'Resolved alerts',
      null,
      card(
        null,
        resolved.length > 0
          ? resolvedList(resolved.slice(0, 25))
          : empty('No resolved alerts yet', 'Cleared alerts are kept here for history.'),
      ),
    ),
  );

  return out;
}

function resolvedList(alerts) {
  const list = el('ul', 'timeline');
  for (const alert of alerts) {
    const item = el('li', 'event');
    item.appendChild(pill(humanize(alert.type), 'idle'));
    item.appendChild(el('span', 'event-detail', alert.message));
    item.appendChild(
      el('span', 'event-time', `cleared ${relativeTime(alert.resolved_at || alert.raised_at)}`),
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

  const sourceLabel = device.simulated ? 'DEMO' : device.online ? 'LIVE' : 'OFFLINE';
  const sourceTone = device.simulated ? 'warn' : device.online ? 'ok' : 'crit';

  const kpis = el('div', 'grid grid-kpi');
  kpis.appendChild(
    kpi({
      label: 'Data source',
      value: sourceLabel,
      sub: device.simulated
        ? 'synthetic telemetry — not field data'
        : device.online
          ? 'live hardware telemetry'
          : 'no recent telemetry',
      tone: sourceTone,
    }),
  );
  kpis.appendChild(
    kpi({
      label: 'Connection',
      value: device.online ? 'ONLINE' : 'OFFLINE',
      sub: `last seen ${relativeTime(device.last_seen_at)}`,
      tone: device.online ? 'ok' : 'crit',
    }),
  );
  kpis.appendChild(
    kpi({
      label: 'Backend',
      value: state.error ? 'UNREACHABLE' : 'CONNECTED',
      sub: state.error ? state.error : 'dashboard API responding',
      tone: state.error ? 'crit' : 'ok',
    }),
  );
  kpis.appendChild(
    kpi({
      label: 'Wi-Fi',
      value: device.wifi ? (device.wifi.connected ? 'CONNECTED' : 'DISCONNECTED') : null,
      sub:
        device.wifi && isNum(device.wifi.rssi) ? `RSSI ${device.wifi.rssi} dBm` : undefined,
      naReason: device.wifi ? undefined : 'not reported',
      tone: device.wifi && device.wifi.connected ? 'ok' : 'warn',
    }),
  );
  out.appendChild(section('Status', null, kpis));

  const rows = el('div', 'rows');
  rows.appendChild(row('Device ID', device.device_id));
  rows.appendChild(row('Firmware', device.firmware || null));
  rows.appendChild(row('Controller status', device.controller_status || null));
  rows.appendChild(row('Last telemetry', dateTime(device.last_seen_at)));
  rows.appendChild(row('Data source', pill(sourceLabel, sourceTone)));
  rows.appendChild(
    row('Device uptime', detail && detail.current ? duration(detail.current.device_uptime_ms) : null),
  );
  rows.appendChild(
    row('Device clock', detail && detail.current && detail.current.device_time
      ? dateTime(detail.current.device_time)
      : null),
  );
  rows.appendChild(
    row('Telemetry samples stored', detail ? String(detail.telemetry_count) : null),
  );
  out.appendChild(section('Device detail', null, card(null, rows)));

  if (device.simulated) {
    out.appendChild(
      banner(
        'demo',
        'DEMO / SIMULATION.',
        'This device is publishing synthetic telemetry from the mock device fixture. ' +
          'The values shown are scripted, not measured from soil.',
      ),
    );
  }

  return out;
}
