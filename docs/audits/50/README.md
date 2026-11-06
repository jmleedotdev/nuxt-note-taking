# #50 deployment evidence

## Scope and status

Implementation baseline: `80426f27198223449bd4ecce96a5d9eac7dd043f` on branch `demo`.
Verification environment: Node **24.22.2**, pnpm **12.14.0**, local disposable
PostgreSQL via Compose. The original checks below establish repository readiness;
subsequent dated sections record actual Supabase preparation and hosted Vercel
HTTP/browser checks. **Deployed but not launch-ready or advertised**: client-IP
attribution is verified; remaining platform launch gates are incomplete. Production now
uses **`main`**, which contains the original `demo` implementation. #50 is not
fully accepted.

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

## Server-only CA configuration — 2026-11-06

- Added optional `APP_DATABASE_CA_CERT` PEM support to the shared remote database
  connection factory. Default trust is unchanged when absent; configured CA trust
  remains certificate/hostname-verified. Loopback connections are unchanged.
- Used the approved deployment smoke seam, not a destructive integration suite:
  six one-off read-only checks across direct and transaction-pooler URLs, with
  `NODE_EXTRA_CA_CERTS` unset. Before implementation, both supplied-CA cases failed
  with `SELF_SIGNED_CERT_IN_CHAIN`. After implementation, at
  **2026-11-06T03:17:07.792Z**, both supplied-CA cases passed and all four
  missing/unrelated-CA cases were rejected. Successful queries also confirmed
  SSL on the database backend leg. No account/session/note/lifecycle writes occurred.
- `pnpm test:http test/http/demo-cron.test.ts`: **2 passed** against disposable
  local data. The first attempt found local PostgreSQL stopped (`ECONNREFUSED`);
  starting the Compose PostgreSQL service resolved this environmental issue.
- `pnpm lint`, `pnpm typecheck` (repeated), and `git diff --check`: passed.
- `pnpm test exec vitest run --maxWorkers=2`: **18 files, 157 tests passed**,
  using a randomly created disposable local database; no hosted secrets were
  exported into the suite's environment.
- Updated the environment example and runbook with multiline PEM entry,
  Production-only scope, CA rotation/redeployment, and separate Drizzle CLI trust.
  Vercel CA entry, credentialed deployment, and initial reset are still outstanding.
- Independent review of the CA increment (`9ceeafb…d51b7d5`): **Standards: no
  findings** (reviewer excluded the public environment-template hunk); **Spec: no
  findings**, including confirmation of the driver's hostname verification and
  explicit SSL-option precedence. The Spec reviewer covered the public template.
  Both reviews accept only this increment, not completion of the hosted launch gates.

## Hosted application smoke checks — 2026-11-06

- The operator approved deployment, initial daily restoration, and bounded smoke
  mutations, then selected **`main`** as Production. The reviewed implementation
  was already merged at `d8f35e0`; no merge or push was needed. GitHub's Vercel
  commit status reports success. Its latest reported deployment is
  `G81ADmQv2m6oL6QDqeXUwPvU9sdR` in `jmlees-projects/nuxt-note-taking` (an earlier
  successful status referenced `JAGfYB4X2vt5dvLoSv5A8NiFUg1U`). Checks targeted
  `https://nuxt-note-taking.vercel.app`, not a local server.
- Vercel CLI inspection is unavailable: `pnpm dlx vercel whoami` was blocked by
  the package manager's high-risk trust-downgrade warning for `vercel@65.11.0`.
  That guard was not bypassed. Dashboard-only settings are not independently verified.
- At **03:31 UTC**, the hosted cron endpoint rejected missing bearer authorization
  and the public password with 401/no-store. The authorized initial invocation
  returned 200. Both account logins succeeded with Secure, HttpOnly, SameSite=Lax
  session cookies and no-store login responses. Each account had three baseline
  notes and System/Inter preferences. Cross-account note reads returned 404 in
  both directions; all six restricted credential-management APIs returned
  403/DEMO_RESTRICTED. Duplicate authorized cron preserved current sessions and notes.
- Bounded browser checks passed ordinary logins, disabled registration/recovery
  links and direct-page redirects, and disabled password settings. The notice was
  full-width above the authenticated header at **1440, 768, and 390 px**, with no
  horizontal overflow and all shared/privacy/reset/unsaved-work guidance visible.
- Preferences saved and remained isolated between accounts; original preferences
  were restored. Temporary-note create/edit/search/tag/archive/restore passed;
  another authorized same-day cron preserved the new note and current session.
- At **10:05 UTC**, the mobile capacity journey passed: three samples plus seven
  temporary notes reached ten; archiving did not free capacity; editing still
  worked. The visible warning preserved the unsaved draft. Deleting one temporary
  note through its confirmation freed a slot, and saving the draft then succeeded.
- Early smoke-script attempts stopped on harness assumptions, not established app
  defects: the login page has no application header, preference PUT requires the
  expected-account precondition, and fresh SSR controls must hydrate before clicks.
  The final focused capacity probe waited for Vue mount and passed. An interrupted
  run was checked for leftovers before continuing. The repository's destructive
  HTTP/browser suites were never pointed at the hosted database.
- Screenshots are private local artifacts under `.vercel/hosted-evidence/`, not
  committed. Cleanup deleted only IDs created by these smoke runs, guarded by
  their operator title prefix and current note version. Read-only verification at
  **2026-11-06T10:05:36.000Z** confirmed three notes each, no operator smoke notes,
  System/Inter preferences, and completed lifecycle day `2026-11-06`.
- **Client-IP blocker confirmed:** the latest hosted browser logins match the
  HMAC limiter identity for loopback peer `127.0.0.1`, not a visitor address. No raw
  visitor addresses or limiter hashes were recorded. This is the proxy peer seen
  by the current adapter, so the shared fallback does not establish independent
  visitor budgets. Do not advertise until a platform-specific attribution path
  is validated against forged headers and two actual client networks.

## Vercel ingress investigation and adapter — 2026-11-06

- With explicit operator permission, temporarily deployed the private
  `GET /api/operations/ip-probe` route in `4517d12`, deployment
  `9vZ3L3GWa16iWfVo761Mww3GAXcE`. It required the private cron bearer secret,
  demo mode, and a per-run nonce; it returned only keyed address fingerprints
  and platform metadata, with no-store responses and no database operations.
  Public credentials returned 401. Its disposable HTTP test first failed on the
  absent route (404 instead of 401), then passed after implementation.
- At **2026-11-06T10:13:52.904Z**, actual runtime metadata confirmed
  **Node v24.22.2**, `VERCEL=1`, `VERCEL_ENV=production`, and the exact deployed
  commit. Seven requests tested baseline/repeat and forged `X-Real-IP`,
  `X-Forwarded-For`, `X-Vercel-Forwarded-For`, `Forwarded`, and combined chains.
  The three IP headers remained valid, stable, different from the proxy peer,
  and never equal to the injected claims. Only boolean comparisons were retained
  in the local summary; no raw visitor addresses or fingerprints were recorded.
- Rechecked [Vercel's primary header documentation](https://vercel.com/docs/headers/request-headers):
  the edge overwrites forwarded client IPs to prevent spoofing;
  `X-Vercel-Forwarded-For` is the platform-specific form. The deployed probe
  verified that behavior rather than relying on the header name alone.
- Added a Production-only platform adapter in `authClientIP`: only server-owned
  `VERCEL=1` plus `VERCEL_ENV=production` enables the single validated
  `X-Vercel-Forwarded-For` value. Other forwarding claims are ignored there.
  Malformed/missing/chained values share `unknown`; non-platform TCP-peer trust
  is unchanged. No new dependency or configurable arbitrary-header trust was added.
- `test/http/vercel-login-limits.test.ts` first reproduced the bug: the 21st
  distinct simulated platform visitor received 429 instead of 200. With the
  adapter, all four HTTP tests pass: independent platform clients, retained
  per-client ceiling, bounded malformed-header fallback, and non-platform spoof
  rejection. Local tests explicitly simulate the already-overwritten header;
  they are not evidence of actual edge normalization.
- `pnpm lint`, repeated `pnpm typecheck`, and full disposable local suite
  `pnpm test exec vitest run --maxWorkers=2`: **19 files, 161 tests passed**.
- The temporary route and its temporary test were removed in adapter commit
  `c17d060`, then pushed to `main` after independent review. The first review
  attempt failed on the reviewer provider's usage limit; the operator requested
  a retry. The retry completed: **Standards: no findings; Spec/security: no code
  findings**. Both distinguish accepted source from outstanding hosted gates.
- Vercel reports successful deployment `HdAuE4NxuguJgEUjYbS71zdY7jdN` for
  `c17d060`. At **2026-11-06T10:37:31.261Z**, the former probe returned **404**
  even with its previous private authorization. Six bounded actual login requests
  across both accounts succeeded; each incremented exactly the same non-fallback
  IP budget by one despite forged individual headers and combined chains.
  Read-only database comparisons established that the actual limiter identity
  was neither loopback nor `unknown`; no IPs, cookies, fingerprints, or bucket keys
  were recorded. Each smoke session was logged out through the ordinary API.
  Active non-fallback buckets increased from zero to one. The two-network
  follow-up below completes the client-separation check.
- Diagnostic code is absent from the deployed Production version. Historical
  immutable diagnostic deployments may remain accessible through their old URLs
  with the private secret; keep them protected/delete them through Vercel as part
  of operator cleanup. No public demo credential authorizes their probe.

## Two-real-network validation — 2026-11-06

- The operator confirmed ordinary logins from the computer network and from a
  phone with Wi-Fi disabled using cellular data, following the explicit checklist.
- Read-only verification at **2026-11-06T10:43:56.684Z** found **two independent
  non-fallback IP buckets**: the original bucket advanced from six to eight
  attempts, while a new bucket appeared with three attempts and a later expiry.
  The historical loopback bucket was unchanged at two attempts. The ordinary
  global ceiling remains shared; per-client buckets are no longer the proxy peer.
- Combined with the earlier forged-header checks and disposable enforcement
  tests, this passes the actual deployed client-IP attribution/separation gate.
  No raw addresses, cookies, fingerprints, or bucket keys were recorded. These
  bounded checks did not intentionally exhaust the public IP/global allowances.
- GitHub also reports successful documentation deployment `2UmPdAACnDf2vySCEzH9JcKzA2VH`
  for `2a9bbb8`, which contains the reviewed adapter without diagnostic code.

## Unresolved hosted launch gates

The following remain **unverified or incomplete**, not implied by successful smoke checks:

1. Independently verify Vercel Hobby plan, Production branch tracking,
   Production-only variables, and Supabase public Data API exposure. Node 24
   and Production runtime identity were verified by the private ingress probe.
2. Verify Preview isolation and absence of live database/reset secrets in
   Preview/Development/shared scopes; inspect deployed client artifacts for secrets.
3. Verify hosted transaction rollback/concurrency and connection budget without
   running the destructive integration suite against shared demo data.
4. Verify enabled midnight UTC cron settings and an actual scheduled-delivery log.
   Manual authorization and same-day idempotence are verified, not scheduled delivery.
5. Protect/delete historical diagnostic deployment URLs during operator cleanup.
   Client-IP attribution, spoof resistance, and two-real-network separation are
   verified; diagnostic code is absent from current Production.

Follow [the runbook](../../demo-deployment.md) in order and append dated hosted
results (deployment/commit IDs, steps, observed outcomes, no secrets) here. Then
add the verified live URL to README. Do not close #50 or claim publication before
these gates are resolved.
