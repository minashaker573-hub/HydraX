/**
 * Customer quote requests.
 *
 * POST /api/v1/requests is the only unauthenticated write endpoint in the
 * system, so it gets the most adversarial treatment here: malformed input,
 * oversized input, unknown fields, injection attempts and enumeration.
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  adminGet,
  adminPatch,
  post,
  quotePayload,
  startHarness,
  TEST_ADMIN_KEY,
  TEST_KEY,
  type Harness,
} from './helpers.ts';

const harnesses: Harness[] = [];

async function harness(overrides = {}): Promise<Harness> {
  const instance = await startHarness(overrides);
  harnesses.push(instance);
  return instance;
}

after(async () => {
  await Promise.all(harnesses.map((instance) => instance.close()));
});

/** The public endpoint takes no device key. */
function submit(h: Harness, body: unknown) {
  return post(h, '/api/v1/requests', body, null);
}

// ---------------------------------------------------------------------------
describe('creating a request', () => {
  test('accepts a complete submission and returns a reference', async () => {
    const h = await harness();
    const response = await submit(h, quotePayload());

    assert.equal(response.status, 201);
    assert.match(response.body.reference, /^HYX-[2-9A-HJ-NP-RT-Z]{6}$/);
    assert.equal(response.body.status, 'NEW');
    assert.ok(response.body.created_at);
  });

  test('does not echo the customer back to an anonymous caller', async () => {
    const h = await harness();
    const response = await submit(h, quotePayload());

    // Reflecting submitted data would make this endpoint useful to someone
    // probing it; the customer only needs their reference.
    const keys = Object.keys(response.body).sort();
    assert.deepEqual(keys, ['created_at', 'reference', 'status']);
  });

  test('issues a unique reference per request', async () => {
    const h = await harness();
    const seen = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const response = await submit(h, quotePayload({ full_name: `Customer ${i}` }));
      assert.equal(response.status, 201);
      seen.add(response.body.reference);
    }
    assert.equal(seen.size, 25, 'every reference must be distinct');
  });

  test('stores what was submitted', async () => {
    const h = await harness();
    const created = await submit(
      h,
      quotePayload({
        zone_count: 7,
        irrigation_type: 'SPRINKLER',
        capabilities: ['SMART_IRRIGATION', 'SAFETY_MONITORING'],
      }),
    );

    const stored = await adminGet(h, `/api/v1/requests/${created.body.reference}`);
    assert.equal(stored.status, 200);
    assert.equal(stored.body.farm.zone_count, 7);
    assert.equal(stored.body.farm.irrigation_type, 'SPRINKLER');
    assert.equal(stored.body.customer.full_name, 'Amina Farouk');
    assert.deepEqual(stored.body.capabilities, ['SMART_IRRIGATION', 'SAFETY_MONITORING']);
    assert.equal(stored.body.status, 'NEW');
  });

  test('email is genuinely optional', async () => {
    const h = await harness();
    for (const email of [null, undefined, '']) {
      const response = await submit(h, quotePayload({ email }));
      assert.equal(response.status, 201, `email=${String(email)} should be accepted`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('rejecting bad submissions', () => {
  test('rejects missing required fields and lists every problem', async () => {
    const h = await harness();
    const response = await submit(h, {});

    assert.equal(response.status, 400);
    assert.ok(Array.isArray(response.body.details));
    // Not just the first failure — the form needs to show them all at once.
    assert.ok(response.body.details.length >= 4, 'should report several problems');
  });

  for (const field of ['farm_size', 'farm_location', 'full_name', 'phone']) {
    test(`rejects an empty ${field}`, async () => {
      const h = await harness();
      const response = await submit(h, quotePayload({ [field]: '   ' }));
      assert.equal(response.status, 400);
      assert.ok(response.body.details.some((d: string) => d.startsWith(field)));
    });
  }

  test('rejects an invalid phone number', async () => {
    const h = await harness();
    for (const phone of ['123', 'call me', '+1 (555) CALL-NOW', '9'.repeat(40)]) {
      const response = await submit(h, quotePayload({ phone }));
      assert.equal(response.status, 400, `"${phone}" should be rejected`);
      assert.ok(response.body.details.some((d: string) => d.startsWith('phone')));
    }
  });

  test('accepts real-world phone formats', async () => {
    const h = await harness();
    for (const phone of ['+20 100 555 0134', '(555) 123-4567', '01005550134', '+44 20 7946 0958']) {
      const response = await submit(h, quotePayload({ phone }));
      assert.equal(response.status, 201, `"${phone}" should be accepted`);
    }
  });

  test('rejects an invalid email when one is given', async () => {
    const h = await harness();
    for (const email of ['not-an-email', 'a@b', 'a b@example.com', '@example.com', 'a@@b.com']) {
      const response = await submit(h, quotePayload({ email }));
      assert.equal(response.status, 400, `"${email}" should be rejected`);
      assert.ok(response.body.details.some((d: string) => d.startsWith('email')));
    }
  });

  test('rejects an unknown irrigation type', async () => {
    const h = await harness();
    const response = await submit(h, quotePayload({ irrigation_type: 'FLOOD' }));
    assert.equal(response.status, 400);
  });

  test('rejects an out-of-range zone count', async () => {
    const h = await harness();
    for (const zone_count of [0, -3, 65, 1000, 2.5, '4']) {
      const response = await submit(h, quotePayload({ zone_count }));
      assert.equal(response.status, 400, `zone_count=${String(zone_count)} should be rejected`);
    }
  });

  test('requires at least one capability, and rejects unknown ones', async () => {
    const h = await harness();
    assert.equal((await submit(h, quotePayload({ capabilities: [] }))).status, 400);
    assert.equal((await submit(h, quotePayload({ capabilities: ['MIND_READING'] }))).status, 400);
    assert.equal((await submit(h, quotePayload({ capabilities: 'SMART_IRRIGATION' }))).status, 400);
  });

  test('de-duplicates repeated capabilities', async () => {
    const h = await harness();
    const created = await submit(
      h,
      quotePayload({ capabilities: ['SMART_IRRIGATION', 'SMART_IRRIGATION'] }),
    );
    assert.equal(created.status, 201);

    const stored = await adminGet(h, `/api/v1/requests/${created.body.reference}`);
    assert.deepEqual(stored.body.capabilities, ['SMART_IRRIGATION']);
  });

  test('rejects excessive input on every free-text field', async () => {
    const h = await harness();
    const cases: Record<string, unknown> = {
      farm_size: 'x'.repeat(200),
      farm_location: 'x'.repeat(500),
      full_name: 'x'.repeat(300),
      notes: 'x'.repeat(5000),
    };
    for (const [field, value] of Object.entries(cases)) {
      const response = await submit(h, quotePayload({ [field]: value }));
      assert.equal(response.status, 400, `oversized ${field} should be rejected`);
    }
  });

  test('rejects an oversized body with 413 before parsing it', async () => {
    const h = await harness();
    const huge = JSON.stringify(quotePayload({ notes: 'y'.repeat(100_000) }));
    assert.equal((await submit(h, huge)).status, 413);
  });

  test('rejects a body that is not an object', async () => {
    const h = await harness();
    assert.equal((await submit(h, 'plain text')).status, 400);
    assert.equal((await submit(h, '')).status, 400);
    assert.equal((await submit(h, [1, 2, 3])).status, 400);
  });

  test('ignores unknown fields rather than storing them', async () => {
    const h = await harness();
    const created = await submit(
      h,
      quotePayload({ status: 'CLOSED', id: 999, reference: 'HYX-EVIL01', is_admin: true }),
    );
    assert.equal(created.status, 201);

    // A caller must not be able to set their own status or reference.
    assert.notEqual(created.body.reference, 'HYX-EVIL01');
    assert.equal(created.body.status, 'NEW');
  });
});

// ---------------------------------------------------------------------------
describe('injection and sanitization', () => {
  test('stores SQL-looking input verbatim and harmlessly', async () => {
    const h = await harness();
    const nasty = "Robert'); DROP TABLE quote_requests;--";
    const created = await submit(h, quotePayload({ full_name: nasty }));
    assert.equal(created.status, 201);

    // Parameterized statements mean this is just a name.
    const stored = await adminGet(h, `/api/v1/requests/${created.body.reference}`);
    assert.equal(stored.body.customer.full_name, nasty);

    // And the table still exists.
    assert.equal((await submit(h, quotePayload())).status, 201);
  });

  test('keeps markup as text', async () => {
    const h = await harness();
    const created = await submit(
      h,
      quotePayload({ notes: '<script>alert(1)</script>', full_name: '<img onerror=x>' }),
    );
    assert.equal(created.status, 201);

    const stored = await adminGet(h, `/api/v1/requests/${created.body.reference}`);
    // Stored as given; the console renders with textContent, never innerHTML.
    assert.equal(stored.body.notes, '<script>alert(1)</script>');
  });

  test('strips control characters from stored text', async () => {
    const h = await harness();
    const created = await submit(h, quotePayload({ notes: 'line one [31m red' }));
    assert.equal(created.status, 201);

    const stored = await adminGet(h, `/api/v1/requests/${created.body.reference}`);
    assert.ok(!/[ -]/.test(stored.body.notes), 'control characters must not survive');
  });
});

// ---------------------------------------------------------------------------
describe('operator access', () => {
  test('listing requires the operator key', async () => {
    const h = await harness();
    await submit(h, quotePayload());

    assert.equal((await adminGet(h, '/api/v1/requests', null)).status, 401);
    assert.equal((await adminGet(h, '/api/v1/requests', 'wrong')).status, 401);
    // The device key must not unlock customer data.
    assert.equal((await adminGet(h, '/api/v1/requests', TEST_KEY)).status, 401);

    assert.equal((await adminGet(h, '/api/v1/requests', TEST_ADMIN_KEY)).status, 200);
  });

  test('reading one request requires the operator key', async () => {
    const h = await harness();
    const created = await submit(h, quotePayload());
    const path = `/api/v1/requests/${created.body.reference}`;

    assert.equal((await adminGet(h, path, null)).status, 401);
    assert.equal((await adminGet(h, path, TEST_ADMIN_KEY)).status, 200);
  });

  test('lists newest first, with counts by status', async () => {
    const h = await harness();
    await submit(h, quotePayload({ full_name: 'First Customer' }));
    await submit(h, quotePayload({ full_name: 'Second Customer' }));

    const list = await adminGet(h, '/api/v1/requests');
    assert.equal(list.status, 200);
    assert.equal(list.body.requests.length, 2);
    assert.equal(list.body.requests[0].customer.full_name, 'Second Customer');
    assert.equal(list.body.counts.NEW, 2);
  });

  test('filters by status', async () => {
    const h = await harness();
    const a = await submit(h, quotePayload());
    await submit(h, quotePayload());
    await adminPatch(h, `/api/v1/requests/${a.body.reference}/status`, { status: 'QUOTED' });

    assert.equal((await adminGet(h, '/api/v1/requests?status=NEW')).body.requests.length, 1);
    assert.equal((await adminGet(h, '/api/v1/requests?status=QUOTED')).body.requests.length, 1);
    assert.equal((await adminGet(h, '/api/v1/requests?status=CLOSED')).body.requests.length, 0);
    assert.equal((await adminGet(h, '/api/v1/requests?status=BOGUS')).status, 400);
  });

  test('404s an unknown reference and 400s a malformed one', async () => {
    const h = await harness();
    assert.equal((await adminGet(h, '/api/v1/requests/HYX-ZZZZZZ')).status, 404);
    // Malformed references are rejected before touching the database.
    assert.equal((await adminGet(h, '/api/v1/requests/not-a-reference')).status, 400);
    assert.equal((await adminGet(h, '/api/v1/requests/HYX-0OIL15')).status, 400);
  });
});

// ---------------------------------------------------------------------------
describe('status updates', () => {
  test('moves a request through its lifecycle', async () => {
    const h = await harness();
    const created = await submit(h, quotePayload());
    const path = `/api/v1/requests/${created.body.reference}/status`;

    for (const status of ['CONTACTED', 'QUOTED', 'CLOSED']) {
      const updated = await adminPatch(h, path, { status });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.status, status);
    }
  });

  test('requires the operator key', async () => {
    const h = await harness();
    const created = await submit(h, quotePayload());
    const path = `/api/v1/requests/${created.body.reference}/status`;

    assert.equal((await adminPatch(h, path, { status: 'CLOSED' }, null)).status, 401);
    assert.equal((await adminPatch(h, path, { status: 'CLOSED' }, TEST_KEY)).status, 401);

    // ...and the status is unchanged.
    const stored = await adminGet(h, `/api/v1/requests/${created.body.reference}`);
    assert.equal(stored.body.status, 'NEW');
  });

  test('rejects an unknown status', async () => {
    const h = await harness();
    const created = await submit(h, quotePayload());
    const path = `/api/v1/requests/${created.body.reference}/status`;

    assert.equal((await adminPatch(h, path, { status: 'DELETED' })).status, 400);
    assert.equal((await adminPatch(h, path, {})).status, 400);
  });

  test('404s an unknown reference', async () => {
    const h = await harness();
    const response = await adminPatch(h, '/api/v1/requests/HYX-ZZZZZZ/status', {
      status: 'CLOSED',
    });
    assert.equal(response.status, 404);
  });

  test('updated_at moves while created_at does not', async () => {
    const h = await harness();
    const created = await submit(h, quotePayload());
    const reference = created.body.reference;

    h.setNow(Date.parse('2026-01-01T00:00:00.000Z') + 60_000);
    await adminPatch(h, `/api/v1/requests/${reference}/status`, { status: 'CONTACTED' });

    const stored = await adminGet(h, `/api/v1/requests/${reference}`);
    assert.equal(stored.body.created_at, created.body.created_at);
    assert.notEqual(stored.body.updated_at, stored.body.created_at);
  });
});

// ---------------------------------------------------------------------------
describe('abuse resistance', () => {
  test('rate limits a flood of submissions from one source', async () => {
    // Deliberately tiny window so the limiter is exercised, not the clock.
    const h = await harness({ requestRateMax: 5 });

    let accepted = 0;
    let limited = 0;
    for (let i = 0; i < 15; i += 1) {
      const response = await submit(h, quotePayload({ full_name: `Flood ${i}` }));
      if (response.status === 201) accepted += 1;
      if (response.status === 429) limited += 1;
    }

    assert.ok(accepted > 0, 'genuine requests must get through');
    assert.ok(limited > 0, 'a flood must eventually be refused');
    assert.equal(accepted + limited, 15);
  });
});

// ---------------------------------------------------------------------------
// Cross-origin support exists only so the website can be deployed separately
// from this backend (e.g. Vercel + Render). Off by default; opt-in via
// HYDRAX_ALLOWED_ORIGIN; exactly one origin, never a wildcard.
describe('CORS (public quote endpoint)', () => {
  test('same-origin deployment sends no CORS headers at all', async () => {
    const h = await harness(); // allowedOrigin: null by default
    const response = await fetch(`${h.baseUrl}/api/v1/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://anything.example' },
      body: JSON.stringify(quotePayload()),
    });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });

  test('configured origin receives the allow header on success and on error', async () => {
    const h = await harness({ allowedOrigin: 'https://hydrax-site.example' });

    const ok = await fetch(`${h.baseUrl}/api/v1/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://hydrax-site.example' },
      body: JSON.stringify(quotePayload()),
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://hydrax-site.example');

    // An error response must carry it too, or the browser hides the real
    // validation error behind an opaque CORS failure.
    const bad = await fetch(`${h.baseUrl}/api/v1/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://hydrax-site.example' },
      body: JSON.stringify({}),
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.headers.get('access-control-allow-origin'), 'https://hydrax-site.example');
  });

  test('a non-matching origin never gets the allow header', async () => {
    const h = await harness({ allowedOrigin: 'https://hydrax-site.example' });
    const response = await fetch(`${h.baseUrl}/api/v1/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
      body: JSON.stringify(quotePayload()),
    });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });

  test('OPTIONS preflight answers with allow-methods and allow-headers', async () => {
    const h = await harness({ allowedOrigin: 'https://hydrax-site.example' });
    const response = await fetch(`${h.baseUrl}/api/v1/requests`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://hydrax-site.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://hydrax-site.example');
    assert.equal(response.headers.get('access-control-allow-methods'), 'POST');
    assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type');
  });
});
