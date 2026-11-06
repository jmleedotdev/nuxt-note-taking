# #50 deployment evidence

## Scope and status

Implementation baseline: `80426f27198223449bd4ecce96a5d9eac7dd043f` on branch `demo`.
Verification environment: Node **24.22.2**, pnpm **12.14.0**, local disposable
PostgreSQL via Compose. This is **repository readiness evidence, not a published
deployment**. The live URL, Vercel deployment ID, and Supabase project ref are
unassigned/unverified. No account authorization or private hosted credentials
were available. #50 remains operationally blocked, not fully accepted.

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

## Unresolved hosted launch gates

All are **NOT PERFORMED**, not implied by local passes:

1. Human authorization/provisioning of Vercel Hobby and a dedicated Supabase
   Free project; private Production-only environment entry and branch selection.
2. Controlled migrations/provisioning against the confirmed dedicated project,
   followed by an explicitly authorized initial baseline restoration.
3. Actual Supavisor transaction-pooler connectivity, certificate-verified TLS,
   prepared-statement/pipelining compatibility, transaction rollback/locking,
   connection budget, and Node runtime smoke checks.
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
