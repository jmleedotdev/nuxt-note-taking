# #50 deployment evidence

## Scope and status

Implementation baseline: `80426f27198223449bd4ecce96a5d9eac7dd043f` on branch `demo`.
Verification environment: Node **24.22.2**, pnpm **12.14.0**, local disposable
PostgreSQL via Compose. This is **repository readiness evidence, not a published
deployment**. At implementation time, no account authorization or private hosted
credentials were available. Subsequent hosted database preparation is recorded
below. The Vercel application deployment remains unverified; #50 is not fully accepted.

## Checks performed

- Cron HTTP tracer test first failed with **404 instead of 401** before the
  endpoint was implemented, then passed after implementation.
- `pnpm test:http test/http/demo-cron.test.ts`: **2 passed**. Real disposable
  PostgreSQL, unauthorized bearer/public credentials, no unauthorized session
  revocation at midnight, authorized catch-up, repeated/concurrent late delivery,
  preservation of current sessions/notes, and request-time enforcement before cron.
- `pnpm test:http test/http/demo.test.ts`: **8 passed**, including absent server
  cron secret rejecting requests carrying an ordinary demo session.
- `pnpm test:http test/http/demo-lifecycle.test.ts`: **8 passed**, including
  rollback/failure recovery and login/write/reset races with one-connection pools.
  The test-only clock uses its own connection so deliberate auth query blocking
  does not block the simulated passage of time.
- `pnpm test:browser:demo --reporter=line`: **9 passed** across desktop, tablet,
  mobile. Disposable demo data only; no public deployment was contacted.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed repeatedly during implementation.
- `NITRO_PRESET=vercel VERCEL=1 VERCEL_ENV=production APP_ENV=demo ... pnpm build`:
  passed with disposable build-only auth settings. Produced the standard Node
  fallback function and cron route in `.vercel/output`. No deployment performed.
- Full routine suite: `pnpm test exec vitest run --maxWorkers=2`: **18 files,
  157 tests passed**, including normal-mode authentication/password-management
  and all demo HTTP checks. Worker count limits local parallel Nuxt builds;
  no tests were filtered out. An unrestricted run encountered a transient
  `EADDRINUSE` during test-server startup; the bounded-worker run passed.
- Initial full runs exposed a normal-mode pool regression, fixed by preserving
  its previous adapter/credential pool capacities (demo retains one each).
  `test/http/password-change.test.ts`: **9 passed** after the fix.
- A pre-existing host-vs-Docker-clock assumption in notes creation failed by
  2–7 ms. Its HTTP test now brackets creation with the authoritative PostgreSQL
  clock via the existing test-only fixture, retaining lower and upper bounds.
  `test/http/notes.test.ts`: **18 passed**, then the full suite passed.
- Safety probes: both application connection creation and destructive test
  runner reject a loopback URL containing `?host=remote.invalid&sslmode=disable`
  before opening a connection. This closes the driver's query-host override.
- Independent two-axis review: **Standards: no findings**; **Spec: two P1
  findings** (effective-host override bypass and normal-mode pool regression),
  both fixed. Follow-up Spec review found no remaining repository regressions.
  Both axes distinguish repository readiness from outstanding hosted launch gates.

The database runner refuses non-loopback targets before making a connection.
Never bypass this using a tunnel to the public demo database.

## Hosted database preparation — 2026-11-06

Target: Supabase project `mtvusemetkvxdaatcjcr`, database `postgres`, PostgreSQL
**17.11**. Operator selected Vercel project `jmlees-projects/nuxt-note-taking` and
intended origin `https://nuxt-note-taking.vercel.app`; neither the Vercel settings
nor application availability has been independently verified.

- The human completed the setup wizard and confirmed the target. Setup secrets
  remain in a private, Git-ignored local file; none are recorded here.
- Initial read-only probes failed with `SELF_SIGNED_CERT_IN_CHAIN`. The human
  downloaded the Supabase Root 2021 CA from the project dashboard. Retrying with
  `NODE_EXTRA_CA_CERTS` passed without disabling certificate verification.
- The initial pooler probe reported an unencrypted pooler-to-database leg. After
  the human enabled SSL enforcement, both direct and transaction-pooler probes
  reported **TLS 1.3** in `pg_stat_ssl`; the application client also requires
  certificate-verified TLS. Public and Drizzle schemas had no tables before migration.
- Following operator confirmation, `pnpm db:migrate` applied the five committed
  migrations through the direct port-5432 URL with `sslmode=verify-full` and the
  downloaded CA trusted. No startup/build migration hook was added.
- `pnpm demo:provision --confirm-database postgres` then succeeded through the
  direct connection with certificate verification and the public README passwords.
- Read-only verification at **2026-11-06T03:14:48.503Z** through the port-6543
  transaction pooler confirmed all five migration timestamps/hashes match committed
  files, exactly two preverified demo users, three notes each, and System/Inter
  preferences. Session and lifecycle tables were empty: the daily lifecycle has
  **not** yet run. No destructive automated test targeted this hosted database.
- These checks used the repository's existing connection settings (`prepare: false`,
  `max_pipeline: 1`) and real read-only transactions. Hosted rollback/concurrency,
  runtime connection budgets, and Vercel execution have not been verified.
- No credentialed deployment, login, cron invocation, or initial daily reset was
  performed in this stage. The downloaded CA is trusted only by these local
  operator processes; Vercel runtime trust still needs configuration.

## Unresolved hosted launch gates

The following remain **unverified or incomplete**, not implied by local passes:

1. Independently verify the human-reported Vercel Hobby setup, Production branch,
   Node version, and Production-only environment entry; Supabase project exists
   and has been reached directly as recorded above.
2. Controlled migration and create-only provisioning are complete. The explicitly
   authorized initial daily baseline restoration remains outstanding.
3. Vercel CA trust configuration, actual deployed Supavisor connectivity,
   transaction rollback/locking, connection budget, and Node runtime smoke checks.
4. Both hosted logins, secure/HttpOnly/SameSite cookies, account isolation,
   notes/preferences, capacity feedback, responsive notice, disabled credential
   management, and deployed client artifact secret audit.
5. Preview isolation and absence of Production database/reset secrets in
   Preview/Development/shared scopes.
6. Hosted cron authorization, enabled midnight UTC schedule, duplicate invocation
   preservation, and an actual scheduled delivery log.
7. Actual Vercel client-IP attribution and spoof resistance. The fixed-peer
   adapter may need a platform-specific replacement; do not publish until it is
   validated. Bounded shared-IP fallback is not per-visitor attribution evidence.

Follow [the runbook](../../demo-deployment.md) in order and append dated hosted
results (deployment/commit IDs, steps, observed outcomes, no secrets) here. Then
add the verified live URL to README. Do not close #50 or claim publication before
these gates are resolved.
