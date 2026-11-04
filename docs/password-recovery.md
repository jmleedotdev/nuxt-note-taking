# Forgotten password recovery (#10)

Builds on [registration](registration.md) and [authentication](authentication.md).
The superseding **8–128 printable ASCII characters, excluding spaces** password
policy and **Mailtrap Local** transport decisions remain unchanged. Historical
Unicode/hosted-Sandbox requirements do not override those explicit decisions.

## Application-owned interface

- `POST /api/password/forgot`: JSON `{ email }`, lowercased by the shared email
  schema. Known and unknown addresses return HTTP 202
  `{ status: "check-email", resendAfter: 30 }`, with no cookies or account details.
  The UI displays generic check-email feedback, submitted email, a cooldown-bound
  resend button, an option to correct the address, and a login link. Email context
  is ephemeral; reload returns to an empty forgot form.
- `POST /api/password/reset`: JSON `{ token, newPassword, confirmation }`.
  Matching confirmation and the existing password policy are mandatory. HTTP 200
  `{ status: "password-reset" }` expires auth cookies and directs the UI to the
  fixed `/login?reset=1` route. No session is created. Invalid, expired, superseded,
  and used links return HTTP 400 `{ error: { code: "INVALID_RESET_LINK" } }`.
  The reset form offers a new-link route; malformed links show recovery immediately.
  Structurally valid but unusable links show the same recovery after submission.
- Both endpoints use exact configured Origin, JSON content type, Fetch Metadata,
  4096-byte body bound, and application-owned validation/error envelopes. Invalid
  fields return 422 `VALIDATION`; bad JSON returns 400 `INVALID_REQUEST`; oversized
  bodies return 413 `REQUEST_TOO_LARGE`; disallowed origin/content type returns
  403 `FORBIDDEN_ORIGIN`. Internal/database failures return sanitized 503
  `AUTH_UNAVAILABLE`, never success after a failed credential transaction.
- API responses and both recovery pages are `Cache-Control: no-store`. Recovery
  pages set no-referrer metadata. Secrets are never stored in browser localStorage.
  The token is used only in the received reset URL and the reset POST body; success
  replaces that history entry. Configure access-log query and tracing redaction
  before deployment: full reset URLs, tokens, passwords, and provider failures
  must not enter logs. Test mail stores sensitive synthetic links only locally.
- `/api/auth/*` remains unmounted, including underlying reset/change routes.
  Redirect/callback fields supplied by a caller cannot change the destination.

## Shared admission policy

Both operations explicitly invoke the existing atomic PostgreSQL limiter; server
API calls into Better Auth are not presumed to inherit a public HTTP limiter.
Each operation has its own purpose-prefixed budget in `registration_limit`:

| Budget | Forgot | Reset |
| --- | --- | --- |
| Global | 500/hour | 500/hour |
| IP | 20/hour | 20/hour |
| Account/email | 5/hour | 5/hour |
| Email cooldown | 1/30 seconds | none |

For reset, a recognized token maps to the account's email, so rotating a token
cannot evade its account budget. Unknown tokens use a token-derived keyed digest,
with the same IP/global caps. Validation precedes these counters and expensive
hashing. Denied attempts also increment budgets without extending fixed windows.
All counters are updated in one transaction with stable row-lock order. HTTP 429
includes `{ error: { code: "RATE_LIMITED" }, retryAfter }` and `Retry-After`.
The existing trusted single-proxy policy and HMAC identifier protection apply.
Client cooldowns are convenience only; server limits are authoritative.

## Authorization and atomic credential transition

`password_reset` holds exactly one row per user: a unique SHA-256 hash of a
cryptographically random 32-byte token and a PostgreSQL expiry thirty minutes
from issuance. Raw tokens/URLs are never persisted. An upsert replaces the old
hash immediately, including when subsequent mail submission fails.

Issuance, redemption, and application login take the same transaction-scoped
PostgreSQL advisory lock keyed by normalized email in the `credential:` namespace.
Hash collisions can only serialize unrelated users; they cannot authorize one.
Issuance locks even unknown emails and executes the same statement sequence,
keeping account lookup out of provider-dependent public latency. Known and unknown
requests both await the short database transaction. Transport latency/failure is
excluded from the response through lifecycle-tracked `event.waitUntil` submission.
This reduces obvious enumeration signals; it is not a claim of cryptographically
constant-time database/network behavior.

Redemption hashes the replacement password, acquires the credential lock, and
conditionally consumes the current hash using **`clock_timestamp()`**, not the
transaction-start `now()`. The authorization must still be current and strictly
unexpired after hashing and lock waits. Consumption, credential write, deletion
of every user session, and removal of reset authorization commit together.
Failures roll back all those changes, leaving the token usable for retry until
its original expiry. The exported `replaceCredential` transition is the shared
security write intended for settings password change; a caller must authorize it
and hold the same credential lock in its transaction.

Login holds the same lock across Better Auth's credential check and session
insertion. A login with the old password either completes before reset (and its
session is deleted), or checks the new credential afterward and fails. A genuinely
fresh login with the new password afterward is allowed. All credential-lock transactions (login, issuance, and redemption) use a separate
bounded PostgreSQL pool (maximum five connections): recovery lock waiters must not
exhaust the adapter pool needed to complete an active login. Include this extra
pool in deployment connection budgeting. No secondary session store, cookie cache,
or refresh path is enabled; copied cookies, other devices, HTTP guards, and SSR
all check the authoritative database. Already admitted in-flight reads are not
retroactively cancelled by reset.

## Pinned Better Auth evidence and the framework gap

Reviewed installed **Better Auth 1.7.15**:

- `dist/api/routes/password.mjs`: request creates an independent random
  `reset-password:<token>` verification row; it does not remove earlier tokens
  for the same user. Default expiry is one hour unless configured. Reset checks
  expiry before hashing and before its consumption transaction.
- `dist/utils/password.mjs`: `resetCredentialPassword` transactionally consumes
  one authorization, optionally deletes user sessions with
  `revokeSessionsOnPasswordReset`, and writes the password. This is real single-use
  support, **not newest-link-only authorization or login/reset serialization**.
- `dist/api/routes/sign-in.mjs`: credential verification and session creation
  have no shared application credential-transition lock.
- `dist/cookies/index.mjs`: supported `getCookies(auth.options)` supplies secure
  names and attributes for clearing session, session-data, account-data, and
  don't-remember cookies, including incoming chunk variants.

The small application-owned recovery module fills those specific gaps using the
existing hash/mail interfaces and real PostgreSQL. Better Auth still owns signup,
verification, login, signed cookies, and authoritative session lookup. No alternate
public library route or speculative auth framework is introduced.

## Mail lifecycle and retries

Issuance commits before responding. Only delivery runs through `event.waitUntil`;
provider delays/failures cannot trivially disclose account existence via public
status or latency. Errors log a fixed message only. Immediately before sending,
delivery checks that the authorization remains current and unexpired. A send
already in flight can arrive out of order; this cannot revive an obsolete token.

There are **zero automatic delivery retries** and no durable queue. A deliberate,
rate-limited **Send again** is a new authorization and invalidates the previous
link even if submission fails. If transport retries are added later, they must
reuse the same authorization without extending its expiry, check currentness,
and never revive superseded/consumed tokens. An ambiguous timeout may already
have been accepted; there is no exactly-once or inbox-delivery guarantee. Process
termination can lose a tracked submission. Keep the existing local inbox private.

## Validation and visual evidence

- HTTP/PostgreSQL tests follow captured real mail through reset and fresh login;
  cover public equivalence under slow/failed transport, fixed-window thresholds,
  real thirty-second cooldown expiry, thirty-minute authorization boundaries,
  ASCII/password/confirmation boundaries, supersession/reuse, concurrent
  issue/redeem, lock-wait expiry, rollback, transition-pool saturation without
  blocking authoritative session reads, rotated-token account budgets, copied
  cookies, other devices, SSR/no-store paths, CSRF, and blocked library routes.
  Test-only fixtures set clock/failure/lock preconditions; they are never mounted
  in ordinary application builds.
- Playwright follows captured recovery mail without internet on desktop, tablet,
  and mobile. It covers generic feedback, disabled resend, validation, cross-device
  revocation, fresh login, reused/invalid-link recovery, dark mode, and overflow.
  Screenshots go to ignored test output.
- `pnpm test:mail` remains a separate opt-in **Mailtrap Local** transport check,
  now including reset text/HTML and redemption, with synthetic recipients and
  targeted cleanup. There is no hosted credential/SDK adapter to test: hosted
  Sandbox and production sending were superseded/deferred, not silently selected.
  Routine tests do not contact Mailtrap or send real mail.
- Figma access to the supplied file was denied for this task. Recovery pages reuse
  the established Nuxt UI account panel, supplied icons/local fonts, and inline
  Tailwind. Exact recovery-frame visual parity is **not verified**.
