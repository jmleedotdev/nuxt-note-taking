# Design baseline audit — issue #29

- Request: [#29 — Audit existing screens against the supplied designs](https://github.com/jmleedotdev/nuxt-note-taking/issues/29).
- Approved scope: [#28](https://github.com/jmleedotdev/nuxt-note-taking/issues/28). This report does not edit or close that spec.
- Before-change application source: `0d39e7d82afd2b4ab4c996448ce62628e8c7dcf2`.
- Captured/inspected: 2026-11-04, Chromium, local Inter font, scale factor 1.
- Deliverables: this report, [evidence index](evidence-index.md), browser observations, and an opt-in [capture journey](../../../tests/design-audit.spec.ts). The 132 current-app PNGs were captured and inspected but are now retained outside Git as review artifacts.
- **Design privacy:** Figma exports and downloaded design metadata are private, stored outside this repository, and must not be committed or published. The evidence index links to access-controlled Figma references rather than exported design images.
- **No application UI, database schema, HTTP contract, authentication, ownership, explicit-save, archive, or deletion behavior changed.** This is a baseline, not a pixel-parity or accessibility certification.

## Decision summary

The original Figma file is accessible. Its desktop and narrow editor references substantiate the already-approved navigation/action changes. The current app retains those known differences. Delete has the closest existing dialog presentation; Archive and Discard still use different defaults. Account controls and note-action controls differ visibly, especially in dark appearance.

The audit prerequisite has source **and** rendered evidence; it is not a claim that every app state or every Figma frame has been tested. Approved implementation can proceed within #28. Additional proposals P1–P3 below require owner approval and must not hold the approved work indefinitely.

### Confirmed implementation boundaries

| Approved change | Preserve while implementing |
|---|---|
| Remove desktop bottom-left sidebar logout only | Sidebar email, settings logout, narrow header logout, pending/failure feedback |
| Remove desktop editor Back where list remains visible | Back wherever mobile/tablet hides the list; Cancel and unsaved-navigation protection. Review archived desktop Back separately within this approved rule, without redesigning archived content. |
| Move active-note Archive/Delete to narrow top toolbar | Appropriate Back/Cancel/Save, compact accessible names, no horizontal overflow; no redundant lower copies |
| Shared Nuxt UI control/theme, confirmation and toast presentation | Borderless editor fields, primary/neutral/destructive distinctions, action-specific wording; feature owners keep operations and transitions |
| Keyboard improvements specified in #28 | Safe dialog action focus, focus containment/return, Escape cancellation, login credential order, shared save operation and modal-aware save/search shortcuts; browser Find unchanged |
| Archived state remains read-only | Restore and permanent deletion after confirmation; never enable editing just because a reference includes Save |
| Coherent feedback styling | Persistent conflict/removed-note warning and Reload, rejected text, inline validation/settings feedback, necessary account safety instructions; no new toast after every save |

## Method and evidence provenance

### Source inspection (not rendered evidence)

Inspected the root glossary and domain guidance, #28/#29, repository reviewer standards, and the following responsibility boundaries:

| Source | Source-only finding |
|---|---|
| `app/app.config.ts`, `app/assets/css/main.css` | Shared color mapping and local palette/fonts exist; no shared button/input/modal/toast presentation overrides in app config. Use the existing Nuxt UI theme seam, not a replacement library. |
| `app/components/AccountPanel.vue`, `app/pages/{login,signup,forgot-password,reset-password,check-email}.vue` | Common panel exists, but forms carry local control classes. Login recovery link precedes Password in DOM. AccountPanel dark surface uses neutral-800 on neutral-950. |
| `app/pages/index.vue` | Owns shell, desktop search, logout and unsaved-discard dialog. Sidebar email/logout and narrow header logout are separate render locations. Responsive desktop layout starts at `xl` (1280px). |
| `app/components/NoteEditor.vue` | Borderless title/tags/content; duplicate desktop and narrow Back/Save/Cancel render locations. No save-shortcut handler. Conflict toast is persistent with Reload and retained draft. |
| `app/components/NotesWorkspace.vue` | Native composite note-list buttons are legitimate. Archive/Delete live in actions aside, below editor on narrow screens. Delete has explicit icon/header/footer styling, Archive mostly defaults; archive/restore/delete success toasts use existing Nuxt UI presentation. |
| `app/components/AppearanceSettings.vue`, `app/components/PasswordSettings.vue` | Color/font cards and password inputs have explicit local styling. Settings logout retained. Appearance cards cap width at 528px even on tablet; password form does not use that cap below desktop. Safety copy warns about fresh login on every device. |
| `docs/{registration,authentication,notes,password-change,appearance,password-recovery}.md` | Historical reference leads and deliberate functional differences. Historical access denials do not establish current access; references were retrieved again for this audit. |

### Current rendered app (separate from source)

The existing Nuxt Playwright fixture builds the real app with test-only mail/note-state handlers. `scripts/test-database.ts` creates/migrates a randomly named disposable PostgreSQL database, sets `APP_ENV=test` and `MAIL_MODE=memory`, then drops that database in `finally`. It explicitly does not load the developer `.env`. Test accounts use `example.test`; mail is captured in memory, never sent to real users. Data setup uses existing registration, verification, login and note APIs. Conflict recovery is reached through a competing real save, not a fabricated production test interface.

The final capture run completed six journeys: desktop/tablet/mobile × light/dark. It uses reference-size viewports **1440×900, 768×1024, 375×812**, plus new-editor captures at existing project sizes **1280×720, 1099×1024, 549×812**. Full-page image height can exceed viewport height. Media color preference is light/dark with the account's default System theme, not a fabricated DOM theme. Every capture checks the resulting html theme class and waits for fonts. Motion is reduced and finite screenshot animations are completed to avoid recording modal/toast entrance frames.

Each of the six sets contains: login, login keyboard focus, signup, forgot password, valid reset form, invalid reset recovery, verification-required check-email, active list, active editor, new editor, project-width new editor, archived list, archived read-only note, settings navigation, color/font/password settings, Delete/Archive/Discard confirmations, archive success toast, and persistent conflicting-save recovery. [Open the evidence index](evidence-index.md) for generated PNG filenames and access-controlled Figma reference links. Screenshots are not committed; use an external `DESIGN_AUDIT_OUTPUT` directory.

`observations.json` in each set records viewport, font, current focus, horizontal-overflow measurement and the observed login traversal. No captured state reported horizontal overflow. This measurement does **not** prove action visibility, sufficient contrast, focus containment, or absence of vertical occlusion. In particular the old lower editor actions can require scrolling on mobile; the approved toolbar change addresses their placement.

### Reference access and comparison coverage

Original file: [GDJWyTOiuLIfNUQBSueHnL](https://www.figma.com/design/GDJWyTOiuLIfNUQBSueHnL/note-taking-web-app?node-id=2158-9117). Retrieved Designs page metadata `2158:9116` and 72 reference exports for private inspection. Downloaded design images and metadata are kept outside the repository; they are not public audit artifacts. Corresponding access-controlled Figma links are in the evidence index. Reference discovery alone is not visual inspection.

| Screen/reference family | Current rendering | Reference status / comparison limits |
|---|---|---|
| Login, signup, forgot/reset forms | All six viewport/theme sets | All six corresponding original references retrieved and visually compared. Google sign-in omission and account safety/recovery content remain deliberate differences. |
| Check-email and invalid reset | All six | No exact reference located/inspected. Compare shared account presentation only; do not invent missing success/error specifications. |
| Active editor + authenticated shell | All six | Desktop `2158:9117` / `2171:16976`, tablet `2228:8408` / `2238:13296`, mobile `2231:7511` / `2238:18713` retrieved and compared. Different note text/data/date prevents pixel-equivalence claims. |
| Active note list | All six | Tablet `2226:7223` / `2238:13286`, mobile `2227:7443` / `2238:18397` retrieved; the last is named Light but visually dark. Desktop editor references supply shell/list context, not an exact list-only frame. |
| New editor | All six plus project widths | Rendered before-change evidence captured; exact create frames cataloged but not retrieved/compared in this audit. |
| Archived list + read-only detail | All six | Desktop `2173:20030` / `2173:20904` and tablet/mobile list/detail variants retrieved. Reference detail includes editing/Save controls; app deliberately retains read-only product rules. |
| Color, font, password settings | All six | Corresponding six original frames per settings family retrieved/compared. `2236:10021` is named Color Theme but depicts font options. System selection and font-name labels differ intentionally. |
| Settings navigation | All six | Rendered and source inspected; exact standalone navigation references not retrieved. Retained logout is visible. |
| Delete/Archive confirmations | All six | Desktop light/dark and mobile light exports retrieved/compared. Exact tablet and mobile-dark frames not retrieved; shared presentation can be based on available references, not asserted exact parity. |
| Discard confirmation | All six | No exact Discard reference identified; apply the approved shared confirmation foundation, keeping its distinct copy and destructive emphasis. |
| Archive success toast | All six | Archive component `2195:33750`, dark desktop toast example `2254:19061`, tablet/mobile light examples `2236:11174` / `2236:11182` retrieved. Examples do not establish every operation/theme's exact toast state. |
| Persistent conflicting-save recovery | All six | No exact reference identified. Preserve real warning, retained text and Reload rather than substituting a transient success toast. |
| Replacement file `8VNP6vgCT8aUeegpPUXLmc` | Not applicable | `get_metadata` for `2180:26977` denied edit access again (debug UUID `fb5f0b25-684b-48ae-8c8a-32e17010966a`). Do not transfer node identities or treat this as original-file denial. |

Visual review used private side-by-side contact sheets of full-resolution exports/captures, followed by individual dialog/toast/reference images to check settled rendering. Design exports and mixed contact sheets remain private and are not committed. It establishes layout/control observations below, not measured pixel differences. Unpaired supplemental exports and metadata-only catalog entries are not claims of a completed comparison.

## Findings register

Classification is explicit for every finding. **Approved change** means already in #28, not implemented here. **Additional proposal** needs owner approval. **Intentional difference** must survive implementation. **Reference gap** is an evidence limitation, not permission to redesign. Viewport abbreviations D/T/M refer to the reference sizes above; L/Dk mean light/dark. Each screen name links to generated capture filenames and available reference pairs.

| ID / classification | Screen/state; viewport/theme | Reference | Observation and evidence |
|---|---|---|---|
| A1 — approved change | [Active editor / shell](evidence-index.md#active-editor); D L/Dk | `2158:9117`, `2171:16976` | App has bottom-left Log out and email; reference lacks logout. Remove only desktop logout. Source: index sidebar. Rendered screenshots show the duplicate action and retained settings alternative. |
| A2 — approved change | [Active editor](evidence-index.md#active-editor); D L/Dk | Same desktop frames | Go Back consumes a row above title while list is visible; no corresponding reference control. Remove that desktop action, retain narrow Back. Archived desktop also has Back; apply the approved list-visible rule without adopting reference editing controls. |
| A3 — approved change | [Active editor](evidence-index.md#active-editor); T/M L/Dk | `2228:8408`, `2238:13296`, `2231:7511`, `2238:18713` | App top row contains Back/Cancel/Save but Archive/Delete are below the writing field. References put compact Delete/Archive in top toolbar. Move existing active-note actions; fit/label/retest at 375px and existing project widths. |
| A4 — approved change | [Login](evidence-index.md#login), [password settings](evidence-index.md#settings-password), [editor](evidence-index.md#active-editor); all six | Paired account/settings/editor frames | Account input sizes/backgrounds and conventional settings controls use different local overrides; dark account inputs look nearly black while password settings inputs inherit the page surface. Note action button fills also differ from the editor's borderless role. Shared defaults/intentional variants are approved; do not give editor fields form borders. |
| A5 — approved change | [Delete](evidence-index.md#delete-dialog), [Archive](evidence-index.md#archive-dialog), [Discard](evidence-index.md#discard-dialog); all six | `2207:34340`, `2208:35460`, `2207:34621`, `2208:35985`, mobile light exports; Discard gap | Delete already has an icon tile, divider, right-aligned footer and large buttons. Archive/Discard lack that tile and have smaller left-aligned default footer controls and a Close button. Unify approved presentation from Delete, preserving red deletion/discard vs primary Archive. Current light overlay is pale compared with reference's darker dimming; evaluate within shared dialog styling, not by changing feature behavior. |
| A6 — approved change | Same dialogs; all six | #28 keyboard requirements (Figma does not prove focus behavior) | Observations show Delete initially focuses Cancel; Archive/Discard focus Close, not their named safe footer action. Escape dismissed Delete/Archive during capture. Make the safe action explicit as approved. Tab trapping, reverse traversal, return focus, persistence after cancellation and replacement focus still need behavioral verification. |
| A7 — approved change | [Archive toast](evidence-index.md#archive-toast); all six | `2195:33750` and toast examples | App uses default bottom-right/bottom overlay with progress accent; reference is compact with a status icon and secondary action. Share approved presentation, distinguishing transient success from recovery. Do not infer new notifications/actions from an example. |
| A8 — approved change | [Login focus](evidence-index.md#login-keyboard-focus); all six | #28 exact focus sequence; login visual frames | Observed six stops: Email input → Forgot password? → Password input → Show password → Login → Sign Up. Recovery interrupts credentials. Correct DOM order to Email → Password → reveal → Login → Forgot → Sign Up, without positive tabindex. Observation is recorded independently of source. Enter submission/reverse order are not newly verified by this capture. |
| A9 — approved change | Editor / desktop search; source all layouts, rendered controls in editor/shell | #28 shortcut stories; no Figma behavior proof | No save/search shortcut handlers in inspected owners and no rendered shortcut hints. Implement specified modal-aware save and desktop-only search behavior through existing operations; don't claim keyboard behavior is proven by a screenshot. |
| I1 — intentional difference | [Login](evidence-index.md#login) / [signup](evidence-index.md#signup); all six | Paired account frames; `docs/registration.md` design notes | References contain Google sign-in; original product scope explicitly overrides it. Do not add OAuth or a dead Google button. Its omission changes panel height. |
| I2 — intentional difference | [Reset](evidence-index.md#reset-password), [invalid reset](evidence-index.md#reset-invalid), [check-email](evidence-index.md#check-email), [password settings](evidence-index.md#settings-password); all six | Paired reset/password frames; missing exact verification/error frames | App includes fresh-login-on-every-device warning, verification-required instructions, Request a new link and Back to login. Keep necessary safety/recovery information even where references omit it. Field validation and inline feedback stay local; shorter screenshot copy is not a removal authorization. |
| I3 — intentional difference | [Archived detail](evidence-index.md#archived-note); all six | Desktop/tablet/mobile archived detail pairs | Reference shows Save/Cancel and editable-looking fields. App exposes saved plain text, status and Restore/Delete, not editable Title/Save. Keep archived read-only until restoration. No archived-screen redesign authorized. |
| I4 — intentional difference | [Conflict recovery](evidence-index.md#conflict-recovery); all six | No exact reference; #28 recovery requirements | Failed stale save retains title/body and persistent warning with Reload; also an in-editor Reload entry point. Preserve recovery and dismissal/retry semantics; don't collapse into a short success-style message. |
| I5 — intentional difference | [Color](evidence-index.md#settings-color) / [font settings](evidence-index.md#settings-font); all six | Paired settings frames | App defaults to System, references select Light. Explicit font family names help identify local options. Different selected card and labels are not defects; preserve persistence and explicit Apply Changes. |
| P1 — additional proposal needing approval | [Account pages](evidence-index.md#login); all six, especially Dk | Paired account frames | Dark app panel is lighter than the outer page; reference uses the darker panel on a lighter dark surround. Light recovery panel heights/placement also differ with extra Back links/copy. **Proposal:** align AccountPanel surface roles and account-specific geometry only after approving this structural styling scope. Exclude intentional content/Google differences from any height target. No panel/layout changes here. |
| P2 — additional proposal needing approval | [Color](evidence-index.md#settings-color) / [font settings](evidence-index.md#settings-font); T L/Dk | `2236:9393`, `2254:17283`, `2236:9896`, `2254:17566` | Current cards/apply button stop at 528px, leaving a broad right gap; tablet reference cards span content width. Password settings already span tablet width. **Proposal:** make color/font width cap desktop-only, preserving narrow layout and explicit saving. This is a layout change beyond shared control defaults; wait for approval. |
| P3 — additional proposal needing approval | [Active list](evidence-index.md#note-list); T/M L/Dk | `2226:7223`, `2238:13286`, `2227:7443`, `2238:18397` | Current note row has inset padding; reference rows start closer to the content edge. Tablet bottom-nav labels sit beside icons rather than beneath as reference. **Proposal:** separately approve row alignment and tablet navigation label placement. Single-note test data does not establish multi-row density or scrolling parity; don't rebuild list controls mechanically. |
| G1 — reference gap | Check-email, invalid/reset failure, Discard, recovery; all six | None inspected for exact state | Current renders are available; exact state references are missing/unidentified. Use approved shared roles and preserve functional content, without pixel-parity claims. |
| G2 — reference gap | Exact tablet/mobile-dark dialogs; settings navigation, new-note variants, supplemental toast states | Catalog leads / historical docs only | Exact comparisons not completed. Captures exist; available Delete/Archive and settings/editor foundations support already-approved work. Request a specific missing frame only if an exact decision requires it. |
| G3 — reference gap | Replacement file; all states | Denied `2180:26977` | Replacement access is blocked; original access is independently successful. No decision in the approved concrete changes currently requires replacement-only inputs. |

## Verification and limits

Executed commands/results are recorded here, not inferred from historical docs:

| Check | Result |
|---|---|
| `pnpm typecheck` (baseline and after capture-harness changes) | Passed |
| `pnpm lint` and `pnpm exec eslint tests/design-audit.spec.ts` | Both passed |
| Isolated `playwright test tests/design-audit.spec.ts --reporter=line` with `DESIGN_AUDIT_OUTPUT` | Final run: 6 passed, 41.2s; 132 PNGs. Earlier exploratory captures were superseded after enabling settled-animation capture. |
| `pnpm test` | 14 files, 133 tests passed (Vitest unit/Nuxt/HTTP projects); not a browser-suite substitute |
| Full isolated `playwright test --reporter=line` | 72 passed, 6 capture-only journeys skipped as intended, 4.9m; all three responsive projects |

Independent read-only review compared this work with the starting commit and #28/#29:

- **Standards:** no findings; existing Nuxt/Playwright seam, feature locality and clear domain language retained.
- **Spec:** no findings; sampled evidence supports the findings, classifications and isolation claims. Reviewers did not rerun tests; executed validation above is from the implementation session.

Reproduce without touching a developer database:

```sh
APP_TEST_ORIGIN=http://127.0.0.1:3000 \
DESIGN_AUDIT_OUTPUT=/tmp/notes-design-audit \
pnpm exec tsx scripts/test-database.ts exec playwright test tests/design-audit.spec.ts --reporter=line
```

Requires the existing disposable local/test PostgreSQL cluster configured by `.env.test.local` (or an explicitly supplied test `DATABASE_URL`) and installed Playwright Chromium. Do not point the runner at a developer/production cluster. Normal regression runs skip the capture-only journeys unless opted in. Keep screenshots outside Git, using a new external output directory for each capture. To reproduce this historical before-change baseline, run the capture journey at audit commit `e2d119e` in a separate checkout; running the current branch captures the current UI instead. The written findings and browser observations remain committed.

Not completed by this audit: comprehensive accessibility verification, contrast measurements, screen-reader testing, full forward/reverse navigation for all forms, modal trapping/return verification, all loading/error/success/removed-note states in both themes, font preference variants beyond Inter, multi-note/long-content density, animation behavior, other browser engines, or precise breakpoint-edge checks beyond the captured widths. Existing regression tests may cover portions of these behaviors, but screenshots alone do not certify them. Exact search/tag reference comparison is outside this bounded screen baseline; existing navigation remains unchanged.

## Owner approval and handoff

P1, P2 and P3 are proposals only. Owner can approve/reject individually on #29 or in a linked follow-up; record any scope extension before implementing it. None blocks A1–A9, and no missing reference currently blocks those approved changes. Do not silently amend #28.

Implementation/final verification should reuse the capture journey into a separate directory, compare affected states with this baseline and available references, and add the behavior assertions from #28 at the already-confirmed rendered-app seam. Retain archived capabilities, small-screen header/settings logout, sidebar email, explicit saving and safety/recovery content throughout.
