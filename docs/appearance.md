# Account appearance preferences

## Settings and saving

Open Settings from the desktop header or mobile/tablet bottom navigation.
Color Theme offers Light, Dark and System; Font Theme offers Inter, Noto Serif
and Source Code Pro. Both affect the whole application, including account pages.
System follows device appearance changes using Nuxt's color-mode integration.
All three fonts are supplied local variable font files; CSS fallback families
keep the application readable while loading or if fonts cannot be fetched.

Each section has **Apply Changes**, matching the supplied Figma control. Choosing
an option does not preview or save it. Apply sends the selected preferences to
the account; only a successful response changes the application and browser's
remembered appearance. Changing settings sections abandons unsubmitted choices.
A failed save keeps the selected options for retry and does not report success.
Loading errors show a retry action rather than editable unknown account values.

## Browser and account reconciliation

The `notes-appearance` cookie remembers only validated `{ theme, font }` values
for a year. It contains no account identity, auth secrets or note drafts.
Nuxt color mode also remembers its theme value in `nuxt-color-mode` localStorage.
Public pages use remembered appearance; an invalid appearance cookie is ignored.
The cookie allows the selected font to be used during server rendering too.

On entering an authenticated page, the account's preferences are authoritative.
Accounts without saved preferences receive System/Inter, even if the browser
previously used another account. While a new account cannot be loaded, use safe
defaults and show a failure, not another user's settings as a successful load.
Logout retains the browser's last successfully loaded/saved appearance for public
pages. In-flight results from a left/replaced account cannot overwrite a later
account's state. Saves also bind to the form's expected account: a different tab
switching the shared session cannot redirect an old form into the new account.
A mismatch keeps the choices visible, blocks further saves, and offers Reload
account. Reloading fetches account values again, including updates saved
on another device; live push synchronization is not provided.

## HTTP contract

Both endpoints require an authenticated, email-verified session and return
`Cache-Control: no-store`. Ownership comes from the session, never browser IDs.

- `GET /api/preferences` returns `{ theme, font }`. An account without a saved
  row receives `{ "theme": "system", "font": "inter" }`.
- `PUT /api/preferences` replaces the account's preferences and returns saved
  `{ theme, font }`. It requires same-origin JSON, following the existing
  application mutation policy. Writes require an `X-Expected-Account-ID` header
  matching the verified session's user ID (available from `/api/session`). This
  header is a precondition, not an owner selector. A missing/mismatched value
  returns `409 ACCOUNT_CHANGED` without writing. Reads may send the same header
  to reject an account switch between session lookup and preference loading.

Theme values: `light`, `dark`, `system`.
Font values: `inter`, `noto-serif`, `source-code-pro`.
Both fields are required on writes; unknown fields are rejected by shared Zod
validation, enforced authoritatively on the server.

Errors use the application `{ error: { code, fields? } }` envelope:
`401 UNAUTHENTICATED`, `403 EMAIL_NOT_VERIFIED`, `403 FORBIDDEN_ORIGIN`,
`409 ACCOUNT_CHANGED`, `422 VALIDATION`, or `503 PREFERENCES_UNAVAILABLE`.
Malformed/oversized requests
use the existing JSON reader's errors. No database internals are returned.

The PostgreSQL migration adds one row per user, with a cascading owner foreign
key and checks for supported theme/font values. Apply it with `pnpm db:migrate`
when updating a development database; tests apply migrations in disposable real
PostgreSQL databases, without modifying the development database.

## Design references and verification

Replacement supplied Figma file: `8VNP6vgCT8aUeegpPUXLmc`.
Inspected detailed contexts and screenshots:

- `2180:25560`: Desktop Settings Color Theme Light.
- `2180:26596`: Desktop Settings Font Options Light.
- `2180:26977`: Desktop Settings Font Theme Dark.
- `2236:10021`: Mobile Font Theme Light (frame is named Color Theme in Figma).

They establish the desktop settings menu, responsive detail/back pattern,
three icon/radio cards, light/dark colors and explicit Apply Changes action.
The server initially returned transient HTTP 503 errors, then reached its Starter
plan limit; separate tablet and dark color-theme contexts could not be retrieved.
Those layouts adapt the inspected patterns, not a claim of exact frame parity.
Change Password belongs to the separate account-lifecycle slice and is not added
here as a dead control.

Real HTTP/PostgreSQL tests exercise defaults, independent sessions, ownership,
strict validation, origin policy and authenticated/verified guards. Playwright
covers application-wide local fonts, System changes, explicit persistence,
separate device login, public-page memory, account switching, keyboard controls,
loading/validation/save failures, delayed responses after logout, shared-cookie
two-tab account switching, and mobile/tablet/desktop settings layouts.
