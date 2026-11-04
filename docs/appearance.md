# Account appearance preferences

Issue #9 backend slice. Settings UI and browser reconciliation are not implemented yet.

## HTTP contract

Both endpoints require an authenticated, email-verified session and return
`Cache-Control: no-store`. The server derives ownership from that session;
clients cannot select a user ID.

- `GET /api/preferences` returns `{ theme, font }`. An account without a saved
  row receives `{ "theme": "system", "font": "inter" }`.
- `PUT /api/preferences` replaces the account's preferences and returns the saved
  `{ theme, font }`. It requires same-origin JSON, following the existing
  application mutation policy.

Theme values: `light`, `dark`, `system`.
Font values: `inter`, `noto-serif`, `source-code-pro`.
Both fields are required on writes; unknown fields are rejected by Zod.

Errors use the application `{ error: { code, fields? } }` envelope:
`401 UNAUTHENTICATED`, `403 EMAIL_NOT_VERIFIED`, `403 FORBIDDEN_ORIGIN`,
`422 VALIDATION`, or `503 PREFERENCES_UNAVAILABLE`. Malformed/oversized requests
use the existing JSON reader's error responses. A failed persistence operation
must not be presented by a future client as a successful account save.

The PostgreSQL migration adds one appearance row per user, with a cascading
owner foreign key and checks for supported theme/font values. No application
migration is applied to the development database automatically by this change.

## Remaining work

- Inspect settings light/dark and responsive design contexts/screenshots in the
  replacement Figma file `8VNP6vgCT8aUeegpPUXLmc` (linked theme frame
  `2180:25560`). Metadata was available, but detailed context/screenshot calls
  returned HTTP 503 during this implementation. Exact action text, save/preview
  behavior, and other settings layouts have not been verified.
- Implement accessible Nuxt UI settings controls and account loading/save/retry
  feedback without inventing an unresolved save interaction.
- Apply theme and supplied local fonts application-wide; follow system changes.
- Remember appearance before login, safely reconcile account switching/logout,
  and keep auth secrets and note drafts out of appearance storage.
- Add browser tests for cross-device persistence, public account pages, system
  changes, fonts, failures, responsive layouts, and keyboard use.
