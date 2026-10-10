export function assertOwnedDatabase(env) {
  const name = env.E2E_OWNED_DATABASE;
  if (
    !/^quick_pass_verify_[a-f0-9]{32}_test$/.test(name ?? "") ||
    !env.DATABASE_URL ||
    env.DATABASE_URL !== env.TEST_DATABASE_URL ||
    new URL(env.DATABASE_URL).pathname !== `/${name}` ||
    env.NODE_ENV === "production" ||
    !env.REPLIT_DEV_DOMAIN
  ) {
    throw new Error("Browser verification requires the runner-owned isolated database.");
  }
}

export function assertCompleteReport(report, expected = 3) {
  const stats = report?.stats;
  // Never count empty, skipped, flaky/retried, or interrupted coverage as passing.
  if (
    !stats ||
    stats.expected !== expected ||
    stats.unexpected !== 0 ||
    stats.skipped !== 0 ||
    stats.flaky !== 0 ||
    report.errors?.length
  ) {
    throw new Error(
      "Browser coverage incomplete: every expected regression check must pass without skips.",
    );
  }
}
