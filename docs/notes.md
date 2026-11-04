# Creating and reopening private notes

This slice implements create/list/read only. Editing saved notes, archive mutations,
search, and tag navigation remain later slices; reopening a saved note is read-only.

## Application HTTP contract

All routes require an authoritative verified session and return `Cache-Control:
no-store`. Authentication failures are `401 UNAUTHENTICATED` or `403
EMAIL_NOT_VERIFIED`. Database/operation failures return `503 NOTES_UNAVAILABLE`.

- `POST /api/notes`: JSON `{ title, content?, tags? }`, with tags as a string array.
  Returns the created note directly with status 201. Requires the configured app
  Origin, JSON content type, and a non-cross-site Fetch Metadata header.
- `GET /api/notes`: `{ notes: Note[] }`, active notes belonging to the caller only,
  ordered by `lastEdited DESC, id DESC`.
- `GET /api/notes/:id`: a note directly; missing, malformed, and other-owner IDs
  all return the same `404 NOTE_NOT_FOUND` response. An owner can read archived notes.

A note contains exactly `id`, `title`, `content`, `tags`, `lastEdited` (UTC ISO 8601),
`isArchived`, and `version`. Identity/ownership are immutable, assigned by the
server, and protected by a database trigger. First save sets version 1, active
archive state, and the database timestamp. No mutation of existing notes is exposed.

Invalid input returns `422 { error: { code: 'VALIDATION', fields } }`. Unknown
properties are rejected, not spread into database writes. Invalid JSON is 400;
requests larger than 650,000 bytes are 413, including chunked streams. This budget
allows JSON-escaped bodies at the accepted 100,000 UTF-16-code-unit limit.

The shared Zod schema trims titles/tags, normalizes CRLF and CR to LF, and preserves
all other body whitespace. Empty bodies and zero tags are valid. Tags are trimmed,
empty entries removed, and deduplicated case-insensitively with the first display
spelling preserved. The browser converts comma-separated input to that array.
Title/content/tag limits are 200/100,000/50 UTF-16 code units and 20 unique tags.
PostgreSQL constraints provide additional storage bounds; the server schema is
authoritative for application input.

## Browser behavior

`/?draft=1` opens an unsaved editor; `/?note=<id>` selects a persisted note and
allows refresh/reopen. No draft contents are placed in storage or URLs. Cancel
abandons a draft without an HTTP write. Failed creates retain input for retry.
In-app navigation away from changed input asks for confirmation through Nuxt UI;
page exits use the native browser warning where supported. Saved content renders
as escaped text with preserved whitespace, never as HTML or Markdown.

The existing supplied assets, Nuxt UI controls, local fonts, desktop columns,
small-screen bottom navigation, and floating create action are retained.
Figma file `GDJWyTOiuLIfNUQBSueHnL` was retrieved and its desktop create
`2171:18206`, tablet create `2231:7676`, mobile create `2231:7779`, mobile dark
create `2254:11582`, tablet read `2228:8408`, and desktop empty `2173:19181`
layout data inspected. Later node-specific API requests were rate-limited; no
pixel-exact screenshot comparison is claimed.

## Validation

`pnpm test:http test/http/notes.test.ts` exercises real HTTP/PostgreSQL behavior
using migrated disposable databases. Test-only clock/archive setup is not mounted
in production. `pnpm test:browser tests/notes*.spec.ts` covers create, cancel,
validation, retry, refresh, safe paragraph rendering, tags, failed loads and
unsaved-navigation confirmation at desktop/tablet/mobile sizes. Routine tests
replace external mail delivery only and send no real email.
