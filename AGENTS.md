# Instructions for future coding agents

## Scope and workflow

This is Quick Pass Business OS, currently Phases 1–2. Read README, ARCHITECTURE, BUSINESS_RULES, OPEN_QUESTIONS and VERIFICATION before changes. Inspect source and git status; preserve existing work. Do not implement Phases 3–5 without explicit authorization. Do not commit/push or deploy unless requested. Never treat sample data as business fact.

## Code conventions

Use strict TypeScript, Next.js App Router, React, Tailwind/CSS variables, reusable components, Prisma/PostgreSQL and Zod. Use the configured Prettier formatter. Add domain logic in src/modules; infrastructure belongs in src/lib; pages/actions coordinate services. Keep client components limited to interaction. Do not introduce vendor lock-in, proprietary storage, microservices or unnecessary global state. Pin dependencies and retain package-lock.json. Build/deploy uses npm and standard Node. Keep setup portable; no hardcoded machine paths.

## Security boundaries

Every protected read and mutation must authenticate on the server. Re-read current roles/active status; never rely on navigation visibility or stale client claims. Employees may access only their assigned tasks/own schedules and alerts. No employee directory, private manager notes, peer wages or future finance data. Only owners can manage privileged roles. No public signup or default production passwords. Invites are high-entropy, hashed, expiring, single-use and privately delivered. Do not log passwords, session tokens or raw invitations. Do not implement financial approvals by simply hiding buttons. Environment/secret management is mandatory.

Audit sensitive mutations in their transaction. Preserve record history; deactivate rather than delete employees/templates. Use version checks for concurrent task edits. Unique (templateId, occurrenceDate) is mandatory. Job triggers must authenticate and jobs must remain independently runnable, idempotent and observable. Do not schedule in a request-render path or browser.

## Business rules

All dates use America/New_York semantics from src/lib/time.ts. Preserve tested DST, month-end and leap-year behavior. Respect configured operating days and closures. Operating hours, compensation, commission attribution, certificate stock, vendors, dealer rates, rental amounts and financial balances are unverified until owner configuration. Never infer profit. Commission calculations require owner-authorized effective-dated personal attribution and independently approved sources. Preserve draft snapshots, approval separation, source freezes, exact-cent bounds, versioned corrections and certificate ledger locking. Read PHASE2.md. Store money as integer cents or exact decimals, not JavaScript floating-point currency. No bank credentials, SSNs, unsupervised ACH or unofficial state analyzer calls.

## Verification

Run npm run typecheck, npm run lint, npm run format:check, npm test and npm run build. Use meaningful tests for authorization, database persistence, lifecycle, recurrence and concurrency. Database tests require an explicitly isolated TEST_DATABASE_URL ending in _test and truncate fixtures. Playwright uses a local demo environment. Never silently count skipped tests as passing. Report exact checks and any remaining limitations. Add migrations; never edit an already-deployed migration or use destructive reset against business data. Review npm audit findings with their actual runtime exposure.
