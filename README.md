# Nuxt Notes

## Project introduction

Nuxt Notes is a private note-taking app where each user owns their notes and tags. Notes are not shared with other users.

- Create and edit notes with titles, plain-text content, and optional tags. Save changes explicitly.
- Search saved notes and browse them by tag.
- Archive notes to remove them from All Notes, then restore them when needed. Deleting a note is permanent.
- Choose light, dark, or system appearance and a preferred font, saved to your account.
- Access your notes through an email-verified account on desktop, tablet, or mobile.

Built with Nuxt 4, Vue 3, Nuxt UI, and Tailwind CSS, with Better Auth for authentication and PostgreSQL accessed through Drizzle ORM.

## Public portfolio demo

Use the ordinary email/password login form with either public account:

| Email              | Password    |
| ------------------ | ----------- |
| `demo1@email.test` | `password1` |
| `demo2@email.test` | `password2` |

**These passwords are intentionally public and demo-only. Never reuse them for any other account or service.** Everyone using the same account shares its notes and appearance settings; the two accounts have separate data. Do not enter personal, confidential, or sensitive information. Sessions can expire and unsaved work can be lost.

Demo mode disables registration, verification/resend, password recovery/reset, and password changes. Each account starts with three different sample notes and System/Inter appearance. Samples can be edited, archived, restored, and deleted like other notes.

### Operator provisioning (create-only)

Use a **dedicated demo database**, never a private application database. Inspect the target host/project and database name before proceeding. Provisioning is an explicit operator action, not a startup hook or public endpoint.

1. Apply the committed migrations to the selected database using `pnpm db:migrate` with an explicitly exported `DATABASE_URL`. Check `drizzle.config.ts` and your environment first; do not accidentally use a local `.env` target.
2. Export `APP_ENV=demo` and the dedicated `DATABASE_URL`. Set `DEMO_PASSWORD_1` and `DEMO_PASSWORD_2` to the corresponding public passwords in the table above. These variables are needed only for provisioning; do not add them to application runtime configuration.
3. Run `pnpm demo:provision --confirm-database <exact-database-name>`. The database name must match the URL's final path component (for example, `notes_demo` or `postgres`); this acknowledgement does not replace checking the host/project.
4. Configure runtime `APP_ENV=demo`, `APP_URL` (the application's origin), `DATABASE_URL`, and a unique private `APP_AUTH_SECRET` of at least 32 characters. Build/start normally. Demo mode explicitly selects no-mail behavior: neither `MAIL_MODE`, `MAILTRAP_URL`, a local inbox, nor outbound credentials are needed. Do not change `APP_ENV` to `test` to operate the demo.
5. Log in with both public accounts and confirm each has its own three sample notes. Do not run destructive automated tests against this database.

The procedure creates only the two designated identities, their password credentials, and their initial notes/preferences in one transaction. It does **not** delete unrelated accounts or admit them to the demo. It refuses address/identity collisions and changed credentials instead of adopting or repairing an existing account. Re-running with the same passwords preserves account IDs, sessions, deleted/edited samples, visitor-created notes, and appearance changes. A failure rolls back the entire provisioning transaction; investigate the target/configuration and retry, rather than deleting live data. The command intentionally does not load `.env` files automatically.

**Daily lifecycle:** apply the committed migrations before deploying. In demo mode, login and protected access restore both accounts atomically at the first request after **00:00 UTC**, even if no scheduled job ran. Old sessions are revoked; visitors return to login on their next protected request, and unsaved edits are not saved. Idle browsers are not cleared immediately. A durable completed-day record makes duplicate/late resets harmless, and multiple missed days require only one restoration. Account identities and credentials stay unchanged. Each account can retain ten saved notes, including samples and archives.

If restoration fails, demo access returns a temporary-unavailable response rather than yesterday's data. Check database availability, applied migrations, and both provisioned identities; correct the cause and retry login. The failed transaction changes neither account, and the next request safely retries restoration. Do not delete the lifecycle record or rerun provisioning as a reset workaround. Provisioning remains create-only.

The shared internal operation is `ensureDemoDay()` in `server/demo/lifecycle.ts`; the deployment ticket supplies its authenticated scheduled HTTP invocation and Vercel scheduling. There is no public manual-reset control. Demo login permits shared-account reuse without a per-email cap, while retaining 20 attempts/IP/hour and 500 attempts globally/hour in shared PostgreSQL state. A throttled visitor should wait before retrying. Hosted deployment and trusted client-IP validation remain follow-ups; see [login protection and proxy assumptions](docs/demo.md#implemented-shared-login-protection) and [lifecycle coordination](docs/demo.md#implemented-lifecycle-coordination).

### Demo checks

Follow the disposable PostgreSQL setup linked below. `pnpm test:http test/http/demo.test.ts test/http/demo-lifecycle.test.ts test/http/demo-login-limits.test.ts` tests the real Nuxt APIs with committed migrations in isolated data. `pnpm test:browser:demo` runs focused desktop/tablet/mobile journeys in demo mode against a disposable database without mail. Its test configuration alone mounts a lifecycle-control route and replaces the PostgreSQL clock; ordinary builds contain neither control. `pnpm test:browser` retains the normal non-demo journeys. Never point either test command at the public deployment.

## Local development setup

The app runs on your host machine. Docker Compose runs PostgreSQL and Mailtrap Local, which captures development email instead of delivering it to recipients.

### Prerequisites

- **Node.js 24** and **pnpm 12.14.0**, matching the versions used by CI.
- **Docker with Docker Compose**, with Docker running.
- **OpenSSL** to generate an authentication secret.
- Available local ports: **3000** (app), **5432** (PostgreSQL), and **3550** (local inbox).

Clone this repository and run the following commands from its root directory.

### 1. Install dependencies and start services

```bash
pnpm install
docker compose up -d --wait
```

Compose starts PostgreSQL 17 and Mailtrap Local. The first run downloads their images. No Mailtrap account, API key, or production email credentials are needed.

### 2. Configure the environment

For first-time setup, copy the example configuration. Skip this command if you already have a configured `.env` file:

```bash
cp .env.example .env
```

Generate a unique secret:

```bash
openssl rand -base64 48
```

Paste the generated value into `APP_AUTH_SECRET` in `.env`. The secret must be at least 32 characters long. Keep `.env` and its secrets out of version control.

The remaining example values work with the included Compose services:

| Variable       | Local value                                     |
| -------------- | ----------------------------------------------- |
| `APP_ENV`      | `development`                                   |
| `APP_URL`      | `http://localhost:3000`                         |
| `DATABASE_URL` | `postgres://user:password@127.0.0.1:5432/notes` |
| `MAIL_MODE`    | `local`                                         |
| `MAILTRAP_URL` | `http://127.0.0.1:3550`                         |

Leave `APP_TRUSTED_PROXY_IP` unset for direct local connections. If you change the database credentials or port in Compose, update `DATABASE_URL` to match.

An exported `DATABASE_URL` overrides the value in `.env`. If your shell already points to another database, unset it before continuing so migrations use your local configuration:

```bash
unset DATABASE_URL
```

### 3. Apply database migrations

```bash
pnpm db:migrate
```

This applies the repository's committed migrations. The app does not migrate the database automatically. You do not need to run `pnpm db:generate` for initial setup.

### 4. Start the app and verify your account

```bash
pnpm dev
```

1. Open [http://localhost:3000/signup](http://localhost:3000/signup) and register an account. You can use an address such as `developer@example.com`; local email is not sent externally.
2. Open the local inbox at [http://127.0.0.1:3550](http://127.0.0.1:3550) and follow the verification link in your captured email.
3. Log in at [http://localhost:3000/login](http://localhost:3000/login) to start taking notes.

Compose waits for PostgreSQL to become healthy, but Mailtrap has no readiness healthcheck. If the inbox is not available immediately, wait briefly and retry.

### 5. Stop local development

Stop the development server with `Ctrl+C`, then stop the services:

```bash
docker compose down
```

Your database and captured email remain in Docker volumes for the next session. **Do not add `-v` unless you intend to permanently delete both the local database and captured email.**

### Checks and further documentation

Run static checks with:

```bash
pnpm lint
pnpm typecheck
```

Before running tests, follow the [test database setup and isolation instructions](docs/registration.md#tests-and-isolation). Tests require explicit disposable PostgreSQL configuration; never point them at production.

- [Notes behavior](docs/notes.md)
- [Appearance settings](docs/appearance.md)
- [Registration and local infrastructure details](docs/registration.md#run-locally)
- [Authentication](docs/authentication.md)
