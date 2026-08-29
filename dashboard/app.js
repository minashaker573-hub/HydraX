/* HYDRAX dashboard — Phase 1
 *
 * Polls /api/v1/dashboard and renders the state the controller actually
 * reported. Nothing here is interpolated, predicted or invented: a value the
 * device did not send is shown as unavailable rather than guessed.
 *
 * Plain DOM, no framework, no build step.
 */

(function () {
  'use strict';

  var POLL_MS = 3000;
  var STALE_AFTER_MS = 15000;

  var content = document.getElementById('content');
  var refreshState = document.getElementById('refresh-state');
  var lastSuccessAt = 0;

  // --- helpers -------------------------------------------------------------

  /** Everything from the API is treated as text, never markup. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function fmtPercent(value) {
    if (value === null || value === undefined) return '—';
    return value.toFixed(1);
  }

  function fmtDuration(ms) {
    if (!ms || ms < 1000) return '0s';
    var totalS = Math.round(ms / 1000);
    var m = Math.floor(totalS / 60);
    var s = totalS % 60;
    return m > 0 ? m + 'm ' + s + 's' : s + 's';
  }

  function fmtAgo(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return 'unknown';
    var deltaS = Math.round((Date.now() - t) / 1000);
    if (deltaS < 0) deltaS = 0;
    if (deltaS < 60) return deltaS + 's ago';
    if (deltaS < 3600) return Math.floor(deltaS / 60) + 'm ago';
    if (deltaS < 86400) return Math.floor(deltaS / 3600) + 'h ago';
    return Math.floor(deltaS / 86400) + 'd ago';
  }

  function badge(text, kind, withDot) {
    var node = el('span', 'badge badge-' + kind);
    if (withDot) node.appendChild(el('span', 'dot'));
    node.appendChild(document.createTextNode(text));
    return node;
  }

  /** Maps an irrigation state to a badge style. */
  function stateKind(state) {
    if (state === 'IRRIGATING' || state === 'STARTING' || state === 'STOPPING') return 'water';
    if (state === 'SENSOR_ERROR' || state === 'ACTUATOR_ERROR' || state === 'TIMEOUT') {
      return 'crit';
    }
    return 'idle';
  }

  function statusKind(status) {
    if (status === 'OK') return 'ok';
    if (status === 'DEGRADED') return 'warn';
    return 'crit';
  }

  function row(label, valueNode) {
    var node = el('div', 'row');
    node.appendChild(el('span', 'row-label', label));
    if (typeof valueNode === 'string' || typeof valueNode === 'number') {
      node.appendChild(el('span', 'row-value', valueNode));
    } else {
      var wrap = el('span', 'row-value');
      wrap.appendChild(valueNode);
      node.appendChild(wrap);
    }
    return node;
  }

  // --- rendering -----------------------------------------------------------

  function renderSystemCard(device) {
    var card = el('div', 'card');
    card.appendChild(el('h3', null, 'System status'));
    var rows = el('div', 'rows');

    rows.appendChild(
      row(
        'Connectivity',
        badge(device.online ? 'Online' : 'Offline', device.online ? 'ok' : 'crit', true),
      ),
    );

    var irrigation = device.irrigation;
    rows.appendChild(
      row(
        'Irrigation',
        irrigation
          ? badge(irrigation.state, stateKind(irrigation.state))
          : badge('NO DATA', 'idle'),
      ),
    );

    rows.appendChild(
      row(
        'Active zone',
        irrigation && irrigation.active_zone ? 'Zone ' + irrigation.active_zone : 'none',
      ),
    );

    rows.appendChild(
      row('Pump', badge(device.pump_on ? 'ON' : 'OFF', device.pump_on ? 'water' : 'idle', true)),
    );

    if (irrigation && irrigation.run_ms > 0) {
      rows.appendChild(row('Current run', fmtDuration(irrigation.run_ms)));
    }

    rows.appendChild(
      row(
        'Controller',
        device.controller_status
          ? badge(device.controller_status, statusKind(device.controller_status))
          : badge('NO DATA', 'idle'),
      ),
    );

    if (device.wifi) {
      rows.appendChild(
        row(
          'Wi-Fi',
          device.wifi.connected
            ? 'connected' + (device.wifi.rssi !== null ? ' (' + device.wifi.rssi + ' dBm)' : '')
            : 'disconnected',
        ),
      );
    }

    rows.appendChild(row('Last report', fmtAgo(device.last_seen_at)));
    card.appendChild(rows);
    return card;
  }

  function renderSensorRow(label, percent, valid) {
    var node = el('div', 'row');
    node.appendChild(el('span', 'row-label', label));
    var value = el('span', 'row-value');
    if (!valid) {
      value.className = 'row-value invalid';
      value.textContent = 'INVALID';
    } else {
      value.textContent = fmtPercent(percent) + '%';
    }
    node.appendChild(value);
    return node;
  }

  function renderGauge(zone) {
    var wrap = document.createDocumentFragment();
    var gauge = el('div', 'gauge');

    // Shade the configured hysteresis band when the backend holds one.
    if (zone.config) {
      var band = el('div', 'gauge-band');
      var start = Math.max(0, Math.min(100, zone.config.start_percent));
      var stop = Math.max(0, Math.min(100, zone.config.stop_percent));
      band.style.left = start + '%';
      band.style.width = Math.max(0, stop - start) + '%';
      gauge.appendChild(band);
    }

    var fill = el('div', 'gauge-fill');
    fill.style.width = (zone.average === null ? 0 : Math.max(0, Math.min(100, zone.average))) + '%';
    gauge.appendChild(fill);
    wrap.appendChild(gauge);

    var scale = el('div', 'gauge-scale');
    scale.appendChild(el('span', null, '0%'));
    if (zone.config) {
      scale.appendChild(
        el('span', null, 'start ' + zone.config.start_percent + '% · stop ' + zone.config.stop_percent + '%'),
      );
    }
    scale.appendChild(el('span', null, '100%'));
    wrap.appendChild(scale);
    return wrap;
  }

  function renderZoneCard(zone) {
    var card = el('div', 'card card-zone' + (zone.irrigating ? ' active' : ''));
    card.appendChild(el('h3', null, 'Zone ' + zone.zone));

    var main = el('div', 'moisture-main');
    main.appendChild(el('span', 'moisture-value', fmtPercent(zone.average)));
    main.appendChild(el('span', 'moisture-unit', '%'));
    card.appendChild(main);

    // Honest labelling: this scale is calibrated between a dry-air and a
    // submerged reference. It is not volumetric water content.
    card.appendChild(
      el('p', 'moisture-caption', 'zone average · relative soil moisture'),
    );

    card.appendChild(renderGauge(zone));

    var rows = el('div', 'rows');
    rows.appendChild(renderSensorRow('Sensor 1', zone.sensor_1, zone.sensor_1_valid));
    rows.appendChild(renderSensorRow('Sensor 2', zone.sensor_2, zone.sensor_2_valid));
    rows.appendChild(
      row('Valve', badge(zone.valve_open ? 'OPEN' : 'CLOSED', zone.valve_open ? 'water' : 'idle')),
    );
    rows.appendChild(
      row(
        'Status',
        zone.valid_sensors === 2
          ? badge('OK', 'ok')
          : zone.valid_sensors === 1
            ? badge('DEGRADED — 1 of 2 probes', 'warn')
            : badge('NO VALID PROBES', 'crit'),
      ),
    );
    card.appendChild(rows);
    return card;
  }

  function renderAlerts(alerts) {
    var wrap = el('div', 'alerts');
    alerts.forEach(function (alert) {
      var node = el('div', 'alert alert-' + (alert.severity === 'critical' ? 'critical' : 'warning'));
      var body = el('div', 'alert-body');
      body.appendChild(el('strong', null, alert.type.replace(/_/g, ' ')));
      body.appendChild(document.createTextNode(alert.message));
      node.appendChild(body);
      node.appendChild(el('span', 'alert-time', fmtAgo(alert.raised_at)));
      wrap.appendChild(node);
    });
    return wrap;
  }

  function renderEvents(events) {
    var card = el('div', 'card');
    card.appendChild(el('h3', null, 'Recent events'));

    if (!events.length) {
      card.appendChild(el('p', 'empty', 'No events recorded yet.'));
      return card;
    }

    var list = el('ul', 'events');
    events.forEach(function (event) {
      var item = el('li', 'event');
      var kind =
        event.type.indexOf('ERROR') >= 0 || event.type === 'IRRIGATION_TIMEOUT'
          ? 'crit'
          : event.type === 'IRRIGATION_STARTED' || event.type === 'ZONE_ACTIVATED'
            ? 'water'
            : 'idle';
      item.appendChild(badge(event.type.replace(/_/g, ' '), kind));

      var detailParts = [];
      if (event.zone) detailParts.push('zone ' + event.zone);
      if (event.detail) detailParts.push(event.detail);
      if (event.duration_ms) detailParts.push('after ' + fmtDuration(event.duration_ms));
      item.appendChild(el('span', 'event-detail', detailParts.join(' · ')));

      item.appendChild(el('span', 'event-time', fmtAgo(event.received_at)));
      list.appendChild(item);
    });
    card.appendChild(list);
    return card;
  }

  function renderDevice(device) {
    var section = el('section', 'device');

    var head = el('div', 'device-head');
    head.appendChild(el('h2', null, device.device_id));
    if (device.simulated) {
      head.appendChild(badge('SIMULATED DATA', 'sim'));
    }
    var meta = el('div', 'device-meta');
    meta.textContent = (device.firmware || 'unknown firmware') + ' · seen ' + fmtAgo(device.last_seen_at);
    head.appendChild(meta);
    section.appendChild(head);

    if (device.simulated) {
      section.appendChild(
        el(
          'div',
          'notice',
          'These readings come from a simulated source, not from physical soil probes.',
        ),
      );
    }

    if (device.alerts && device.alerts.length) {
      section.appendChild(renderAlerts(device.alerts));
    }

    var grid = el('div', 'grid');
    grid.appendChild(renderSystemCard(device));
    (device.zones || []).forEach(function (zone) {
      grid.appendChild(renderZoneCard(zone));
    });
    section.appendChild(grid);

    var eventsWrap = el('div', 'grid');
    eventsWrap.style.marginTop = '16px';
    eventsWrap.appendChild(renderEvents(device.events || []));
    section.appendChild(eventsWrap);

    return section;
  }

  function render(data) {
    content.replaceChildren();

    if (!data.devices.length) {
      var empty = el('p', 'placeholder');
      empty.textContent =
        'No devices have reported yet. Start the firmware, or run the mock device with: npm run mock-device';
      content.appendChild(empty);
      return;
    }

    data.devices.forEach(function (device) {
      content.appendChild(renderDevice(device));
    });
  }

  // --- polling -------------------------------------------------------------

  function updateRefreshLabel(message, stale) {
    refreshState.textContent = message;
    refreshState.className = stale ? 'refresh stale' : 'refresh';
  }

  function poll() {
    fetch('/api/v1/dashboard', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        lastSuccessAt = Date.now();
        render(data);
        updateRefreshLabel('updated ' + new Date().toLocaleTimeString(), false);
      })
      .catch(function (error) {
        // Losing the dashboard says nothing about the farm: the controller
        // keeps irrigating locally. Say so rather than implying an outage.
        var age = lastSuccessAt ? Date.now() - lastSuccessAt : Infinity;
        var stale = age > STALE_AFTER_MS;
        updateRefreshLabel(
          'dashboard offline (' + error.message + ') — controller unaffected',
          stale,
        );
      });
  }

  poll();
  setInterval(poll, POLL_MS);
})();
