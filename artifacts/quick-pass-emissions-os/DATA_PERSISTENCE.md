# Data persistence across builds and restarts

Every successful business Save writes to the PostgreSQL database selected by the server's
`DATABASE_URL`. Records, history, approved snapshots and automation state live there, not in
React state, `.next`, a generated build or a JSON file in the application checkout. Unsaved
form text is not a saved record. Rebuilds and restarts retain saved data **when the app keeps
using the same persistent database**.

Normal `dev` and `start` commands apply committed migrations using `prisma migrate deploy`
and verify storage before accepting traffic. They never reset, truncate, demo-seed or
bootstrap the database. Builds only generate application files and the Prisma client;
they do not migrate or modify business data. Use the workspace commands below.

## One-time setup and connection protection

1. Provision a persistent PostgreSQL database. Keep its `DATABASE_URL` in server secrets,
   available to both development restarts and subsequent builds/startup. Keep the existing
   authentication secret stable too. Never generate a fresh database as part of a build.
2. Run `pnpm --filter @workspace/quick-pass-emissions-os db:migrate`.
3. Run `pnpm --filter @workspace/quick-pass-emissions-os db:check`, or sign in as owner and
   open **Settings & audit → Data storage & recovery**. Record the permanent storage ID.
4. Set `EXPECTED_DATABASE_ID` to that ID in that environment's server secrets. Startup,
   migrations, backup, bootstrap, account recovery and the jobs CLI then refuse a missing
   or different identity instead of silently proceeding against a new database. Identity
   is a connection check, not a password or independent proof of record completeness.

Migration 007 creates the identity once and changes no existing business rows. Restoring a
complete backup retains that identity. Existing databases can adopt the pin after their
first migration. A pin is deliberately not guessed or shared across unrelated databases.
Always launch through the package scripts; direct `next`/Prisma commands bypass the operator
preflight. Do not use `db:dev`, `migrate reset`, `db push`, fixture truncation or a scaffold
Drizzle schema against business data during normal development, startup or updates.

## Replit preview versus published data

Replit's development preview and published app can connect to separate development and
production databases. Entering a record in one does not create it in the other. Use each
environment's own `DATABASE_URL`, storage ID pin and authentication settings. Do not point
destructive tests at either business environment, or copy illustrative demo records into
production. See [Replit's database environment guide](https://docs.replit.com/features/data-and-storage/development-and-production).

If records appear missing, stop entering replacement records, compare the storage ID with
the previously recorded one, and check the server secret/database selection. A code update
cannot recover records from a deleted database or from an earlier database checkpoint.
Restoring a Replit checkpoint may also roll back its associated development database; check
the checkpoint's database option and recovery instructions before restoring one.

## Full backups and safe recovery

Use provider-managed automated backups/point-in-time recovery for ongoing protection. This
repository cannot provision or verify that service merely by changing application code.
For a complete portable logical backup, install PostgreSQL client tools matching the server
(or a supported newer `pg_dump`) and set `PG_TOOLS_BIN` if they are outside `PATH`.

Set `DATA_BACKUP_DIR` to a **private persistent** backup directory, then run:

```sh
pnpm --filter @workspace/quick-pass-emissions-os db:backup
```

The command writes a unique, consistent PostgreSQL custom-format `.dump` containing all
tables, relations, audit history, approval snapshots, accounts and migration history. It
includes credential hashes/session data: restrict access and encrypt backups at rest using
your storage provider. Files are mode 0600, incomplete files are removed, and completed
backups are never overwritten or automatically pruned. Credentials do not appear in tool
arguments or diagnostics. Keep backups out of Git and chat attachments. Public and application build directories are
refused as backup destinations.

When `DATA_BACKUP_DIR` is configured, normal migrations/startup take a full backup **before
pending migrations**. A failed backup stops that migration/startup. With no pending migration,
restarts do not create duplicate backups. This is protection before schema updates, not a
scheduled backup of every save. Without this setting, safe migrations still run and the
database still persists; no local backup is claimed. A Replit deployment's ephemeral filesystem
is not persistent backup storage: use managed backups or copy private operator-created dumps
off the development workspace. Do not put production dumps in a public/download route.

To recover, provision a **separate empty** PostgreSQL database and privately set
`RESTORE_DATABASE_URL` to it. Leave `DATABASE_URL` pointing to the current database. Run:

```sh
pnpm --filter @workspace/quick-pass-emissions-os db:restore -- /private/path/quick-pass-backup.dump
```

Only restore trusted backups. The command refuses the current database and any target with
user tables/sequences/views. It uses one restore transaction, fails on the first error, and
never uses `--clean`, drops a database or overwrites an existing copy. A failed restore rolls
back its changes. Verify the recovered database in an isolated app: storage ID, migrations,
employee/task/audit counts, approvals, money/stock ledgers and sign-in. Switch `DATABASE_URL`
only after that verification and the owner's recovery decision; remove `RESTORE_DATABASE_URL`.
Do not restore while anyone else is using the recovery database.

## Verification

Database tests require a disposable `TEST_DATABASE_URL` ending in `_test`, permissions to
create/drop their uniquely generated recovery fixture database, and `pg_dump`/`pg_restore` in
`PATH` (or `PG_TOOLS_BIN`). The storage tests check identity/migration idempotency, fresh owner
authorization, complete all-table backup/restore equality, private permissions, wrong-target
refusal and incomplete-backup cleanup. They never truncate a business database. See
[VERIFICATION.md](VERIFICATION.md) for actual rebuild/restart results and remaining limits.

## Google Analytics source-cache exception

Analytics station mappings/grants, documented marketing observations, owner actions,
follow-up history, sync progress and encrypted OAuth credentials use the same persistent
PostgreSQL database. Preserve `GOOGLE_BUSINESS_ENCRYPTION_KEY` alongside the stable auth
and storage configuration. A build never clears or recreates these records. Google API
response content is deliberately temporary (29 days) under Google's current policy;
expired source responses are hidden and removed by the independent worker. Provider
content must be refetched when available; it is not a permanent business archive.
Keep backups containing this content for less than 30 days and purge expired caches
before serving a restored environment. See [GOOGLE_ANALYTICS.md](GOOGLE_ANALYTICS.md).
