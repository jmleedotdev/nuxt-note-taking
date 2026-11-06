# Demo deployment runbook (#50)

## Publication status

**Not published or hosted-verified by this change.** No authorized Vercel or
Supabase account/CLI connection is available in the implementation environment.
A live URL must not be advertised until the gates below pass. Repository checks
are recorded in [deployment evidence](audits/50/README.md); they are not evidence
of hosted connectivity, environment scoping, cookies, cron delivery, or ingress IP trust.

## Ownership of the steps

- **Agent-executable:** repository changes, disposable local database migrations,
  HTTP/browser suites, static checks, and a Vercel-targeted build.
- **Human-only until authorized:** create/select the dedicated Supabase Free
  project and Vercel Hobby project, authorize GitHub access, choose the Production
  branch/domain, and enter private secrets into Production scope. Never paste
  database credentials or private secrets into an issue, README, terminal log, or chat.
- **Agent-executable after authorization and explicit target confirmation:**
  controlled migrations/provisioning, deployment, and the bounded hosted checks.
  These are not automatic startup or build hooks.

## Database/runtime contract

Retain Better Auth; Supabase is PostgreSQL hosting, not Supabase Auth. Use the
standard **Node.js Vercel/Nitro runtime**, not Edge (TCP PostgreSQL and
AsyncLocalStorage are required). Use Node 24 and the Nuxt framework preset.

For runtime, copy **Connect → Transaction pooler**, port **6543**, with its exact
host and `postgres.PROJECT_REF` username. `server/db/connection.ts` disables
prepared statements and query pipelining (`prepare: false`, `max_pipeline: 1`)
for Supavisor transaction mode. PostgreSQL transactions and transaction-scoped
advisory locks remain real; no HTTP database adapter or session-scoped locks are
used. The same settings cover the auth adapter, credential coordination, daily
lifecycle, and provisioning. They retain three **independent one-connection pools
per warm demo instance** to avoid lock-waiter starvation. Ordinary note/preference
clients are lazy and do not open extra connections in demo mode. Normal-mode
adapter/credential pool budgets remain unchanged. Connections idle out after
20 seconds; connection attempts time out after 10 seconds. This bounds each
instance, not Vercel's total instance count. Monitor Supabase connection usage
and function errors; free-tier limits can still deny service under load.

Remote application/provisioning connections require TLS with certificate
verification, even if a URL tries `sslmode=disable`. URLs containing a `host`
query override are rejected before connecting, so driver target selection cannot
bypass the authority-host TLS or test-safety checks. Never use
`rejectUnauthorized: false` to get a deployment working. Confirm the chosen
pooler certificate is trusted by Node; a trust failure is a launch blocker, not
permission to disable verification. Loopback disposable development databases
need no TLS. Verify actual hosted TLS/transactions before publication.

Use a **direct connection** for migrations, or **Session pooler on port 5432**
when the operator network is IPv4-only. Do not run Drizzle migrations through
the transaction pooler. Keep this operator URL out of Vercel. URL-encode the
password in either URL. Use the same dedicated project for both URLs.

## Controlled provisioning/deployment order

1. Human: create a dedicated empty Supabase Free project (never adopt a private
   app database), record its project ref, and copy the migration and runtime
   URLs from Connect. Disable the project's public Data API if it is not needed;
   these application-owned tables must not be exposed through Supabase's
   anonymous API. Do not publish Supabase API keys.
2. Human: import this repository into Vercel, select Nuxt, Node 24, and the
   intended Production branch. Authorize the integration. Do not publish yet.
3. Human: generate **different** private `APP_AUTH_SECRET` and `CRON_SECRET`
   values (`openssl rand -hex 32` each). Enter the variables from
   `.env.demo.example` for **Production only**, not All Environments, Preview,
   Development, or branch overrides. Set `APP_ENV=demo` and `APP_URL` to the
   final HTTPS origin without a trailing slash. No mail service is needed.
   Remove inherited/shared database credentials or secrets from other scopes.
   Do not use `NUXT_PUBLIC_*`. Runtime never needs demo-password variables.
4. Operator: inspect the exact project ref, host, database name, current schema,
   and migration history. Explicitly export the selected migration URL as
   `DATABASE_URL` in a private shell. `pnpm db:migrate` loads `.env`, but an
   exported URL takes precedence. Do not run if the target is uncertain.
   Apply committed migrations once with `pnpm db:migrate`; never `db:push`,
   schema generation on the host, or a startup migration hook.
5. Operator: in that private shell export `APP_ENV=demo`, `DEMO_PASSWORD_1`, and
   `DEMO_PASSWORD_2` from the README table. Run
   `pnpm demo:provision --confirm-database postgres` only after confirming the
   **host/project**, not merely the common database name `postgres`. Provisioning
   is transactional and create-only: retries preserve visitor data; identity or
   credential drift aborts rather than adopting unrelated users. Unset the
   operator secrets/password variables afterwards. Never commit a populated env file.
6. Operator: deploy Production. The first authorized scheduled invocation or
   ordinary login restores the current UTC baseline. This is an intentional
   initial reset of the two designated accounts, so complete it before visitors
   arrive. Verify the endpoint and baseline below, then advertise the actual
   Production URL in README only after every launch gate passes.
7. Verify a separate Preview has **no** live credentials/secrets in its scope
   and cannot read/reset the demo. `authConfig()` also refuses database-backed
   Vercel Preview/Development execution even if Production values were
   accidentally inherited. A broken database-dependent preview is intentional;
   working previews need a separately designed database configuration.

## Scheduling and safe recovery

`vercel.json` declares exactly one daily UTC job, `0 0 * * *`, targeting
`GET /api/cron/demo-reset`. Vercel supplies `Authorization: Bearer <CRON_SECRET>`.
Missing server secret or missing/incorrect bearer authorization returns 401,
including requests carrying a valid public demo session. The endpoint is
uncached, demo-only, and calls the same `ensureDemoDay()` as request-time
access. Failures return 503; it never accepts a date or a force-reset argument.
Concurrent/late same-day invocations preserve new notes and sessions.
There is no visitor reset button or manual force-reset API.

In Vercel Settings → Cron Jobs, verify the path/expression, enabled state,
Production deployment, and invocation logs. A midnight Hobby job can arrive
between **00:00 and 00:59 UTC** or be missed. Failed jobs are not automatically
retried. Request-time enforcement is authoritative: the first login/protected
request after midnight must finish the reset or deny access. Duplicate invocations
cannot replay a completed day. Secret rotation requires redeployment; verify the
next invocation after rotating. Never print the bearer token in logs.

If Supabase pauses, human: resume it in its dashboard, wait for readiness, and
check the connection configuration. If restoration fails, check connectivity,
TLS, migrations, and both designated identities, fix the cause, and retry
ordinary access (or one authorized invocation). The transaction rolls back both
accounts on failure. Do not delete the lifecycle row, alter its day, truncate
tables, replace credentials, or rerun provisioning to force a reset. Recovery
skips missed intermediate days. Code rollback must remain compatible with applied
migrations; do not roll back schema destructively to match old code.

## Hosted launch gates (record results, never assume)

Keep deployment protected/unadvertised until these are checked on the actual
Production domain. Use bounded manual checks on the two designated accounts,
with explicit permission to change their public data; not the destructive suite.

- Record deployment URL/ID, git commit, Supabase project ref (no secrets), UTC
  time, Node version, migration versions, and pooler mode/port.
- Confirm both ordinary credential logins, three distinct baseline notes each,
  and System/Inter preferences after the controlled initial reset. Inspect
  `Set-Cookie`: HTTPS secure session cookie, HttpOnly, SameSite=Lax, no sensitive
  response caching. Confirm a note ID from one account is inaccessible to the other.
- Create/edit/search/tag/archive/restore/delete a disposable smoke note and save
  preferences. Confirm ten total saved notes (samples and archives included)
  block creation with useful feedback; deletion frees a slot and editing works
  at capacity. Clean up only the smoke data you created; do not erase visitors' work.
- Check login/authenticated notice on mobile and desktop; shared-account privacy,
  no personal information, midnight reset/session expiration, and unsaved-work
  loss guidance. Confirm registration and all password-management entry points
  and direct APIs remain disabled. Never expose credentials in the notice.
- Request the cron path without authorization and with a public password: 401.
  Operator: invoke once with the private bearer token from a secret-safe client,
  then again the same UTC day after creating a smoke note. Verify notes and
  current sessions survive the duplicate. Check Vercel's next scheduled delivery
  and logs; a manual 200 alone is not scheduled-delivery evidence.
- Verify environment scopes in the dashboard and a Preview deployment; neither
  its normal APIs nor cron can touch the live database. Inspect client artifacts
  for accidental private configuration; never paste secret search results into evidence.
- **IP trust is a launch blocker:** the current adapter trusts only a configured
  TCP peer, not arbitrary forwarded claims. Leave `APP_TRUSTED_PROXY_IP` unset
  until actual ingress behavior is known. Using two real networks, establish
  the peer exposed by Nitro and whether Vercel overwrites `X-Real-IP`. Repeat
  requests with forged `X-Real-IP`, `X-Forwarded-For`, `Forwarded`, and
  `X-Vercel-Forwarded-For`. Document that forged claims cannot change the limiter
  identity, distinct real clients have separate budgets, and the per-IP/global
  ceilings work. Use temporary private instrumentation if needed, remove it
  before publishing, and do not store raw IPs. If the fixed-peer contract does
  not hold, implement/test a platform-specific adapter before launch. Do not
  guess a proxy IP or trust a header just because its name contains “Vercel”.

## Free-tier constraints and primary sources

Rechecked against official documentation for this implementation:

- [Vercel cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing): Hobby
  daily frequency and per-hour precision; no exact-minute or uptime guarantee.
- [Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs): private
  `CRON_SECRET` bearer authentication, logs, no automatic failed-job retries.
- [Supabase connectivity](https://supabase.com/docs/guides/database/connecting-to-postgres):
  transaction pooling for serverless, no prepared statements or pipelining in
  shared transaction mode; direct/session connections for operator work.
- [Vercel request headers](https://vercel.com/docs/headers/request-headers):
  platform header semantics are not a substitute for deployed ingress verification.
- [Supabase pricing](https://supabase.com/pricing): Free projects can pause after
  one week of inactivity. Cron traffic is **not** a promise against pausing.
  Free capacity/connection/function limits can make the demo temporarily unavailable.

Never run `pnpm test`, HTTP integration suites, or Playwright lifecycle/reset
suites against the public demo. The test runner rejects non-loopback database
hosts and creates random disposable databases with committed migrations. Use a
local tunnel only to a disposable test cluster, never to the public project.
