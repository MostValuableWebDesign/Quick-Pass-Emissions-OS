# Quick Pass Business OS

Phases 1–5 of the business app live in `artifacts/quick-pass-emissions-os`. Read its
`AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `BUSINESS_RULES.md`, `OPEN_QUESTIONS.md`,
`VERIFICATION.md` and phase guides before editing. Preserve shared Git history, commit/push
verified changes normally, and do not deploy without the user's request.

## Run and operate

- `pnpm install --frozen-lockfile` — install the full workspace.
- `pnpm --filter @workspace/quick-pass-emissions-os db:generate` — generate Prisma client.
- `pnpm --filter @workspace/quick-pass-emissions-os dev` — safe migrations/check, then preview.
- `pnpm run build:app` — build application files; does not reset or seed the database.
- `pnpm --filter @workspace/quick-pass-emissions-os start` — safe migrations/check, then server.
- `pnpm --filter @workspace/quick-pass-emissions-os db:check` — show permanent storage ID.
- `pnpm --filter @workspace/quick-pass-emissions-os db:backup` — private full backup when configured.
- `pnpm run typecheck` — full workspace typecheck; app lint/format/tests use its filter.
- `pnpm --filter @workspace/quick-pass-emissions-os test:isolated` — disposable fixtures only.

## Persistent business data

The actual business app uses **Next.js, Better Auth and Prisma/PostgreSQL**, with schema and
additive migrations under `artifacts/quick-pass-emissions-os/prisma`. Keep `DATABASE_URL` in
server secrets pointing to the same persistent database across updates/restarts. Saved data
is separate from build output. Never recreate a database, seed over records, run reset/push
commands or replace this app's schema with the scaffold `lib/db` Drizzle schema.

Set `EXPECTED_DATABASE_ID` after the first migration to refuse unintended database switches.
Replit development and production databases have separate data/IDs. Configure managed
backups; optional `DATA_BACKUP_DIR` enables a required backup before pending migrations and
manual complete dumps. Deployment filesystems are not durable backup storage. Full setup,
restore guards and environment troubleshooting: [DATA_PERSISTENCE.md](artifacts/quick-pass-emissions-os/DATA_PERSISTENCE.md).

## Workspace map

- Business UI/services/auth: `artifacts/quick-pass-emissions-os/src`.
- Managed web workflow: `artifacts/quick-pass-emissions-os: web`, manifest in its `.replit-artifact`.
- `artifacts/api-server`, `artifacts/mockup-sandbox`, `lib/db`, API spec/codegen and client packages
  are separate workspace scaffolds. They do not own the business app's persisted records.
- Root README documents synchronization and workspace installation. Do not force-push or
  commit private environment files, database dumps, generated builds or verification fixtures.
