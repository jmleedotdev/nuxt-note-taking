# Verification, sign-in, and current-session sign-out (#3)

Builds on [registration](registration.md), including its superseding 8–128
printable-ASCII/no-spaces password policy and local-only Mailtrap transport.
No new migration is needed: the existing Better Auth PostgreSQL session tables
and atomic `registration_limit` table support this slice unchanged.

## Application interface

- `POST /api/login`: JSON `{ email, password }`; HTTP 200
  `{ status: "signed-in" }`. Email is lowercased using the shared schema;
  passwords are never trimmed or normalized. No library user, token, or redirect
  is returned. Caller-supplied callback/return URLs are ignored; the UI goes to `/`.
- `GET /api/session`: authoritative database lookup. HTTP 200
  `{ user: { id, email }, expiresAt }`; no session secret or library record.
  HTTP 401 `{ error: { code: "UNAUTHENTICATED" } }` or HTTP 403
  `{ error: { code: "EMAIL_NOT_VERIFIED" } }` denies access.
- `POST /api/logout`: JSON body, HTTP 200 `{ status: "signed-out" }`.
  Better Auth deletes only the session selected by the incoming signed cookie,
  then expires its cookies. Because the pinned library suppresses deletion errors,
  the service performs an authoritative post-deletion session check with the original
  cookie before returning success or forwarding clearing headers. If revocation
  cannot be confirmed, logout returns sanitized 503 and keeps the cookie for retry.
  Logout without a valid session is harmless.
- Login errors: 401 `INVALID_CREDENTIALS` for both unknown email and incorrect
  password, 403 `EMAIL_NOT_VERIFIED` only after successful credential verification,
  422 `VALIDATION` with field messages, 429 `RATE_LIMITED` with numeric
  `retryAfter` and `Retry-After`. Unexpected authentication failures become
  sanitized 503 `AUTH_UNAVAILABLE`.
- Login uses the registration admission rules: exact configured Origin, JSON,
  no cross-site Fetch Metadata, bounded 4096-byte request, and schema validation.
  Logout also requires the exact Origin, JSON content type, and non-cross-site
  Fetch Metadata; it has no meaningful request payload. Missing Origin is denied.
- Authentication responses and the protected shell are `Cache-Control: no-store`.
  The underlying `/api/auth/*` handler remains unmounted, so library routes
  cannot bypass application policy.

## Verification and recovery

Forgotten-password recovery is implemented in [password recovery](password-recovery.md),
including latest-only reset authorization, all-session revocation, and login/reset
serialization. The flows below concern email-verification recovery.

One-hour verification links still redeem at `/api/registration/verify`. Success
always redirects to `/login?verified=1`, never creates a session, and ignores
caller-supplied redirect URLs. Redeeming a valid link for an already verified
account succeeds harmlessly. Invalid/expired links redirect to
`/check-email?invalid=1` without reflecting the token. Verification callbacks
send `no-store` and `Referrer-Policy: no-referrer`.

Login has no verification-email action. Correct unverified credentials lead to
Check your email without creating a session or implicitly sending another email.
Resend remains on that read-only screen, with its server-enforced 30-second cooldown.
Without ephemeral email context, invalid/expired-link and verification-required
screens instruct the user to enter their email and password on login to reach
resend recovery. Email/cooldown state is ephemeral; a reload without that context
offers login recovery as documented in registration. There is no Google sign-in
or password-reset UI in this slice.

## Session authority and SSR

Better Auth persists sessions in PostgreSQL with `expiresIn: 604800`, refresh
disabled, and cookie caching disabled. Cookies are HttpOnly, SameSite=Lax,
Path=/, and Secure with the `__Secure-` prefix when `APP_URL` uses HTTPS.
The guard also rejects sessions at or beyond `createdAt + seven days`, even if a
stored expiration has become longer. Ordinary use never rolls the lifetime.

`server/auth/session.ts` exports `requireVerifiedSession(event)` for
later notes, derived tags, preferences, and password-change operations. Call it
on **every protected server request**; client/page state is never authorization.
The guard checks both the authoritative session and the current user's verified
state, bypassing cookie caches and refresh. It returns only the application-owned
session shape and throws 401/403 errors with application error data; endpoints
should map those errors to their application HTTP response, as `/api/session` does.

`useAuthentication()` is the frontend request interface. Page middleware checks
`/api/session` on navigation, including SSR, and redirects anonymous visitors to
`/login` and unverified sessions to `/check-email?required=1`. That screen explains
that email verification is required, rather than claiming a link was invalid;
without ephemeral email context it links to login and explains credential-based
verification recovery. SSR requests use
request-scoped fetch rather than a global user/session cache; all outgoing
Set-Cookie values from session checks are appended to the browser response.
The server adapter likewise preserves every library Set-Cookie header on login,
session checks, and logout. Revoked/copied cookies cannot authorize subsequent
API or SSR requests, while another device's session survives ordinary logout.

The responsive `/` shell supports All Notes / Archived Notes navigation and logout.
Notes remain empty. Note creation, search, tags, and preferences are visibly
unavailable until their slices are implemented, not fake working controls.

## Shared abuse controls

Signup/resend retain their shared limits: 20/IP/hour, 5/email/hour,
1/email/30 seconds, and 500 globally/hour.
Login uses separate keys in the **same shared atomic PostgreSQL limiter**:
20/IP/hour, 5/email/15 minutes, 500 globally/hour, with no resend cooldown.
Only `APP_ENV=demo` omits the login per-email bucket for the public shared
accounts; IP/global budgets still count every attempt. See
[demo login protection](demo.md#implemented-shared-login-protection) for thresholds,
trade-offs, and the Vercel proxy-validation launch gate.
Separate login budgets allow immediate login after signup/verification without
resetting or weakening resend limits. All valid submissions, including successful
and denied attempts, count. The Retry-After value is the longest denied window.
Malformed fields are rejected before admission/hashing.

Keys use HMAC digests, stable lock order, transactional INSERT ON CONFLICT, and
PostgreSQL time. Limits apply across workers/instances sharing the database and
secret; they are not process-memory or library-HTTP limits. IP interpretation
and ingress requirements are unchanged from registration: ignore forwarded chains,
trust one overwriting X-Real-IP only from the configured actual TCP peer.

## Validation

- `pnpm test:http test/http/authentication.test.ts test/http/secure-session.test.ts`
  covers the real Nuxt/PostgreSQL lifecycle, verification expiry/reuse, generic
  credential errors, shared password rules, concurrent account admission, IP limits,
  resend cooldown sharing, hard lifetime, authoritative verified-state changes,
  logout isolation, copied-cookie rejection, SSR cookie clearing, HTTPS cookie
  attributes, fixed redirects, origin/CSRF checks, and unmounted library routes.
- The test-only `auth-state` fixture sets database time/state preconditions for
  expiration/revocation scenarios and installs a scoped PostgreSQL trigger to
  exercise actual session-deletion failure during logout. Assertions still go through public HTTP;
  no test clock or administrative handler is mounted in runtime configuration.
- `pnpm test:browser` exercises signup → recovery → verification → login → SSR
  shell → logout plus invalid-link recovery on desktop, tablet, and mobile.
  Screenshots are written to ignored Playwright output for visual inspection.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` remain the full validation gates.
  See registration docs for isolated PostgreSQL setup; no SQLite is substituted.

These checks do not select production hosting, ingress, or mail delivery.
The existing production provider/transport launch gates remain in force.
