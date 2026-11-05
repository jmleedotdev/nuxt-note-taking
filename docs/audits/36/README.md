# Integrated verification — #36

Scope: [#36](https://github.com/jmleedotdev/nuxt-note-taking/issues/36), against [#28](https://github.com/jmleedotdev/nuxt-note-taking/issues/28) and the [#29 baseline](../29/README.md). Starting revision: `7897af5e297e143df5d25347596547c2155129ad`, branch `ui`. The implementation and this README are intended to be committed together following the owner's subsequent approval to include the audit README. Generated screenshots, observations and logs remain outside Git. The [final ticket comment](https://github.com/jmleedotdev/nuxt-note-taking/issues/36#issuecomment-6649660457) also records the matrix/validation receipt; its original uncommitted-audit note predates that approval. Screenshots remain local review artifacts, not publicly hosted evidence.

## Scope reconciliation

The older #28/#32/#36 text says to retain sidebar email and narrow header logout, and not redesign archived actions. Commit `8978ca87daf4ee0a783eb89bb9e0431b2a819774` explicitly records an **approved follow-up to #32** removing email/header logout, keeping Settings logout, and placing archived Delete/Restore alongside Back. Current tests assert this newer behavior. This verification does not silently claim the old retention requirements pass, revert that recorded approval, or amend/close #28. The approval is recorded in Git history, not in a #32 issue comment (none was present at verification).

## Evidence provenance

Machine-specific artifact paths are omitted. Commands below normalize output destinations to `$EVIDENCE_DIR`, an owner-selected absolute directory outside the repository; this changes only artifact placement, not test behavior.

- Baseline: #29's source revision `0d39e7d82afd2b4ab4c996448ce62628e8c7dcf2`, committed browser observations under `docs/audits/29/evidence/rendered`, and privately retained before/reference contact sheets outside the repository. Original standalone before PNGs were not found; the contact sheets provide before rendering but are reduced-size, not pixel-diff baselines.
- After: `DESIGN_AUDIT_OUTPUT="$EVIDENCE_DIR/rendered" DESIGN_AUDIT_FONTS=1 pnpm test:browser`. Chromium, one worker, six combinations of desktop/tablet/mobile and light/dark. Reference viewports: 1440×900, 768×1024, 375×812; project-width new-editor captures: 1280×720, 1099×1024, 549×812. Responsive assertions additionally exercise 320/375/549/768/1099/1279 widths.
- Per-combination evidence: 22 Inter states plus eight states each for Noto Serif and Source Code Pro: font/password settings, active editor, Archive/Delete/Discard dialogs, login and signup. All six capture journeys passed: 38 screenshots per combination, 228 total. Inventory verified 38 matching screenshot/observation entries and zero horizontal-overflow observations in every combination; `evidence-manifest.json` records SHA-256 hashes. `observations.json` records viewport, computed font, theme/focus context and overflow. Fonts use actual persisted preferences; System theme follows emulated device appearance. Screenshots wait for fonts, reduce motion and disable finite animations.
- The capture journey now asserts no horizontal overflow at **every** screenshot, waits for Restore success/navigation before reopening, checks that the desktop input reserves space for its hint, and checks safe dialog focus, both save/search bindings, reverse/forward containment, Escape return, retained draft and unchanged HTTP content across both alternate fonts/themes/layouts.
- Browser assertions are behavioral evidence; screenshots are visual evidence; source inspection establishes configuration/ownership, not runtime behavior. Neither screenshot availability nor child-ticket closure is substituted for checking a requirement.
- Private original-file references retained by #29 were reused, not published. A fresh Figma MCP screenshot request for original desktop `2158:9117` succeeded. Replacement access was not retried; its earlier denial remains a historical access gap, not a new claim of denial or original-file inaccessibility.

## Parent behavior-to-delivery/evidence matrix

Numbers are the user stories in #28. Test filenames are under `tests/`. Capture names are relative to each `<project>-<theme>/` in the after directory; before/reference pairs are linked in the [baseline index](../29/evidence-index.md). All rows are subject to the exact run results below, not inferred from issue closure.

| Stories | Delivering ticket | Browser evidence / visual state | Assessment |
|---|---|---|---|
| 1–2 consistent buttons/conventional inputs | #30 | `registration`, `authentication`, `password-change`, `preferences`; login/signup/password/font/color captures | Shared sizing/focus and variants; editor intentionally differs |
| 3 borderless writing | #30 | `edit-notes`, `responsive-actions`; active/new editor, alternate-font editor | Retained borderless writing fields |
| 4 action consequences distinct | #30/#31 | `confirmations`; Delete/Archive/Discard captures | Archive primary; Delete/Discard destructive, safe action initially focused |
| 5 light/dark coherence | #30–#33 | `responsive-actions` both themes; all six captures and alternate fonts | Visual review, not contrast certification |
| 6 shared Nuxt theme | #30/#33 | source `app/app.config.ts`; rendered shared controls/toasts | Source + rendered evidence, not an assertion of internal module structure |
| 7–8 responsibility-based extraction/no pass-through wrappers | #31 | source `ConfirmationDialog.vue`, `NotesWorkspace.vue`, `index.vue`; `confirmations` | Feature operations remain in owners; presentation extracted |
| 9 design comparison | #29/#36 | baseline/private reference contact sheets; after named states | Available references compared; no pixel equality claim |
| 10 approval gate | #29/#36 | baseline P1–P3, scope reconciliation above | Unapproved proposals remain proposals |
| 11 desktop logout removal | #32 | `authentication`, `responsive-actions`; desktop shell/editor | Removed |
| 12 settings logout retained | #32 | `authentication`, `preferences`, `password-change`; settings navigation | Real session logout/failure/pending behavior retained |
| 13 small-screen header logout retained | #32 follow-up | `8978ca8`, `responsive-actions`, shell captures | Intentional later-approved difference: removed; Settings is entry point |
| 14 desktop Back removal | #32 | `responsive-actions`, `notes-navigation`, `confirmations`; desktop active/archived | Removed where list visible |
| 15 narrow Back retained | #32 | same tests; tablet/mobile active/archived/new | Retained with unsaved guards |
| 16 top toolbar actions | #32 | `responsive-actions`; active-editor captures | One visible copy, same row, bounds checked |
| 17 compact labels/fit | #32 | `responsive-actions` width sweep; all capture overflow assertions | Names/focus and bounds checked down to 320px |
| 18 archived read-only/restore/delete | #32/#36 | `archive-notes`, `delete-notes`, `responsive-actions`; archived-note | Retained; toolbar alignment is recorded follow-up |
| 19–20 coherent confirmation layout/specific copy | #31 | `confirmations`; all three dialog captures including alternate fonts | Shared foundation, distinct wording/emphasis |
| 21 safe initial focus | #31 | `confirmations`, extended font capture | Cancel/Keep writing |
| 22 containment/return/replacement focus | #31 | `confirmations`, extended font capture | Both directions, Escape, surviving trigger/logical replacement |
| 23 cancel/Escape preserves draft/saved note | #31 | `confirmations`, `responsive-actions`, extended font capture | Draft plus real HTTP saved outcome checked |
| 24 toast coherence | #33 | `archive-notes`, `delete-notes`, `edit-notes`; archive-toast | Success icon/compact shared presentation |
| 25 persistent recovery/Reload | #33 | `edit-notes` competing tabs; conflict-recovery | Persistent warning, rejected text, Reload retained |
| 26 inline field errors | #30 | `registration`, `edit-notes`, `password-change`, `preferences` | Not replaced wholesale with toast feedback |
| 27 account safety/recovery copy | #30 | `password-change`, `password-recovery`; settings-password/reset/check-email | Intentionally exceeds minimalist references |
| 28 new-note Meta/Control+S | #34 | `edit-notes` two modifier journeys | Actual persistence from focused editor |
| 29 existing active-note save | #34 | same | Existing save path preserved |
| 30 validation without loss | #34 | same + explicit Save journey | Invalid input remains with feedback |
| 31 failure/conflict recovery | #34 | `edit-notes` explicit and shortcut flows | Rejected text, retry, stale/removed recovery |
| 32 one in-flight save | #34 | two modifier journeys, delayed response/held key | Duplicate request prevention |
| 33 correct save scope | #34 | `edit-notes` exclusion journey | No settings/account/archive save; native default not globally suppressed |
| 34 desktop search focus/select | #35 | `search-shortcut` both bindings | No command palette or implicit query |
| 35 dirty editor remains intact on focus | #35 | `search-shortcut` first journey | No route/save/discard prompt |
| 36 search scope/tags/unsaved guard | #35 | `search-shortcut`, `tag-search` | Active/archive, tag replacement, cancel/confirm and visible filter restoration |
| 37 narrow search unchanged | #35 | `search-shortcut` small-screen journey | Native shortcuts and existing Search navigation |
| 38 modal shortcut exclusion | #34/#35/#36 | `edit-notes`, `search-shortcut`; extended alternate-font dialog capture | Both modifier bindings and all three confirmations |
| 39 discoverable platform hints | #34/#35 | `edit-notes`, `search-shortcut` Mac/Linux/remount journeys; editor | Supported hints; no narrow search hint |
| 40 browser Find unchanged | #35 | `search-shortcut` native-default checks | App does not intercept Find |
| 41 exact login order | #30 | `authentication` keyboard journey | Email → Password → reveal → Login → Forgot → Sign Up, reverse too |
| 42 Enter submits password | #30 | `authentication` login journey | Real login; multiline editor Enter remains text in `responsive-actions` |
| 43 reveal/recovery keyboard access | #30 | `authentication`, `registration`, `password-recovery` | Keyboard operation and reverse traversal |
| 44 forward/reverse across forms/settings/nav/dialogs | #30–#32 | `authentication`, `registration`, `password-recovery`, `password-change`, `preferences`, `responsive-actions`, `confirmations` | Focused checks, not comprehensive accessibility certification |
| 45 visible focus/icon names | #30–#32 | keyboard helper assertions, `responsive-actions`, `search-shortcut`; focus captures | Observable outlines and accessible labels |
| 46 explicit Save/Cancel/unsaved protection | #30–#35 | `notes`, `edit-notes`, `notes-navigation`, `archive-notes`, `delete-notes`, `tag-search`, `confirmations` | No autosave/browser drafts/backend redesign |
| Additional #36: appearance persistence | #9/#30 | `preferences` full suite; alternate-font capture logout/login | Theme/font explicit saves, reload/device/account isolation |
| Additional #36: sidebar email | #32 follow-up | `8978ca8`, `responsive-actions`; desktop shell | Intentional later-approved removal, not old-spec compliance |

## Visual comparison and classifications

Final desktop/tablet/mobile light/dark review completed against the private #29 before/reference sheets. Sixteen primary state sheets were inspected (active editor, login/signup/forgot/reset, password/color/font settings, list, archived note, Delete/Archive/Discard, archive toast, conflict recovery, settings navigation), plus representative full-size alternate-font desktop/tablet/mobile screenshots. All 228 images were captured and assertion-checked; not every supplemental capture was independently compared to a reference. Visual comparison is a human-scale inspection of captured images/contact sheets, not an automated pixel diff.

| Screen/state | Before → after observation | Classification/reference boundary |
|---|---|---|
| Login/signup/forgot/reset | Conventional controls now share transparent dark input surfaces, consistent primary buttons and focus treatment; login recovery follows Login in keyboard/markup order | Approved #30. Google remains intentionally absent. Dark account panel/surround and geometry still differ (P1, not silently fixed). |
| Active/new editor, shell/navigation | Desktop Back/duplicate logout absent; borderless fields retained; narrow Archive/Delete join Back/Cancel/Save at top; save/search hints visible where supported | Approved #32/#34/#35. Email/header logout removal is later approval `8978ca8`, not satisfaction of old retention text. |
| Archived note | Read-only content, status, Restore/Delete retained; no Save or editable fields | Intentional product rule differs from desktop archived reference editing controls. Narrow action placement is later recorded approval. Exact narrow read-only design comparison limited. |
| Settings color/font/password | Shared conventional input/button treatment, explicit Apply/Save, password safety copy retained | Approved shared controls. Tablet appearance-card width cap remains P2; necessary safety copy intentionally changes reference geometry. |
| Delete/Archive/Discard | Shared icon/header/divider/footer foundation, larger consistent action controls, Cancel/Keep writing safe focus; primary archive versus destructive delete/discard | Approved #31. Stronger overlay versus old pale light baseline; exact Discard and some narrow/dark reference states unavailable. |
| Archive toast and conflict recovery | Compact shared neutral surfaces/type/icon, warning distinct from success; persistent recovery text/Reload remain | Approved #33. Existing timer/dismissal semantics and no extra reference-only navigation action retained intentionally. |
| Note list/tablet bottom nav | Existing native list and navigation retained | P3 row alignment/label placement remains proposed; sparse capture data does not prove multi-row density parity. |
| Supported font preferences | Serif/monospace change metrics and wrapping while retaining named actions and input/dialog flow | Actual account preferences exercised. New hint-spacing defect fixed under approved scope; broader font/screen permutation coverage not claimed. |

**Fixed integration defect:** desktop search's trailing shortcut hint overlapped the text area, particularly with Source Code Pro. The browser assertion measures the input text area's right edge against the hint's left edge. Red run: textRight 1312px > hintLeft 1301.6875px (Noto Serif already reproduces it). Reserved `pe-20` through the existing Nuxt UI input slot styling, without changing search semantics or introducing a wrapper. Focused green run: both desktop themes, both alternate fonts pass. This is within #28's discoverable supported-font shortcut-hint requirement, not a new layout proposal.

## Exact validation receipt

- `pnpm lint` — passed after final app/test change. An intermediate formatting-only failure was corrected with `pnpm exec eslint tests/design-audit.spec.ts --fix` before rerunning.
- `pnpm typecheck` — initial, intermediate and final app/test-change runs passed.
- `pnpm test` — isolated disposable PostgreSQL/memory mail, 14 files / 133 tests passed, including existing HTTP/PostgreSQL tests and unit/Nuxt checks. No developer database or real email used.
- Initial full browser attempt with capture/fonts enabled: 38 passed, 1 skipped, 1 failed capture, 1 interrupted, 79 unrun. Stopped after the Restore race was diagnosed, not counted as a full pass. Captures used a full-page `goto` immediately after clicking Restore; the archived note remained in the failure snapshot. Added visible restored toast and completed route transition waits before reopening.
- Focused capture run then reached the new unchanged-content assertion and failed in both themes: the old competing save sent only title/version, so the replacement PUT legitimately saved empty content. Made the competing save's content explicit (`Newer saved body`) and asserted that independent expected value after modal shortcut attempts. No production behavior weakened or changed.
- Focused restored-capture/alternate-font rerun: `DESIGN_AUDIT_OUTPUT="$EVIDENCE_DIR/focused" DESIGN_AUDIT_FONTS=1 pnpm test:browser tests/design-audit.spec.ts --project desktop` — 2 passed.
- Intermediate full browser run was stopped after discovering hint overlap during visual review: 46 passed, 1 skipped, 1 interrupted, 72 unrun (`final-browser.log`, retained outside Git). It is not counted as a completed full pass.
- Hint red: `DESIGN_AUDIT_OUTPUT="$EVIDENCE_DIR/hint-red" DESIGN_AUDIT_FONTS=1 pnpm test:browser tests/design-audit.spec.ts --project desktop --grep '\\(light\\)'` — 1 failed at text-area/hint bounds assertion (1312 > 1301.6875).
- Hint green: `DESIGN_AUDIT_OUTPUT="$EVIDENCE_DIR/hint-green" DESIGN_AUDIT_FONTS=1 pnpm test:browser tests/design-audit.spec.ts --project desktop` — 2 passed after padding fix, with unchanged modal/persistence assertions.
- After final application/test change: `pnpm typecheck`, `pnpm lint`, and `git diff --check` — passed.
- Final `pnpm test` rerun after the last app/test change — 14 files / 133 tests passed (`verified-vitest.log`, retained outside Git).
- Final `DESIGN_AUDIT_OUTPUT="$EVIDENCE_DIR/rendered" DESIGN_AUDIT_FONTS=1 pnpm test:browser` — **109 passed, 11 skipped, 0 failures (7.7m)**. The 11 skips are intentional layout-inapplicable shortcut tests: one desktop skip of the small-screen journey and five desktop-only journeys skipped in each narrow project. All six capture journeys ran; none was skipped. Real isolated application/PostgreSQL/memory-mail setup.
- Post-suite `pnpm typecheck && pnpm lint && git diff --check` — passed.
- No validation environment blocker. Optional real-SMTP local-mail suite was not run; email is exercised through isolated memory-mail browser/HTTP journeys, not real recipients.
- Existing builds emit dependency esbuild warnings about BigInt targeting es2019; these are warnings, not failed checks or permission for unrelated build work.

## Independent review

### Standards

No findings. The input padding uses Nuxt UI's supported styling slot, and browser checks remain local to the existing font/capture journey. No new abstraction/dependency or feature-ownership move.

### Spec

No findings in the final app/test delta. Reviewers explicitly noted that full browser results and final visual inspection must finish before publication; those are separate gates, not inferred from their code-review verdict.

Summary: 0 Standards findings; 0 Spec findings. Two fresh-context read-only reviewers reviewed the exact diff against starting revision `7897af5`, including the final hint fix. Reviews did not themselves run suites.

## Limits and follow-ups

- P1 account dark-surface/geometry, P2 tablet appearance-card width, P3 list-row/tablet-nav alignment remain unapproved proposals from #29. No silent implementation.
- No exact references for Discard, check-email, invalid-reset/failure/conflict recovery; incomplete exact tablet/mobile-dark confirmation references and supplemental/new-note/toast states. Keep necessary functional copy and accessible names; do not claim parity in absent states.
- Alternate-font captures cover selected shared controls/editor/dialog/account states, not every account failure screen, archived font variant, or every viewport/font permutation. Behavioral failures and appearance persistence are covered separately by regressions.
- Current visual checks are Chromium only; no screen-reader audit, formal contrast audit, comprehensive accessibility certification, or cross-browser/pixel-parity claim.
- Private contact sheets contain design references and must not be committed/published. Current-app screenshots, observations and logs remain outside the commit; this README is included with the owner's subsequent approval. All 228 current-app PNGs, observations and the SHA-256 manifest are retained privately outside the repository. This is not a remotely accessible screenshot link; remote visual artifact access remains a limitation. The published ticket matrix/receipt is remotely accessible; local reproduction uses the committed capture journey.
