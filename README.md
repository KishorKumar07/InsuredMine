# InsuredMine Node.js Technical Assessment

An Express + MongoDB backend built for the InsuredMine "Software Engineer - Node.js" technical
assessment. It covers both required tasks:

- **Task 1** - upload the provided XLSX/CSV sheet into MongoDB using a worker thread, split
  across 6 normalized collections (Agent, User, Account, Policy Category/LOB, Carrier, Policy),
  plus a search-by-username API and an aggregated-policies-per-user API.
- **Task 2** - a real-time CPU monitor that restarts the server once usage stays above 70%, and a
  persistent scheduled-message service that inserts a message into the DB at a given day/time.

---

## Contents

- [Architecture](#architecture)
- [Data model](#data-model)
- [Data observations & assumptions](#data-observations--assumptions)
- [Setup](#setup)
- [Running the app](#running-the-app)
- [API reference](#api-reference)
- [Task 2.1 - CPU monitor & restart, in depth](#task-21---cpu-monitor--restart-in-depth)
- [Task 2.2 - Scheduled messages, in depth](#task-22---scheduled-messages-in-depth)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Design decisions & trade-offs](#design-decisions--trade-offs)
- [Known limitations / what I'd add with more time](#known-limitations--what-id-add-with-more-time)

---

## Architecture

```
                 ┌────────────────────┐
   HTTP clients  │   cluster primary   │  (src/cluster.js)
   ───────────▶  │  forks + re-forks   │
                 └─────────┬──────────┘
                            │ fork() / re-fork on exit code 1
                            ▼
                 ┌────────────────────┐
                 │   worker process    │  (src/server.js)
                 │  Express app        │
                 │  CpuMonitor         │──▶ sustained >70% CPU ──▶ graceful shutdown ──▶ exit(1)
                 │  MessageScheduler   │──▶ polls DB every 5s for due messages
                 └─────────┬──────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                            ▼
     Express routes/controllers   worker_threads.Worker (per upload)
     (search, aggregate, CRUD)      src/workers/upload.worker.js
              │                            │
              └─────────────┬──────────────┘
                             ▼
                      MongoDB (mongoose)
     Agent · User · Account · PolicyCategory · Carrier · Policy
     UploadJob · ScheduledMessage · Message
```

- **`cluster`** (Node built-in) is the restart mechanism for Task 2.1 - the primary process never
  serves traffic itself, it only forks worker process(es) and re-forks one when it exits non-zero.
- **`worker_threads`** is the mechanism for Task 1.1 - a brand-new OS thread, with its own
  MongoDB connection, parses the uploaded file and writes to the DB off the main event loop so
  the HTTP server keeps responding to other requests while a 1000+ row import runs.
- These are two different Node concurrency primitives used for two different jobs: `cluster` for
  process-level fault tolerance, `worker_threads` for CPU/IO-heavy work isolation within one
  process. Mixing them up is a common interview trip-up, so it's worth being able to explain the
  difference on the spot: `cluster` forks a full OS **process** (separate memory, separate event
  loop, can bind the same port via round-robin), `worker_threads` spins up a **thread** inside the
  same process (separate JS heap/event loop, but can share memory via `SharedArrayBuffer` -
  unused here since a DB connection can't be shared, but relevant to know).

---

## Data model

| Collection | Purpose | Natural / de-dup key |
|---|---|---|
| `Agent` | Agent name | `name` (unique) |
| `User` | Person: firstName, dob, address, phone, state, zip, email, gender, userType | `firstName + dob + email` (composite unique index) |
| `Account` | A user's account | `accountName + userId` (composite unique index) |
| `PolicyCategory` | Line of business (LOB) | `categoryName` (unique) |
| `Carrier` | Insurance carrier | `companyName` (unique) |
| `Policy` | The fact table: policyNumber, start/end dates, refs to category/carrier/user (+ agent, account, producer, csr, premium, mode, type) | `policyNumber` (globally unique) |
| `UploadJob` | Tracks progress/status/errors of one ingestion run | - |
| `ScheduledMessage` | A message queued for future delivery (Task 2.2) | - |
| `Message` | The delivered message, once its scheduled time arrives | - |

`Policy` is the only collection with foreign keys into the other five - see
[src/models/Policy.js](src/models/Policy.js). Each of the required 6 collections is its own
Mongoose model/file under [src/models/](src/models/).

---

## Data observations & assumptions

The sample sheet (`docs/data-sheet - Node js Assesment (2) (1).csv`, 1,198 data rows) has a few
properties that directly shaped the schema/ingestion design. These are worth mentioning in the
interview - they show the data was actually read, not just skimmed:

1. **No real "username" column.** `firstname` actually holds a full name string (e.g. "Lura
   Lucca") and is what task 1.2 means by "username" - there's no separate login/username field in
   the sheet. Search is implemented against `User.firstName`.
2. **`email` is NOT a unique identifier.** Two clearly different people in the sheet share the
   same email (it looks like the producer/CSR's email got reused for multiple clients under them).
   De-duplicating users by email alone would silently merge unrelated people. Users are
   upserted on the composite key `firstName + dob + email`, which is unique across the sheet and
   a reasonable proxy for "same person" given the fields available.
3. **`account_name` repeats across different users** (about 5 cases in the sheet, e.g. two
   different households named "... & Someone Else"). Accounts are keyed by
   `accountName + userId`, not `accountName` alone.
4. **`policy_number` is the one truly unique key** in the whole sheet (1,198 rows, 1,198 distinct
   values) - it's used as the idempotency key for the Policy upsert, so re-uploading the same file
   twice does not create duplicate policies (verified in `tests/integration/upload.test.js`).
5. **Several columns are empty on every row**: `premium_amount_written`, `primary`,
   `Applicant ID`, `agency_id`, `hasActive ClientPolicy`. They're still modeled (nullable) rather
   than dropped, in case a future upload populates them.
6. **Dates need to support two formats.** A CSV export shows `2018-11-02`, but the same file
   opened/re-saved as `.xlsx` stores dates as Excel serial numbers (e.g. `43406`, Excel's epoch is
   1899-12-30). [`src/utils/parseDate.js`](src/utils/parseDate.js) handles both, plus JS `Date`
   objects (which `exceljs` sometimes returns directly) and ISO strings.
7. **Zip codes** come in two shapes (`27028` and `27101-3843`) - stored as a plain string, not a
   number, so leading content/hyphens survive.
8. **`agent` has no explicit place in the 6 required collections' relationships** in the task
   description. I added an optional `agentId` reference on `Policy` (see
   [Design decisions](#design-decisions--trade-offs)) since the sheet clearly associates one agent
   with each policy row, and dropping that link would throw away real information for no reason.

---

## Setup

### Prerequisites
- Node.js 18+
- MongoDB (local install, Docker, or Atlas) - **or** run `npm run mongo:dev` for a zero-install
  local MongoDB (see below), which is what this README's examples use.

### Install
```bash
npm install
cp .env.example .env   # then edit if needed
```

### Get a MongoDB instance running

**Option A - Docker:**
```bash
docker run -d --name insuredmine-mongo -p 27017:27017 mongo:7
```

**Option B - zero-install dev Mongo** (no Docker/system install needed - downloads and runs a
real, standalone `mongod` via `mongodb-memory-server`):
```bash
npm run mongo:dev
# -> Dev MongoDB running at: mongodb://127.0.0.1:27117/insuredmine
```
Leave that running in its own terminal, and point the app at it:
```bash
# .env
MONGO_URI=mongodb://127.0.0.1:27117/insuredmine
```

**Option C** - a real local/remote MongoDB - just set `MONGO_URI` in `.env` accordingly.

---

## Running the app

```bash
npm start           # cluster.js - the full Task 2.1 setup (primary + worker, auto-restart)
npm run start:single # server.js directly - no cluster/auto-restart, useful for debugging
npm run dev          # nodemon, single process, auto-reload on file changes
```

The server listens on `PORT` (default `3000`). Check it's up:
```bash
curl http://localhost:3000/api/health
```

---

## API reference

All responses use the envelope `{ "success": true, "data": ... }` or
`{ "success": false, "error": { "message": ..., "details": ... } }`.
A ready-to-import Postman collection is at
[postman/InsuredMine-Assessment.postman_collection.json](postman/InsuredMine-Assessment.postman_collection.json).

### Task 1.1 - Upload (worker thread)

**`POST /api/upload`** - multipart/form-data, field name `file` (`.csv` or `.xlsx`, max 25MB by
default). Returns immediately (`202`) with a job id; parsing/inserting happens in a
`worker_threads.Worker` (see [src/workers/upload.worker.js](src/workers/upload.worker.js)) so the
event loop stays free for other requests while a 1000+ row file is processed.

```bash
curl -X POST http://localhost:3000/api/upload -F "file=@docs/data-sheet - Node js Assesment (2) (1).csv"
# 202 { "success": true, "data": { "jobId": "…", "message": "Upload accepted, processing in a worker thread." } }
```

**`GET /api/upload/:jobId`** - poll for progress/result.
```bash
curl http://localhost:3000/api/upload/<jobId>
```
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "totalRows": 1198,
    "processedRows": 1198,
    "insertedCounts": { "agents": 3, "users": 1198, "accounts": 1198, "categories": 19, "carriers": 46, "policies": 1198 },
    "errors": []
  }
}
```
Uploading the same file again is **idempotent** - every write is an upsert keyed on the natural
key for that collection (see [Data model](#data-model)), so counts don't double.

### Task 1.2 - Search policy info by username

**`GET /api/policies/search?username=<name>&page=&limit=`**

Case-insensitive, partial match against `User.firstName` (see
[assumption #1](#data-observations--assumptions)). Returns each matching policy populated with its
user, category, carrier, agent and account.

```bash
curl "http://localhost:3000/api/policies/search?username=lura"
```

### Task 1.3 - Aggregated policy info per user

**`GET /api/policies/aggregate?page=&limit=`** - every user, grouped, with `totalPolicies`,
`totalPremium`, and their policy list, via the MongoDB aggregation pipeline (`$group` + `$lookup`
+ `$facet` for pagination).

**`GET /api/policies/aggregate/:userId`** - same aggregation, scoped to one user, with
category/carrier names resolved via `$lookup`.

```bash
curl "http://localhost:3000/api/policies/aggregate?limit=5"
curl "http://localhost:3000/api/policies/aggregate/<userId>"
```

### Task 2.1 - CPU stress demo endpoint (dev only, not mounted when `NODE_ENV=production`)

**`GET /api/debug/cpu-stress?durationMs=15000`** - burns CPU for `durationMs` (capped at 30000) so
you can watch the restart happen without an external load tool. See
[below](#task-21---cpu-monitor--restart-in-depth) for how to observe it.

### Task 2.2 - Scheduled messages

**`POST /api/messages/schedule`**
```json
{ "message": "Follow up with client", "day": "2026-10-01", "time": "14:30", "timezoneOffsetMinutes": 0 }
```
- `day`: an ISO date (`YYYY-MM-DD`) **or** a weekday name (`"Monday"`, resolves to its next
  occurrence). Both forms are supported since the brief didn't specify which was meant - see
  [Design decisions](#design-decisions--trade-offs).
- `time`: 24-hour `HH:mm` or `HH:mm:ss`.
- `timezoneOffsetMinutes` (optional, default `0`/UTC): minutes to **add** to the given local time
  to reach UTC (e.g. IST is UTC+5:30, so pass `-330`).
- Rejects a `day`+`time` that resolves to a moment already in the past.

**`GET /api/messages/schedule/:id`** - fetch one.
**`GET /api/messages/schedule?status=pending&page=&limit=`** - list/filter.

The message actually lands in the **`Message`** collection once its `scheduledAt` time arrives -
see [below](#task-22---scheduled-messages-in-depth) for the delivery mechanism.

---

## Task 2.1 - CPU monitor & restart, in depth

**Why not `os.loadavg()`?** It always returns `[0, 0, 0]` on Windows (this machine's OS) - not a
usable cross-platform signal. Instead, [`src/monitor/cpuMonitor.js`](src/monitor/cpuMonitor.js)
samples **this process's own** CPU time via `process.cpuUsage()` every `CPU_SAMPLE_INTERVAL_MS`
(default 2s), takes the delta against the previous sample, and divides by the elapsed wall-clock
time to get a percentage. This is process CPU usage, not full-machine usage - deliberately, since
"restart the Node server" only makes sense as a reaction to *this* process running hot, not to
unrelated load elsewhere on the box.

**Why require *consecutive* high samples (default 3), not just one?** A single spike (e.g. a GC
pause or one heavy request) shouldn't kill the server. `CPU_CONSECUTIVE_SAMPLES` samples in a row
above `CPU_THRESHOLD_PERCENT` (default 70%) are required before a restart triggers, and any
sample below the threshold resets the streak. This is unit-tested in
[tests/unit/cpuMonitor.test.js](tests/unit/cpuMonitor.test.js) with a mocked clock.

**Restart mechanism:** [`src/cluster.js`](src/cluster.js) is the entry point (`npm start`). The
cluster **primary** does no app work - it only forks `CLUSTER_WORKERS` worker **processes**
running [`src/server.js`](src/server.js). Each worker runs its own `CpuMonitor`; when one worker's
CPU stays high for the required streak, that worker:
1. Logs the trigger and calls `gracefulShutdown()` ([src/utils/gracefulShutdown.js](src/utils/gracefulShutdown.js)):
   stop accepting new connections, let in-flight requests finish (bounded by a 10s timeout),
   disconnect MongoDB, then `process.exit(1)`.
2. The primary's `cluster.on('exit', ...)` handler sees the non-zero exit code and immediately
   forks a replacement worker - the "restart".
3. A **crash-loop guard** in `cluster.js` tracks restart frequency and adds a short backoff delay
   if a worker is dying faster than 5 times in 10 seconds (protects against, e.g., a bad
   `MONGO_URI` causing an infinite fork storm that would otherwise peg a CPU core itself).

**No extra dependency required** - Node's built-in `cluster` module is enough. The same
`CpuMonitor` class would work unmodified under **pm2** too
(`pm2 start src/server.js -i max --max-memory-restart …` style), which is the more common
production choice - `cluster.js` here is meant to demonstrate understanding of the underlying
mechanism pm2 wraps.

**Demoing it live:**
```bash
npm start
# in another terminal, repeatedly or with a long duration:
curl "http://localhost:3000/api/debug/cpu-stress?durationMs=15000"
```
Watch the server logs - the CPU stress endpoint intentionally yields the event loop every 50ms
(via `setImmediate`) rather than blocking it in one unbroken loop. **This matters**: a fully
unbroken busy-loop would also stall the `CpuMonitor`'s own `setInterval` sampler (since it can't
tick while the event loop is blocked), so it would only ever record one high sample right after
the stress ends - never reaching `CPU_CONSECUTIVE_SAMPLES`. Yielding periodically keeps the
process legitimately CPU-hot while still letting the sampler run on schedule, which is what
actually demonstrates the restart. I found and fixed this while smoke-testing my own demo
endpoint - a good example of the gap between "should work" and "verified to work."

One more real interaction worth knowing: if a request is still in flight when the CPU threshold
fires (like the stress endpoint itself, by design), `server.close()`'s callback waits for it to
finish before disconnecting MongoDB cleanly - so a long-running handler can push the shutdown past
its graceful path into the 10s force-exit fallback. The **process still restarts correctly**
either way (the fallback still calls `process.exit(1)`, and the cluster primary still forks a
healthy replacement) - only that one worker's shutdown was "hard" instead of "clean." This is a
real, deliberate trade-off I verified by hand (see commit history / testing notes) rather than a
gap I didn't notice.

---

## Task 2.2 - Scheduled messages, in depth

**Why not `setTimeout`/`node-cron`/an in-memory queue?** Because Task 2.1 can kill and restart
this very process at any moment. An in-memory timer for "deliver this message in 3 hours" is
silently lost the instant the CPU monitor restarts the server. The two tasks are directly
connected, and treating them as unrelated is the most likely way to lose points on this
assessment.

Instead, every scheduled message is a **persisted MongoDB document**
(`ScheduledMessage { message, scheduledAt, status }`), and
[`src/scheduler/messageScheduler.js`](src/scheduler/messageScheduler.js) runs a lightweight poller
(every `SCHEDULER_POLL_INTERVAL_MS`, default 5s) that:
1. Atomically claims the earliest due job via
   `findOneAndUpdate({status:'pending', scheduledAt:{$lte:now}}, {status:'processing'})` - atomic,
   so if this ever ran with multiple processes/cluster workers polling the same collection, a
   given message is only ever delivered once.
2. Inserts it into the **`Message`** collection and marks the `ScheduledMessage` `completed`.
3. Runs once immediately on startup (in addition to its interval), so anything that came due
   *while the server was down* gets delivered right away on the next boot, rather than waiting up
   to a full poll interval.

**Verified end-to-end**, including surviving a real Task 2.1-triggered restart: a message was
scheduled ~75s out, the CPU-stress endpoint was fired to force a restart mid-wait, and the message
was still delivered exactly on schedule by the replacement worker process (`status: "completed"`,
`resultingMessageId` populated) - confirming the "server restarts don't lose scheduled work" story
holds up in practice, not just in the design doc.

**Ambiguity in "day":** the brief says "message, day, and time" without specifying whether "day"
is a calendar date or a weekday name. Both are supported (see
[resolveSchedule.js](src/utils/resolveSchedule.js)):
`day: "2026-10-01"` (ISO date) or `day: "Monday"` (resolves to its next future occurrence,
rolling to next week if that weekday's time slot today has already passed). This is exactly the
kind of ambiguity the assessment email invited a clarifying question about - I've documented the
assumption here and support both forms rather than guessing wrong and blocking on a reply.

---

## Testing

```bash
npm test          # Jest + Supertest + mongodb-memory-server (real mongod, in-memory, no Docker needed)
npm run test:watch
npm run lint
```

54 tests across unit (pure functions: date parsing, row normalization, regex escaping, schedule
resolution, the CPU monitor's math) and integration (real HTTP requests via `supertest` against a
real in-memory MongoDB, including actually spawning the upload `worker_threads.Worker` and
exercising it against the same DB). All 1,198 rows of the real provided sheet parse and normalize
cleanly with zero errors (see `tests/unit/normalizeRow.test.js` and the manual smoke test in this
README's development notes).

`tests/integration/modelRegistration.test.js` is a **regression test for a real bug** found during
manual end-to-end testing (not from the automated suite alone - see
[Design decisions](#design-decisions--trade-offs)): `GET /api/policies/search` populates
references to models (`PolicyCategory`, `Carrier`, `Agent`, `Account`) that `policyService.js`
never directly imports, and Mongoose only knows about a model once its file has been `require`d
somewhere. That bug was invisible to every other integration test because they each import those
model files directly to seed fixtures - this test deliberately avoids doing that, to actually
exercise the code path a fresh production process hits.

---

## Project structure

```
src/
  config/        env.js, logger.js, db.js
  models/        Agent, User, Account, PolicyCategory, Carrier, Policy,
                  UploadJob, ScheduledMessage, Message  (+ index.js barrel)
  routes/        uploadRoutes, policyRoutes, messageRoutes, index.js
  controllers/    thin HTTP-layer glue -> services
  services/       uploadService (spawns the worker), policyService (search/aggregate),
                  messageService (schedule/list)
  workers/        upload.worker.js - the worker_threads entry point (Task 1.1)
  monitor/        cpuMonitor.js (Task 2.1)
  scheduler/      messageScheduler.js (Task 2.2 delivery poller)
  middlewares/    asyncHandler, errorHandler, validate (Joi), upload (multer)
  utils/          parseDate, normalizeRow, fileParser (csv/xlsx), escapeRegex,
                  resolveSchedule, gracefulShutdown, apiResponse
  validators/     schemas.js (Joi request schemas)
  app.js          Express app factory (used by server.js AND tests)
  server.js       one worker process: HTTP server + CpuMonitor + MessageScheduler
  cluster.js      entry point: forks/re-forks server.js workers (Task 2.1 restart mechanism)
tests/
  unit/           pure-function tests, no DB
  integration/    supertest + mongodb-memory-server
  fixtures/       small sample CSV for upload tests
postman/          Postman collection
scripts/          mongo:dev helper (zero-install local MongoDB for manual testing)
docs/             the assessment's own attachments (JD PDF, sample sheet)
```

---

## Design decisions & trade-offs

- **Response envelope**: every endpoint returns `{ success, data }` or `{ success: false, error }`
  - consistent shape for the frontend/Postman tests to rely on.
- **Validation**: Joi schemas at the route boundary (`src/validators/schemas.js` +
  `middlewares/validate.js`) reject bad input (missing `username`, malformed `time`, etc.) with a
  `400` before it reaches a service.
- **Idempotent ingestion**: every write in the upload worker is an `updateOne(..., {upsert:true})`
  keyed on that collection's natural key, batched via `bulkWrite`. Re-running the same file (a
  retry, a re-upload, a partial-failure recovery) is always safe.
- **Security basics**: `helmet`, upload file-type/size limits (`multer` `fileFilter` +
  `limits.fileSize`), and regex-escaping user search input
  ([`escapeRegex.js`](src/utils/escapeRegex.js)) to prevent regex-injection/ReDoS via a crafted
  `username` query param (tested in `tests/unit/escapeRegex.test.js`).
- **`agentId` on `Policy`**: the task description's 6 collections don't explicitly say Agent
  relates to Policy, but the sheet puts an `agent` value on every single row, clearly meaning "the
  agent for this policy." Dropping that relationship to match the letter of the spec would throw
  away real, present-in-every-row information for no benefit - so `Policy.agentId` is included
  and called out here explicitly, rather than silently added or silently dropped.
- **Dependency versions**: `multer` was bumped from the commonly-referenced 1.x line to 2.x, and
  `csv-parse`/`uuid` were bumped to their latest majors, specifically to close `npm audit`-flagged
  vulnerabilities in those packages (multer 1.x has known CVEs). Two moderate advisories remain (production deps),
  transitively inside `exceljs`'s own `uuid` dependency - not something this project controls
  without vendoring/patching `exceljs` itself, and it's UUID generation only (no known exploit
  path relevant to how it's used here); flagged here rather than left silent.
- **Bugs found by actually running the app**, not just passing the test suite: this repo's test
  suite went from "all green" to catching two real bugs (a Mongoose model-registration gap on
  `populate()`, and a `worker_threads` + Jest env-var inheritance gotcha) only after manually
  running the server against a real MongoDB and hitting every endpoint by hand. Both are now
  fixed and covered by regression tests (`modelRegistration.test.js`; the worker URI is now passed
  explicitly via `workerData` instead of relying on env inheritance). Mentioning this
  deliberately: a green test suite alone doesn't prove an app works end-to-end, and I made sure to
  verify it actually does, not just that it looks like it should.

---

## Known limitations / what I'd add with more time

- **Auth/authorization** - none of these endpoints are protected. In a real product this would
  need at minimum an API key or JWT layer.
- **Rate limiting** - none yet; `express-rate-limit` would be a five-minute addition.
- **Caching** - `GET /api/policies/aggregate` recomputes the full aggregation on every call; for a
  larger dataset this is a natural Redis cache candidate (the JD lists Redis explicitly), keyed by
  the query params with a short TTL, invalidated on new uploads.
- **Queueing at real scale** - for a sheet with, say, 1M+ rows rather than ~1,200, I'd move
  ingestion from "one worker_thread per upload" to a proper job queue (BullMQ/Redis or
  SQS, which the JD also lists) with multiple concurrent workers, S3 for the uploaded file instead
  of local disk, and resumable/chunked processing.
- **Socket.io progress** - the JD lists Socket.io; the upload worker already emits progress
  messages back to the main thread (`postMessage`), which would be a natural fit to relay over a
  websocket to a live-updating UI instead of polling `GET /api/upload/:jobId`.
- **`day` as a weekday vs. a date** - both are supported (see Task 2.2 section) since the brief
  didn't specify; I'd confirm which was intended with the interviewer/team if given the chance,
  per the assessment email's own invitation to ask clarifying questions.
