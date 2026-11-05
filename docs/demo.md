# Portfolio demo specification

Status: agreed behavior; not yet implemented or deployed.

## Purpose and hosting

Expose Nuxt Notes as a public portfolio demo using Vercel Hobby and a dedicated Supabase Free project. Supabase supplies PostgreSQL only; retain Better Auth and application-owned Nuxt APIs.

Use `APP_ENV=demo` to select demo behavior. Normal local development retains registration and password management. Vercel's Production environment will use `APP_ENV=demo`; these are distinct settings.

Scope database credentials and reset secrets to Vercel Production. Preview deployments receive no database access until a separate preview database is explicitly provisioned. Database credentials must remain server-side.

## Accounts and access

- Permit exactly two permanent, preverified demo accounts.
- Publish their stable email/password pairs in `README.md` only; retain the normal login form without demo-entry buttons.
- Public demo passwords must be unique to this deployment and never reused elsewhere.
- Preserve account-level ownership: neither account can access the other's notes or tags.
- Visitors using the same account share its mutable data; this is not visitor-level privacy.
- Block registration, email verification/resend flows, password recovery, password reset, and password changes at server boundaries, and remove their demo UI entry points.
- No email service is required for demo access. Runtime configuration must explicitly support this rather than depend on local mail infrastructure.
- Adapt login abuse protection for shared public credentials. Retain visitor/IP-based controls and an overall safety ceiling; successful logins must not unnecessarily exhaust a tight shared-account allowance.

## Notes and baseline

Each account starts with three sample notes, with a different sample set for each account, and default appearance preferences.

Each account may retain at most **10 saved notes**, counting sample notes, active notes, and archived notes together. Deletion releases capacity; archiving does not. Editing an existing note remains allowed when full. Enforce capacity server-side safely under concurrent requests.

Visitors may create, edit, archive, restore, and permanently delete any of their account's notes, including samples. Retain existing destructive-action confirmations. An account can remain empty or full until the next reset.

Keep existing note-input and request-size limits; the capacity limit is additional protection, not a replacement.

## Daily demo reset

The reset boundary is **00:00 UTC daily**, not 24 hours after an individual login. A change made just before midnight may survive only briefly; visitors are not promised a full 24-hour session.

At each boundary:

- Restore each account's three sample notes and their tags.
- Remove visitor-created notes and all other visitor note/tag changes.
- Restore default appearance preferences.
- Invalidate existing demo sessions, including sessions created shortly before midnight.
- Keep account identities and published credentials unchanged.

Use an authenticated daily scheduled reset plus an authoritative server-side boundary check. Before permitting demo access after the boundary, ensure the reset is complete. If reset cannot complete safely, temporarily deny demo access rather than serve the previous day's state.

The reset must be atomic, safe to retry, and coordinated with concurrent login and protected requests across instances. A late scheduled invocation must not reset an already-reset day again. An old session must not write into the new day's state.

An expired session is rejected on its next server request and the visitor returns to login. Unsaved work may be lost; do not promise that an idle browser clears immediately at midnight.

## Demo notice

Display a full-width demo notice bar above the existing application header on desktop and mobile, on the demo login page and authenticated screens. This is the agreed meaning of "superbar" in the discussion, not an existing component name.

Suggested text:

> Shared demo · Don't enter personal information · Resets daily at 00:00 UTC

Do not display demo credentials in the notice or add account-entry buttons.

## Platform limitations

Official documentation checked during design:

- [Vercel Hobby cron scheduling](https://vercel.com/docs/cron-jobs/usage-and-pricing): daily jobs have hourly scheduling precision; a midnight job may run between 00:00 and 00:59 UTC. The request-time guard, not cron punctuality, enforces the boundary.
- [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs): configure a private `CRON_SECRET` and verify its bearer authorization header server-side. Reject requests when the secret is absent or invalid.
- [Supabase Free limitations](https://supabase.com/pricing): free projects can pause after one week of inactivity. Do not promise that scheduled traffic prevents pausing or that the free demo is always available.

## Implementation and validation considerations

These are engineering follow-ups, not existing capabilities:

- Support the explicit demo/no-mail configuration and safely provision verified accounts and their baseline.
- Validate Vercel/Supabase connection pooling, transaction behavior, TLS, trusted client-IP handling, and runtime compatibility.
- Apply committed database migrations through a controlled operator step, not every runtime startup.
- Test server-side restrictions through direct API requests, account isolation, concurrent quota enforcement, duplicate resets, missed scheduled runs, and reset/login/write races.
- Test the notice on desktop/mobile and expired-session handling with unsaved edits.
- Document deployment, provisioning, reset recovery, public credentials, and free-tier limitations before publishing the demo.

Runtime implementation, hosting provisioning, and deployment are outside this completed discussion.
