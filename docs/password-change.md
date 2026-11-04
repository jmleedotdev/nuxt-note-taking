# Settings password change (#11)

Builds on [authentication](authentication.md) and the atomic transition in
[password recovery](password-recovery.md). The superseding
[8–128 printable ASCII/no-spaces policy](registration.md#exact-password-semantics)
is shared unchanged by signup, login, reset, and change. The historical
Unicode/passphrase requirement in #1/#11 is not the current password contract.
No trimming, truncation, normalization, or composition rules are added.

## Application-owned HTTP contract

`POST /api/password/change` accepts JSON
`{ currentPassword, newPassword, confirmation }`. It requires an authoritative,
verified session and the existing exact Origin, JSON content type, Fetch Metadata,
and 4096-byte body protections. Success returns HTTP 200
`{ status: "password-changed" }`, expires all current auth cookie names/chunks
using Better Auth's configured secure attributes, and creates no session.
All responses are `Cache-Control: no-store`.

Failures retain the application error envelope `{ error: { code } }`:

- 400 `INVALID_CURRENT_PASSWORD`: the current credential does not match, or the
  account has no credential password. This route never sets up a provider-only
  account's password or links providers.
- 401 `UNAUTHENTICATED`; 403 `EMAIL_NOT_VERIFIED` or `FORBIDDEN_ORIGIN`.
- 422 `VALIDATION`, with actionable `error.fields`, for password policy or
  confirmation failures. Invalid JSON is 400 `INVALID_REQUEST`; oversized bodies
  are 413 `REQUEST_TOO_LARGE`.
- 429 `RATE_LIMITED`, with `retryAfter` and `Retry-After`.
- 503 `AUTH_UNAVAILABLE` for sanitized database/auth failures. A failed credential
  transaction cannot claim success or release success cookie-clearing headers.

Validation precedes hashing and limiter consumption. Shared atomic PostgreSQL
admission uses purpose `change`: 500/hour globally, 20/hour per trusted client IP,
and 5/hour per authenticated account email. There is no resend cooldown. Budgets,
HMAC identifier protection, fixed windows, and single overwriting trusted proxy
semantics reuse the existing limiter. Changing browser cookies or the submitted
body cannot select another limiter subject. All `/api/auth/*` routes remain
unmounted, including Better Auth's change-password and set-password endpoints.

## Authorization, transaction, and races

No migration is needed: the existing user, credential, session, reset, and limiter
tables already support this transition.

1. The HTTP handler requires verified authentication and validates input.
2. The operation acquires the same `credential:<normalized email>` PostgreSQL
   advisory transaction lock as login, reset issuance, and reset redemption, using
   the existing separate bounded credential pool.
3. After any lock wait it resolves the signed cookie again without cookie caching
   or refresh, then checks the authoritative session row, user verification,
   absolute expiry, and hard seven-day lifetime against `clock_timestamp()`.
   A queued request cannot reuse authorization revoked by a preceding transition.
4. It verifies the current password against the credential read under that lock.
   Only then does it hash the replacement and call the shared `replaceCredential`
   write in the same transaction. The credential update, deletion of **all** user
   sessions, and deletion of outstanding reset authorization commit or roll back
   together. Validation and credential failures change none of those records.
5. Only a committed success clears the current cookies. Login with an old password
   either completes before the change (its session is then deleted) or waits and
   fails against the replacement credential. Fresh login with the new password
   after the transition is allowed. Already admitted in-flight reads are not
   retroactively cancelled.

The session/SSR guards continue to query authoritative sessions with no cookie
cache, so copied cookies, other devices, and subsequent protected requests fail.
There is no client change-then-logout sequence and no Better Auth replacement
session. Passwords and internal failures are never logged or echoed. Deployment
access-log and tracing redaction requirements from password recovery still apply.

## Settings journey and evidence

`/?panel=settings&setting=password` lives inside the existing protected settings
shell. Nuxt UI fields have labels, current/new-password autocomplete, reveal
buttons, keyboard submission, matching-confirmation feedback, and a clear warning
that all devices will need fresh login. Failures retain form-level feedback and
entered values for correction/retry. Success clears credentials, local auth state,
and cached Nuxt data, then replaces navigation with `/login?changed=1`, where a
success message requests fresh login. Passwords are component-local, never
persisted in localStorage, cookies, URLs, or application session state.

HTTP tests use isolated, migrated PostgreSQL and real application requests. They
cover accepted/rejected password boundaries, verification, CSRF/body protections,
blocked library routes, rollback including reset-authorization preservation,
outstanding reset invalidation, all-session/no-replacement behavior, copied-cookie
HTTP/SSR rejection, login races in both lock orderings, concurrent changes,
logout/verification/expiry during lock waits, and account/IP abuse limits.
Playwright covers the settings-to-fresh-login journey on desktop, tablet, and
375px mobile, with validation, incorrect current credentials, recoverable server
failure, reveal/autocomplete controls, keyboard submission, cross-device/copied
cookie rejection, light/dark screenshots, and overflow checks.

## Password-settings visual follow-up

Figma access was initially denied but later restored. The following frames in
file `GDJWyTOiuLIfNUQBSueHnL` were inspected through one screenshot call each:

- [Desktop light, 1440 × 900](https://www.figma.com/design/GDJWyTOiuLIfNUQBSueHnL/note-taking-web-app?node-id=2180-27348).
- [Mobile light, 375 × 812](https://www.figma.com/design/GDJWyTOiuLIfNUQBSueHnL/note-taking-web-app?node-id=2236-10589).
- [Tablet light, 768 × 1024](https://www.figma.com/design/GDJWyTOiuLIfNUQBSueHnL/note-taking-web-app?node-id=2236-10396).
- [Desktop dark, 1440 × 900](https://www.figma.com/design/GDJWyTOiuLIfNUQBSueHnL/note-taking-web-app?node-id=2180-27934).

The form uses the reference's “Old Password” label, 44px inputs, below-field info
icon/“At least 8 characters” help, right-aligned save action, and dark input
colors. It fills the available mobile/tablet content width (343px/704px at the
reference sizes) and is 528px wide on desktop. The selected password-section lock
uses the supplied icon with blue emphasis in dark mode. Nuxt UI's help slot keeps
the hint associated with the new-password input for assistive technology; shared
validation still enforces the full unchanged 8–128 printable ASCII/no-spaces
policy.

The all-device fresh-login warning is intentionally retained between the fields
and save action, moving the button lower than the reference. Existing shared
shell logout controls, navigation, account details, and actual user tags remain
unchanged; this is a password-form alignment, not a pixel-identical replacement
of the whole application shell. Playwright checks rendered widths/input height,
accessible help and reveal labels, light/dark empty-state screenshots, and the
existing real password-change journey at all three reference viewport sizes.
Screenshots are inspected locally and saved only to ignored test output. No
additional Figma calls are needed for this follow-up.
