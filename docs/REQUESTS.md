# HYDRAX — Customer request flow

From the public website to an operator status update.

```
website  →  /request  →  POST /api/v1/requests  →  Postgres  →  confirmation (HYX-XXXXXX)
                                                      ↓
                                          /admin  →  operator console  →  status update
```

---

## Product language

There is **no payment system and no finalised pricing**, so nothing in this
flow implies either. The call to action is **"Request Your HYDRAX System"**;
the outcome is a quote request, not an order.

`npm run check:website` fails the build on `buy now`, `add to cart`,
`checkout`, `proceed to payment`, `order now`, or any currency figure.

Capabilities the customer can ask for are labelled honestly on the form:

| Capability | Label |
| --- | --- |
| Smart irrigation | **Available now** |
| Pump monitoring | **In development** — needs current/temperature/vibration hardware |
| Water network monitoring | **In development** — needs a flow meter |
| Safety monitoring | **In development** — needs environmental sensors |

Selecting one records interest. The form says plainly that in-development
capabilities are not available for delivery today.

---

## The customer flow

Three steps in one form, so nothing is lost moving between them.

| Step | Collects |
| --- | --- |
| 1 · Farm | Size, location, irrigation type (drip / sprinkler / other), zone count (1–64) |
| 2 · Requirements | One or more capabilities |
| 3 · Contact | Full name, phone, email *(optional)*, notes *(optional)* |

On success the page shows **Request submitted successfully**, the request ID,
and what happens next. It promises no date and no price.

### Why email is optional

A farmer with a phone and no email is a real customer. Phone is required;
email is validated only if given.

### Client vs server validation

The form validates for fast feedback. **It is not a security control** — the
server validates the same payload independently and is the only authority. If
they disagree, the server wins and its field-level errors are shown.

---

## Request references

Format `HYX-XXXXXX`, e.g. `HYX-ZJQTXY`.

- **Random, not sequential.** A reference derived from a row id would tell
  anyone holding one roughly how many requests exist.
- **Unambiguous alphabet.** `0`, `1`, `I`, `L`, `O` and `S` are omitted because
  the reference gets read aloud and written down. 30 characters, 30⁶ = 729
  million combinations.
- **Collision-safe.** `UNIQUE` in the database with a bounded retry, rather
  than assuming randomness is enough.

---

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/requests` | **public** | Submit a request |
| `GET` | `/api/v1/requests?status=&limit=` | `X-Admin-Key` | List with counts |
| `GET` | `/api/v1/requests/:reference` | `X-Admin-Key` | One request |
| `PATCH` | `/api/v1/requests/:reference/status` | `X-Admin-Key` | Update status |

Statuses: `NEW` → `CONTACTED` → `QUOTED` → `CLOSED`. New requests start at
`NEW`.

### The public endpoint returns almost nothing

```json
{ "reference": "HYX-ZJQTXY", "status": "NEW", "created_at": "..." }
```

Only what the customer needs. Echoing their submission back would make the
endpoint useful to anyone probing it.

---

## Database

```sql
quote_requests(
  id, reference UNIQUE, created_at, updated_at, status,
  farm_size, farm_location, irrigation_type, zone_count,
  full_name, phone, email, notes
)

quote_request_capabilities(request_id, capability)   -- PK (request_id, capability)
```

Capabilities are normalized rather than stored as a blob, so they can be
counted and filtered. They are returned in the domain's declared order — not
alphabetically — so a request reads identically however it was fetched.

---

## Security

This is the **only unauthenticated write endpoint in the system**, so it gets
the most defensive treatment.

| Control | Where |
| --- | --- |
| Strict allowlist validation | `src/domain/quote.ts` — unknown fields ignored, never stored |
| Enum allowlists | Irrigation type, capabilities and status matched against fixed sets |
| Length bounds on every string | Name 120, location 160, phone 32, email 254, notes 2000 |
| Control characters stripped | `sanitizeText`, so an export or log line cannot carry escape sequences |
| Body size cap | 64 KB, enforced while streaming — **413** before parsing |
| Rate limiting | 10 submissions/hour per source (`HYDRAX_REQUEST_RATE_MAX`) |
| Parameterized SQL | Every statement; no string interpolation anywhere |
| Output escaping | The console renders with `textContent` only, enforced by `check:admin` |
| Operator key required for reads | The device key is explicitly **not** accepted |

A caller cannot set their own `status`, `id` or `reference` — those fields are
ignored if submitted, which is covered by a test.

### The rate limiter is a speed bump, not a shield

In-memory and keyed on a client-controlled header. It stops accidental retry
storms and casual abuse. A distributed flood belongs to the reverse proxy;
see [DEPLOYMENT.md](DEPLOYMENT.md) when that exists.

---

## Operator console

Served at `/admin`, deliberately separate from `/dashboard`: the dashboard
shows device data, this holds customer personal data.

- The page **asks for** the operator key; it never ships with one.
- The key lives in `sessionStorage` — it survives a reload of that tab and
  disappears when the tab closes. Never `localStorage`, which would persist on
  a shared machine. Enforced by `npm run check:admin`.
- Shows reference, customer, farm, zones, capabilities, notes, date and status.
- Filter by status; update status inline.

---

## Running the flow locally

```bash
cd backend
HYDRAX_DEVICE_KEY=demo-device-key HYDRAX_ADMIN_KEY=demo-admin-key npm start
```

| Step | Where |
| --- | --- |
| 1. Public site | <http://localhost:8080> |
| 2. Submit a request | <http://localhost:8080/request> |
| 3. Note the reference | shown on the confirmation |
| 4. Operator console | <http://localhost:8080/admin> |
| 5. Unlock | paste `demo-admin-key` |
| 6. Update status | click `CONTACTED` / `QUOTED` / `CLOSED` |

From the command line:

```bash
curl -X POST http://localhost:8080/api/v1/requests -H 'Content-Type: application/json' -d '{"farm_size":"9 hectares","farm_location":"Fayoum","irrigation_type":"DRIP","zone_count":3,"capabilities":["SMART_IRRIGATION"],"full_name":"Test Customer","phone":"+20 100 555 0134"}'
```

---

## Known limitations

1. **No email or SMS is sent.** The reference is shown on screen only; a
   customer who closes the tab without noting it has no copy. Wiring an
   email provider is deliberate future work, not an oversight.
2. **No customer-facing status lookup.** A reference cannot be used to check
   progress; it exists so both sides can refer to the same request.
3. **No CSV export** from the operator console.
4. **No notification** when a request arrives — the console must be opened.
5. **Personal data has no retention policy.** Telemetry is pruned;
   `quote_requests` is not. Add one before handling real customers.
6. **Single operator key**, shared by whoever needs access. There are no
   per-user accounts and no audit trail of who changed a status.
