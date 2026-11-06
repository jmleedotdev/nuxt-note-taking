# Portfolio demo specification

Status: account provisioning, restrictions, capacity, request-time lifecycle, and authenticated scheduled invocation implemented. Hosted deployment and actual ingress validation remain blocked on account authorization; see the [deployment runbook](demo-deployment.md) and [evidence](audits/50/README.md).

## Purpose and hosting

Expose Nuxt Notes as a public portfolio demo using Vercel Hobby and a dedicated Supabase Free project. Supabase supplies PostgreSQL only; retain Better Auth and application-owned Nuxt APIs.

Use `APP_ENV=demo` to select demo behavior. Normal local development retains registration and password management. Vercel's Production environment will use `APP_ENV=demo`; these are distinct settings.

Scope database credentials and reset secrets to Vercel Production. Preview deployments receive no database access until a separate preview database is explicitly provisioned. Database credentials must remain server-side.

## Accounts and access

- Permit exactly two permanent, preverified demo accounts.
- Publish their stable email/password pairs in `README.md` only; retain the normal login form without demo-entry buttons.
- Public demo passwords must be unique to this deployment and never reused elsewhere.
- Preserve account-level ownership: neither account can access the other's notes or tags.
- Visitors using the same account share its mutable data; this is not visitor-level privacy.
- Block registration, email verification/resend flows, password recovery, password reset, and password changes at server boundaries, and remove their demo UI entry points.
- No email service is required for demo access. Runtime configuration must explicitly support this rather than depend on local mail infrastructure.
- Adapt login abuse protection for shared public credentials. Retain visitor/IP-based controls and an overall safety ceiling; successful logins must not unnecessarily exhaust a tight shared-account allowance.

## Implemented shared-login protection

Only `APP_ENV=demo` adapts login admission: there is no per-email bucket for
`POST /api/login`. Each valid submission, successful or failed, consumes
**20 attempts per client IP per hour** and **500 attempts globally per hour**
across both accounts and unknown addresses. These conservative portfolio-demo
thresholds permit different visitors to reuse the published accounts without
hitting the normal five-per-email allowance, while bounding authentication work.
The global ceiling can temporarily deny everyone under sustained abuse; it is
an intentional safety trade-off, not an availability guarantee. IPs are not
per-person identity: visitors behind a shared NAT share its allowance.

The existing PostgreSQL limiter atomically commits every attempt, including
throttled attempts, across application instances. Windows start with the first
attempt and use database time; denied traffic does not extend a window. All
instances must share the database and private `APP_AUTH_SECRET`. No migration
or process-local counter is introduced. Non-demo login retains its five attempts
per email per 15 minutes, 20 per IP per hour, and 500 globally per hour; other
authentication limits and credential/session safeguards are unchanged.

Throttling returns HTTP 429, application error `RATE_LIMITED`, and a numeric
`retryAfter` matching the `Retry-After` header (seconds until the longest denied
window expires). No session cookie is issued. The ordinary login form already
tells visitors to wait and try again; there is no demo authentication shortcut.

### Proxy trust and Vercel deployment gate

On Vercel Production, server-owned `VERCEL=1` and `VERCEL_ENV=production` select
a platform adapter that accepts only a single valid IP literal from
`X-Vercel-Forwarded-For`. Vercel documents that its ingress overwrites this value;
the deployed #50 probe confirmed forged values and chains were overwritten.
Missing, invalid, or chained values use one bounded `unknown` bucket, not an
alternative forwarding header. `X-Real-IP`, `X-Forwarded-For`, and `Forwarded`
do not select a limiter identity on this platform. Do not spoof these platform
variables on an ordinary public server: header trust depends on Vercel's edge.

Outside Vercel Production, client identity remains the actual TCP peer, or
`unknown` when absent. Only an exact `APP_TRUSTED_PROXY_IP` peer match permits
a single `X-Real-IP` literal. Vercel-named headers and forwarded chains remain
untrusted there. Leave `APP_TRUSTED_PROXY_IP` unset on Vercel; its observed
loopback peer cannot identify visitors. Never guess a proxy address.

Before public launch, verify different real networks obtain separate budgets,
forged headers cannot change the actual limiter bucket, and missing platform
identity never enables header trust. See [dated deployment evidence](audits/50/README.md)
for verified ingress behavior, spoof resistance, and the completed computer/cellular
network-separation check.

`test/http/demo-login-limits.test.ts` exercises ordinary successful shared-account
sessions, concurrent cross-account IP admission, expiry/recovery, budgets
surviving Nitro process replacement, the global ceiling across changing IPs,
and spoofed forwarding claims from an untrusted peer against real PostgreSQL.
`test/http/vercel-login-limits.test.ts` adds runtime-adapter HTTP checks for
separate platform client budgets, per-client enforcement, malformed-header
fallback, and non-platform spoof rejection. These local tests simulate the
already-overwritten header; actual edge overwrite is a separate deployment check.
Non-demo authentication tests retain and check the successful-login email cap.

## Notes and baseline

Each account starts with three sample notes, with a different sample set for each account, and default appearance preferences.

Each account may retain at most **10 saved notes**, counting sample notes, active notes, and archived notes together. Deletion releases capacity; archiving does not. Editing an existing note remains allowed when full. Enforce capacity server-side safely under concurrent requests.

Visitors may create, edit, archive, restore, and permanently delete any of their account's notes, including samples. Retain existing destructive-action confirmations. An account can remain empty or full until the next reset.

Keep existing note-input and request-size limits; the capacity limit is additional protection, not a replacement.

## Daily demo reset

The reset boundary is **00:00 UTC daily**, not 24 hours after an individual login. A change made just before midnight may survive only briefly; visitors are not promised a full 24-hour session.

At each boundary:

- Restore each account's three sample notes and their tags.
- Remove visitor-created notes and all other visitor note/tag changes.
- Restore default appearance preferences.
- Invalidate existing demo sessions, including sessions created shortly before midnight.
- Keep account identities and published credentials unchanged.

Use an authenticated daily scheduled reset plus an authoritative server-side boundary check. Before permitting demo access after the boundary, ensure the reset is complete. If reset cannot complete safely, temporarily deny demo access rather than serve the previous day's state.

The reset must be atomic, safe to retry, and coordinated with concurrent login and protected requests across instances. A late scheduled invocation must not reset an already-reset day again. An old session must not write into the new day's state.

An expired session is rejected on its next server request and the visitor returns to login. Unsaved work may be lost; do not promise that an idle browser clears immediately at midnight.

## Implemented lifecycle coordination

`server/demo/lifecycle.ts` supplies `ensureDemoDay()` for request-time enforcement and the authenticated `GET /api/cron/demo-reset` scheduler. It requires `APP_ENV=demo`, validates both fixed, verified identities, and changes only their notes, preferences, and sessions. Baseline content is shared with create-only provisioning. Credentials and account rows are never replaced.

The committed `demo_lifecycle` migration records the last completed ISO UTC day. PostgreSQL's `clock_timestamp()` is the authority; application-instance clocks and login times do not select the reset period. One transaction-scoped advisory lock serializes provisioning, restoration, login, session authorization, and complete protected note/preference operations across instances. This deliberately favors simple correctness over parallel throughput for the two shared demo accounts. Keep any future protected operations inside `withDemoAccess()` as well.

Restoration commits before application services can read the baseline. Access then reacquires the lock and rechecks the day before authorizing: if midnight intervened, it retries restoration first. The lock remains held until the entire operation finishes. Request-local transaction context makes all demo note/preference reads and writes use the same transaction that holds the lock; services reject uncoordinated demo access. Losing that connection therefore aborts its mutations as well as releasing its lock, rather than leaving a stale write running on a separate connection. Operations spanning midnight roll back demo data writes and return temporary unavailability; login cookies are not forwarded in that case. The next request restores the current day and revokes the prior sessions.

The lifecycle pool also executes demo data work inside its lock-holding transaction. The auth adapter retains a separate pool so lifecycle waiters cannot starve the lock holder's authentication work of database connections. Only transaction-scoped locks are used, not connection/session-scoped locks. Hosted transaction-pooler compatibility, connection budgets, TLS, and runtime behavior still require deployment validation.

If a reset transaction fails, both accounts and the completed-day record roll back. Login and protected APIs deny access temporarily. Resolve the database/configuration/identity failure and retry; no destructive replay of missed intermediate days is needed. Do not delete the completed-day record to force a reset. No public manual-reset endpoint is provided.

Tests replace only the clock module through test configuration and mount a disposable lifecycle-control route. PostgreSQL triggers/gates reproduce rollback and in-flight SQL races, including termination of a lock-holding backend while a mutation is paused. These fixtures are not registered by runtime configuration. The browser test leaves a dirty editor idle across the simulated boundary, then verifies that its next save returns to login without saving the draft.

## Demo notice

Display a full-width demo notice bar above the existing application header on desktop and mobile, on the demo login page and authenticated screens. This is the agreed meaning of "superbar" in the discussion, not an existing component name.

Suggested text:

> Shared demo · Don't enter personal information · Resets daily at 00:00 UTC

Do not display demo credentials in the notice or add account-entry buttons.

## Platform limitations

Official documentation checked during design:

- [Vercel Hobby cron scheduling](https://vercel.com/docs/cron-jobs/usage-and-pricing): daily jobs have hourly scheduling precision; a midnight job may run between 00:00 and 00:59 UTC. The request-time guard, not cron punctuality, enforces the boundary.
- [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs): configure a private `CRON_SECRET` and verify its bearer authorization header server-side. Reject requests when the secret is absent or invalid.
- [Supabase Free limitations](https://supabase.com/pricing): free projects can pause after one week of inactivity. Do not promise that scheduled traffic prevents pausing or that the free demo is always available.

## Implementation and validation considerations

Remaining deployment follow-ups and validation responsibilities:

- Validate Vercel/Supabase connection pooling, transaction behavior, TLS, trusted client-IP handling, and runtime compatibility.
- Apply committed database migrations through a controlled operator step, not every runtime startup.
- Test server-side restrictions through direct API requests, account isolation, concurrent quota enforcement, duplicate resets, missed scheduled runs, and reset/login/write races.
- Test the notice on desktop/mobile and expired-session handling with unsaved edits.
- Document deployment, provisioning, reset recovery, public credentials, and free-tier limitations before publishing the demo.

Scheduler authentication and one midnight UTC Vercel schedule are implemented. Hosted provisioning, environment scoping, deployment smoke checks, and actual client-IP validation require the explicit operator steps in the [deployment runbook](demo-deployment.md).
