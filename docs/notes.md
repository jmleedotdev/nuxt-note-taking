# Creating, editing and reopening private notes

Notes support create/list/read/edit with explicit Save and Cancel, archive/restore,
permanent deletion, scoped search, and derived tag navigation. Archived
notes remain read-only until restored, but can be permanently deleted.

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
- `PUT /api/notes/:id`: JSON `{ title, content?, tags?, version }`; replaces editable
  fields using the last observed positive integer version, with the same validation,
  origin and body-size protections as create. Returns the saved note directly.
  Stale saves return `409 NOTE_VERSION_CONFLICT`; archived notes return `409
  NOTE_NOT_EDITABLE`. Missing, removed, malformed and other-owner IDs all return
  `404 NOTE_NOT_FOUND`, without distinguishing another owner's record.

- `DELETE /api/notes/:id`: JSON `{ version }`; permanently removes an active or
  archived note using the last observed positive integer version. Returns 204 with
  no body. Uses the same origin, JSON validation, authentication and error envelope
  as other mutations. A single owner-scoped PostgreSQL DELETE checks ID and version
  atomically. Stale deletes return `409 NOTE_VERSION_CONFLICT`; missing, removed,
  malformed and other-owner IDs return indistinguishable `404 NOTE_NOT_FOUND`.
  No schema migration is needed; there is no trash, soft-delete, undo or restore
  after deletion.

A note contains exactly `id`, `title`, `content`, `tags`, `lastEdited` (UTC ISO 8601),
`isArchived`, and `version`. Identity/ownership are immutable, assigned by the
server, and protected by a database trigger. First save sets version 1, active
archive state, and the database timestamp. Existing schema/version constraints are
reused; no migration is needed for editing. One owner-scoped conditional PostgreSQL
UPDATE checks the expected version and writes atomically, including after waiting
for competing updates. Actual title/content/tag changes increment the version and
set a server timestamp. CASE expressions preserve version and timestamp for a
normalized no-op; a stale no-op is still rejected. List ordering remains
`lastEdited DESC, id DESC`.

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
allows refresh/reopen and opens active notes in the shared plain-text editor.
No draft contents are placed in storage or URLs. Cancel abandons a new draft or
restores the existing saved title/content/tags without an HTTP write. Failed saves
retain input for retry.

Command+S and Control+S submit the same schema-backed Save Note operation while
an editable new or existing active note is open, including from multiline content
and with a physical keyboard on narrow layouts. A platform-aware hint appears in
the Save Note buttons only as small, muted `⌘ + S` / `Ctrl + S` text without
an outline or background. Below 360px the visual hint is hidden to keep the action toolbar
within the viewport; shortcut metadata and the accessible Save Note name remain.
Applicable presses
prevent browser Save Page, including while saving, but pending saves and held-key
repeats do not start another submission. Ordinary Enter in content inserts a line
break. No shortcut is registered without an editor (account/settings forms, note
lists, archived read-only notes), and any open app dialog leaves the shortcut and
native browser default alone. The listener is removed when the editor unmounts.
There is no autosave, browser-storage draft, or new save-success toast.

In-app navigation away from changed input asks for confirmation through Nuxt UI;
page exits use the native browser warning where supported. Saved content renders
as escaped text with preserved whitespace, never as HTML or Markdown. The shared
`note-dirty` guard covers route changes, note selection, back/create and logout;
`note-save-pending` blocks navigation during an in-flight request. Future destructive
operations should use the same `confirmDiscard` callback before discarding work.

A conflict or removed-note response shows a persistent Nuxt UI toast with reload
guidance, without replacing the draft or introducing a merge/compare screen. A
Reload note action asks before discarding changed text and fetches fresh server
state. A failed reload retains the draft; a confirmed reload of a removed note
refreshes the list and returns there. Confirmed browser reloads, termination and
crashes do not recover drafts.

The existing supplied assets, Nuxt UI controls, local fonts, desktop columns,
small-screen bottom navigation, and floating create action are retained.
Figma file `GDJWyTOiuLIfNUQBSueHnL` was retrieved and its desktop create
`2171:18206`, tablet create `2231:7676`, mobile create `2231:7779`, mobile dark
create `2254:11582`, tablet read `2228:8408`, and desktop empty `2173:19181`
layout data inspected. Later node-specific API requests were rate-limited; no
pixel-exact screenshot comparison is claimed. For editing, desktop `2158:9117`,
tablet `2228:8408`, mobile `2231:7511`, and mobile dark `2238:18713` design context
and screenshots were inspected. The existing local tag/clock/back icons, fonts
and Nuxt UI controls are reused. Archive/delete actions and other unfinished
navigation remain outside this issue's implementation.

## Permanent deletion

Active and archived detail views expose Delete Note using the supplied delete
icon. The Nuxt UI dialog explicitly warns that deletion is permanent and cannot
be undone. Cancel receives initial focus; Escape and Cancel leave persistence
unchanged and return focus to the trigger. Confirming reuses `confirmDiscard`
before sending a deletion if the editor has unsaved changes. Failed/stale requests
retain the editor text, use existing error/toast reload recovery, and allow retry.
Successful deletion clears the selected note cache and refreshes both note lists,
returning to the current collection with its remaining notes or empty state.
Search and derived tag navigation refresh from persisted data after deletion.

Direct access to the supplied Figma file remains blocked by an MCP edit-access
denial. The user subsequently supplied dark, light and narrow light confirmation
screenshots, which were inspected to style the existing Nuxt UI `UModal` through
its title/footer slots and `ui` options. The dialog uses the supplied trash icon in
a neutral tile, a filled Cancel button, red Delete Note action, divided footer and
responsive text wrapping. Nuxt UI retains the accessible title/description, focus
trap, initial Cancel focus, Escape dismissal and trigger focus restoration.
Browser captures verify the rendered light/dark dialog and a 375px mobile viewport;
exact Figma node measurements remain unavailable.

## Tags and scoped search

`GET /api/notes` accepts optional `archived=true|false` (default false), `q`
(default empty), and `tag` (default empty). `q` matches saved title, plain-text
content, or any tag by case-insensitive literal substring; PostgreSQL `strpos`
avoids wildcard interpretation of `%`, `_`, and backslash. `tag` matches a complete
tag name case-insensitively. If both are supplied, both predicates apply (AND).
All predicates retain owner/archive scope and `lastEdited DESC, id DESC` ordering.
Empty `q` imposes no search predicate; meaningful whitespace is not trimmed.
Repeated/non-string filters, unknown archive values, queries over 100,000 units,
and tag filters over 50 units return `422 { error: { code: 'VALIDATION' } }`.

`GET /api/notes/tags` returns `{ tags: string[] }`, derived from the caller's saved
active **and archived** notes. Case variants collapse with PostgreSQL `lower`,
using the database-minimum spelling as a deterministic display representative,
sorted by folded tag name. There is no tag entity, mutation API, or standalone tag
state, and no schema migration is required: the existing PostgreSQL text array
contains all needed data. Both GET routes require a verified owner and are no-store.

Browser URLs use `q`, `tag`, `view=archived`, and `panel=search|tags` explicitly.
Search submits with Enter, replaces any tag filter, and stays in the current
active/archive scope. Clicking a tag clears search and opens only active notes.
All Notes/Archived Notes navigation clears search and tag filters. Opening a note
and returning preserves the current list's filters. Search uses saved data only;
unsaved editor changes remain protected by the existing discard confirmation.
The mobile/tablet bottom navigation opens Tags or a scoped Search screen; desktop
uses the sidebar and header input. Empty-query guidance, no-match, archived-only
tag, empty collection/tag list, loading, and retryable errors are distinct states.
Successful saves, archive/restore, and deletion refresh derived tags and results.
Logout clears the derived-tag cache.

For this slice, the user supplied accessible Figma copy `8VNP6vgCT8aUeegpPUXLmc`.
Design context and screenshots were inspected for desktop tag `2173:21657`,
desktop search `2173:23295`, tablet tags `2231:9941`, mobile tags `2231:42881`,
mobile search `2231:43568`, and dark tablet empty search `2254:16413`.
The supplied local tag/search/back/plus/chevron icons, fonts and Nuxt UI controls
are reused. Browser screenshots check responsive rendering; unrelated existing
shell differences are retained, not claimed as pixel-exact matches.

## Validation

`pnpm test:http test/http/notes.test.ts` exercises real HTTP/PostgreSQL behavior
using migrated disposable databases, including permanent active/archived deletion,
owner/version/origin enforcement and competing delete/edit/archive/restore requests,
competing edits, stale no-ops,
unchanged timestamps/ordering, validation, ownership and removed records. Test-only
clock/archive/removal setup is not mounted in production.
`pnpm test:browser tests/edit-notes.spec.ts tests/notes*.spec.ts` covers editing,
competing tabs, toast/reload and removed-note recovery as well as create, cancel,
validation, retry, refresh, safe paragraph rendering, tags, failed loads and
unsaved-navigation confirmation at desktop/tablet/mobile sizes. Routine tests
replace external mail delivery only and send no real email.
`pnpm test:browser tests/delete-notes.spec.ts` additionally covers permanent deletion,
Cancel/Escape, keyboard focus, unsaved-work protection, stale/removed-note reload,
request failure/retry, selection and empty states at all three configured sizes.

### Save shortcut verification (#34)

- `pnpm lint` and `pnpm typecheck`: passed on the final application/test changes.
- `pnpm test`: 14 files, 133 tests passed (unit/Nuxt/HTTP projects).
- `pnpm test:browser tests/edit-notes.spec.ts tests/responsive-actions.spec.ts tests/delete-notes.spec.ts --reporter=line`:
  27 passed across desktop/tablet/mobile after the final hint changes.
- Final `pnpm test:browser --reporter=line`: 96 passed, 6 opt-in audit journeys
  skipped. The isolated runner creates/migrates/drops a disposable test database.
- The initial shortcut tracer failed before implementation. Browser checks cover
  both modifiers, new/existing editors, all three focused fields, multiline Enter,
  validation/server/network failures, retained drafts, stale/removed recovery,
  pending/repeated/held keys across editor replacement, normalized no-op saves,
  account/settings/list/archived exclusions, all three confirmations, native
  default preservation, modal focus, and both platform hints in the Save buttons.
- An earlier full run exposed a platform-dependent responsive-test assumption:
  macOS End did not move the focused textarea caret. Filling its unchanged value
  now establishes the append position without changing production editing.
  A later run encountered one transient HTTP `ECONNRESET` in the existing deletion
  journey; its focused rerun and the final full suite passed.
- Responsive light/dark journeys captured screenshots and checked toolbar fit;
  the hint stays inside the buttons with no background or standalone row.
  The owner subsequently requested
  removing only the hint outline and explicitly waived another test round for
  that CSS-only change; the passing results above precede its removal.
  No pixel-parity claim or
  additional audit proposal. Existing audit files and captured images are unchanged
  and are not part of this commit.
- Independent Standards and Spec reviews, including the final presentation/test
  delta: no findings. Reviewers inspected code; executed checks above are from the
  implementation session.
