/**
 * HYDRAX - mock device.
 *
 * WHAT THIS IS: a test fixture that posts telemetry and events to the backend
 * so the ingestion path, alert rules and dashboard can be exercised without a
 * board on the bench.
 *
 * WHAT THIS IS NOT: a second implementation of the irrigation controller. It
 * replays a fixed script of states; it contains no hysteresis, no thresholds
 * and makes no irrigation decisions. The real decision logic exists once, in
 * firmware/src/core/irrigation_controller.cpp, and is covered by the firmware
 * test suite.
 *
 * Everything it sends carries `simulated: true`, and the dashboard labels it
 * as simulated so synthetic numbers are never mistaken for field readings.
 *
 * Usage:
 *   node tools/mock-device.ts [--url http://127.0.0.1:8080] [--key KEY]
 *                             [--device HYDRAX-SIM-1] [--interval 3000]
 */

interface Options {
  url: string;
  key: string;
  deviceId: string;
  intervalMs: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    url: process.env.HYDRAX_URL ?? 'http://127.0.0.1:8080',
    key: process.env.HYDRAX_DEVICE_KEY ?? '',
    deviceId: 'HYDRAX-SIM-1',
    intervalMs: 3000,
  };

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) break;
    if (flag === '--url') options.url = value;
    else if (flag === '--key') options.key = value;
    else if (flag === '--device') options.deviceId = value;
    else if (flag === '--interval') options.intervalMs = Math.max(500, Number(value) || 3000);
  }
  return options;
}

/** One step of the scripted scenario. */
interface Phase {
  readonly label: string;
  readonly seconds: number;
  readonly state: string;
  readonly activeZone: number | null;
  readonly pump: boolean;
  /** Percentage points per second applied to each zone. */
  readonly drift: readonly [number, number];
  readonly controllerStatus: string;
  /** Sensor ids (1-based) reporting invalid this phase. */
  readonly faultedSensors?: readonly number[];
  readonly enterEvent?: { type: string; zone: number | null; detail: string };
}

// A deliberately eventful script: normal cycle, a second zone, a probe fault,
// recovery, and a runtime timeout. It exercises every Phase 1 alert rule.
const SCRIPT: readonly Phase[] = [
  {
    label: 'boot',
    seconds: 6,
    state: 'IDLE',
    activeZone: null,
    pump: false,
    drift: [-0.4, -0.2],
    controllerStatus: 'OK',
    enterEvent: { type: 'CONTROLLER_STARTED', zone: null, detail: 'boot' },
  },
  {
    label: 'zone 1 drying out',
    seconds: 18,
    state: 'IDLE',
    activeZone: null,
    pump: false,
    drift: [-1.2, -0.2],
    controllerStatus: 'OK',
  },
  {
    label: 'zone 1 valve opening',
    seconds: 3,
    state: 'STARTING',
    activeZone: 1,
    pump: false,
    drift: [0, 0],
    controllerStatus: 'OK',
    enterEvent: { type: 'ZONE_ACTIVATED', zone: 1, detail: 'zone selected' },
  },
  {
    label: 'zone 1 irrigating',
    seconds: 24,
    state: 'IRRIGATING',
    activeZone: 1,
    pump: true,
    drift: [1.4, -0.1],
    controllerStatus: 'OK',
    enterEvent: { type: 'IRRIGATION_STARTED', zone: 1, detail: 'hysteresis start' },
  },
  {
    label: 'zone 1 stopping',
    seconds: 3,
    state: 'STOPPING',
    activeZone: 1,
    pump: false,
    drift: [0, 0],
    controllerStatus: 'OK',
    enterEvent: { type: 'IRRIGATION_STOPPED', zone: 1, detail: 'stop threshold reached' },
  },
  {
    label: 'idle, zone 2 drying',
    seconds: 15,
    state: 'IDLE',
    activeZone: null,
    pump: false,
    drift: [-0.3, -1.6],
    controllerStatus: 'OK',
  },
  {
    label: 'sensor 3 fault',
    seconds: 15,
    state: 'IDLE',
    activeZone: null,
    pump: false,
    drift: [-0.3, -0.5],
    controllerStatus: 'DEGRADED',
    faultedSensors: [3],
    enterEvent: { type: 'SENSOR_ERROR', zone: 2, detail: 'sensor 3 invalid' },
  },
  {
    label: 'sensor 3 recovered',
    seconds: 9,
    state: 'IDLE',
    activeZone: null,
    pump: false,
    drift: [-0.3, -0.8],
    controllerStatus: 'OK',
    enterEvent: { type: 'SENSOR_RECOVERED', zone: 2, detail: 'sensor data restored' },
  },
  {
    label: 'zone 2 irrigating',
    seconds: 21,
    state: 'IRRIGATING',
    activeZone: 2,
    pump: true,
    drift: [-0.2, 0.05],
    controllerStatus: 'OK',
    enterEvent: { type: 'IRRIGATION_STARTED', zone: 2, detail: 'hysteresis start' },
  },
  {
    label: 'zone 2 runtime timeout',
    seconds: 9,
    state: 'TIMEOUT',
    activeZone: 2,
    pump: false,
    drift: [0, 0],
    controllerStatus: 'OK',
    enterEvent: {
      type: 'IRRIGATION_TIMEOUT',
      zone: 2,
      detail: 'max runtime exceeded',
    },
  },
  {
    label: 'recovered, idle',
    seconds: 18,
    state: 'IDLE',
    activeZone: null,
    pump: false,
    drift: [-0.3, -0.4],
    controllerStatus: 'OK',
    enterEvent: { type: 'IRRIGATION_STOPPED', zone: 2, detail: 'timeout handled' },
  },
];

const clamp = (value: number): number => Math.max(0, Math.min(100, value));
const round1 = (value: number): number => Math.round(value * 10) / 10;

async function post(options: Options, path: string, body: unknown): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.key !== '') headers['X-Device-Key'] = options.key;

  try {
    const response = await fetch(`${options.url}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(`  ! ${path} -> ${response.status}: ${text.slice(0, 300)}`);
    }
  } catch (error) {
    // Mirrors real device behaviour: the backend being unreachable is not
    // fatal, it just means telemetry is lost for now.
    console.error(`  ! ${path} unreachable: ${(error as Error).message}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  // Two zones, two probes each, matching the Phase 1 topology.
  const zoneMoisture: [number, number] = [58, 62];
  let phaseIndex = 0;
  let phaseElapsedS = 0;

  console.log(`HYDRAX mock device "${options.deviceId}" -> ${options.url}`);
  console.log('SIMULATED DATA - this is a fixture, not a real controller.\n');

  const tick = async (): Promise<void> => {
    const phase = SCRIPT[phaseIndex]!;
    const stepS = options.intervalMs / 1000;

    if (phaseElapsedS === 0) {
      console.log(`[phase] ${phase.label}`);
      if (phase.enterEvent !== undefined) {
        await post(options, '/api/v1/events', {
          device_id: options.deviceId,
          uptime_ms: Date.now() - startedAt,
          type: phase.enterEvent.type,
          zone: phase.enterEvent.zone ?? -1,
          moisture: round1(zoneMoisture[(phase.enterEvent.zone ?? 1) - 1] ?? 0),
          duration_ms: 0,
          detail: phase.enterEvent.detail,
        });
      }
    }

    zoneMoisture[0] = clamp(zoneMoisture[0] + phase.drift[0] * stepS);
    zoneMoisture[1] = clamp(zoneMoisture[1] + phase.drift[1] * stepS);

    const faulted = new Set(phase.faultedSensors ?? []);
    const sensors = [1, 2, 3, 4].map((id) => {
      const zone = id <= 2 ? 1 : 2;
      const base = zoneMoisture[zone - 1]!;
      // A little per-probe spread, deterministic so the display is stable.
      const percent = clamp(base + (id % 2 === 0 ? 1.5 : -1.5));
      const valid = !faulted.has(id);
      return {
        id,
        zone,
        raw: valid ? Math.round(3000 - (percent / 100) * 1700) : -1,
        percent: valid ? round1(percent) : 0,
        valid,
        status: valid ? 'OK' : 'DRIVER_ERROR',
      };
    });

    const soil: Record<string, unknown> = {};
    for (const zone of [1, 2]) {
      const inZone = sensors.filter((s) => s.zone === zone);
      const valid = inZone.filter((s) => s.valid);
      const average =
        valid.length === 0
          ? 0
          : round1(valid.reduce((sum, s) => sum + s.percent, 0) / valid.length);
      soil[`zone_${zone}`] = {
        sensor_1: inZone[0]!.percent,
        sensor_2: inZone[1]!.percent,
        average,
        valid_sensors: valid.length,
      };
    }

    await post(options, '/api/v1/telemetry', {
      device_id: options.deviceId,
      firmware: '0.1.0-phase1-sim',
      uptime_ms: Date.now() - startedAt,
      device_time: null,
      simulated: true,
      soil,
      actuators: {
        pump: phase.pump,
        zone_1_valve: phase.activeZone === 1,
        zone_2_valve: phase.activeZone === 2,
      },
      irrigation: {
        state: phase.state,
        run_ms: phase.state === 'IRRIGATING' ? Math.round(phaseElapsedS * 1000) : 0,
        active_zone: phase.activeZone,
      },
      controller: { status: phase.controllerStatus },
      network: { wifi_connected: true, rssi: -58 },
      sensors,
    });

    phaseElapsedS += stepS;
    if (phaseElapsedS >= phase.seconds) {
      phaseElapsedS = 0;
      phaseIndex = (phaseIndex + 1) % SCRIPT.length;
    }
  };

  await tick();
  const timer = setInterval(() => void tick(), options.intervalMs);

  const stop = (): void => {
    clearInterval(timer);
    console.log('\nmock device stopped');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

void main();
