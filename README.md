# Event Scan Ingestion Service (Node.js + JavaScript + Express)

This project implements a reliable ingestion service for on-site event scans from:

- API: `https://portal.eventscloud.com/api/scan`
- Method: `POST`
- Auth: body `{ "token": "1f04984f4b1044a99e821001b503c184" }`

The service polls every 5 minutes, stores scans durably, and maintains scan counts per player (`badgeId`) without double counting.

---

## Problem Understanding

- A valid scan is a record with non-empty `Booth Name`.
- A player is identified by `badgeId`.
- A scan is uniquely identified by `(badgeId, scanDate)`.
- API supports:
  - `scanDateGT` (strictly greater than)
  - `scanDateLT` (strictly less than)
- API returns older scans first and has a hard limit of **1000 records per call**.

Primary requirement: **do not miss scans** while polling during the event.

---

## Design Highlights

### 1) Reliable Incremental Polling

- Service runs every 5 minutes (`POLL_INTERVAL_MS`).
- It persists a cursor (`state.json`) to survive restarts.
- Each poll uses an overlap window (`OVERLAP_MS`, default 2 min):  
  Query window is `[cursor - overlap, now)`.
- Overlap + dedupe prevents boundary misses and recovers from short delays.

### 2) Workaround for 1000-Record API Limit

Because there is no pagination, a single 5-minute window can be truncated at 1000.

The service handles this by recursive time slicing:

1. Fetch `(start, end)`.
2. If result count `< 1000`, accept.
3. If result count `== 1000`, split interval at midpoint and fetch both halves recursively.
4. Continue until every sub-range is below 1000.

This guarantees full retrieval as long as even the smallest split windows can drop below 1000.

### 3) Idempotency + No Double Counting

- Uses unique key: `badgeId|scanDate`.
- Already-seen keys are stored and loaded from disk.
- Replayed records due to overlap/retries/restarts are ignored safely.

### 4) Durability

Data stored in `data/`:

- `state.json` → cursor/checkpoint
- `counts.json` → player scan counts
- `processed-keys.ndjson` → dedupe keys
- `scans.ndjson` → normalized scan history

Atomic JSON writes are used for critical state files.

---

## Project Structure

- `src/index.js` - app bootstrap and lifecycle
- `src/config.js` - environment configuration + validation
- `src/api/scanClient.js` - API client with retry/backoff + timeout
- `src/services/scanIngestionService.js` - polling, recursive slicing, normalization
- `src/persistence/fileStore.js` - durable state, counts, dedupe store
- `src/api/httpServer.js` - Express API endpoints
- `src/utils/time.js` - date helpers
- `src/logger.js` - structured logs

---

## Run Locally

## 1) Install

```bash
npm install
```

## 2) Start

```bash
npm start
```

For development:

```bash
npm run dev
```

---

## Environment Variables

All have defaults, so it runs out-of-the-box.

- `SCAN_API_URL` (default: provided API URL)
- `SCAN_API_TOKEN` (default: provided token)
- `POLL_INTERVAL_MS` (default: `300000`)
- `OVERLAP_MS` (default: `120000`)
- `REQUEST_TIMEOUT_MS` (default: `30000`)
- `MAX_RETRIES` (default: `3`)
- `BOOTSTRAP_START_ISO` (default: now - 24h)
- `INITIAL_SCAN_DATE_GT` (optional, must be used with `INITIAL_SCAN_DATE_LT`)
- `INITIAL_SCAN_DATE_LT` (optional, must be used with `INITIAL_SCAN_DATE_GT`)
- `DATA_DIR` (default: `./data`)
- `API_PORT` (default: `3000`)

Example:

```bash
POLL_INTERVAL_MS=300000 OVERLAP_MS=120000 npm run dev
```

Run an explicit one-day initial range, then continue normal 5-minute polling:

```bash
INITIAL_SCAN_DATE_GT=2026-02-09T00:00:00 \
INITIAL_SCAN_DATE_LT=2026-02-10T00:00:00 \
npm run dev
```

---

## Why This Meets the Requirement

- Polls every 5 minutes as requested.
- Maintains per-player scan counts persistently.
- Avoids missed scans via overlap + checkpointing.
- Avoids duplicate counts via unique `(badgeId, scanDate)` dedupe.
- Handles API max-1000 constraint via recursive time splitting.
- Resilient to transient API failures via retries and backoff.

---

## Query APIs

After service starts, these read endpoints are available:

- `GET /health`
- `GET /stats/overview`
  - returns total players, total scans, cursor, last run time
- `GET /stats/players`
  - returns scan counts for all players (`badgeId -> count`)
- `GET /stats/players/:badgeId`
  - returns scan count for one player

Examples:

```bash
curl http://localhost:3000/stats/overview
curl http://localhost:3000/stats/players/1765302946426001lbnc
```

---

## Operational Notes

- If event throughput is extremely high (e.g., >1000 scans in sub-millisecond windows), even recursive splitting may hit API cap at minimal interval width. In that case, poll more frequently (e.g., every 1 minute) and/or coordinate with API provider for pagination.
- File-based persistence is excellent for task/demo/single-instance runtime. For production at larger scale, move state/dedupe/counts into a database with unique constraints.