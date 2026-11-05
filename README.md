# Nuxt Notes

## Project introduction

Nuxt Notes is a private note-taking app where each user owns their notes and tags. Notes are not shared with other users.

- Create and edit notes with titles, plain-text content, and optional tags. Save changes explicitly.
- Search saved notes and browse them by tag.
- Archive notes to remove them from All Notes, then restore them when needed. Deleting a note is permanent.
- Choose light, dark, or system appearance and a preferred font, saved to your account.
- Access your notes through an email-verified account on desktop, tablet, or mobile.

Built with Nuxt 4, Vue 3, Nuxt UI, and Tailwind CSS, with Better Auth for authentication and PostgreSQL accessed through Drizzle ORM.

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

| Variable | Local value |
| --- | --- |
| `APP_ENV` | `development` |
| `APP_URL` | `http://localhost:3000` |
| `DATABASE_URL` | `postgres://user:password@127.0.0.1:5432/notes` |
| `MAIL_MODE` | `local` |
| `MAILTRAP_URL` | `http://127.0.0.1:3550` |

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
