export function isolatedDatabaseEnvironment(env, url) {
  if (!new URL(url).pathname.endsWith("_test") || url === env.DATABASE_URL)
    throw new Error("Verification must use a separate isolated test database.");
  return {
    ...env,
    DATABASE_URL: url,
    TEST_DATABASE_URL: url,
    EXPECTED_DATABASE_ID: "",
    DATA_BACKUP_DIR: "",
    RESTORE_DATABASE_URL: "",
  };
}

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

export function assertCompleteReport(report) {
  const stats = report?.stats;
  // Never count empty, skipped, flaky/retried, or interrupted coverage as passing.
  if (
    !stats ||
    stats.expected !== 3 ||
    stats.unexpected !== 0 ||
    stats.skipped !== 0 ||
    stats.flaky !== 0 ||
    report.errors?.length
  ) {
    throw new Error(
      "Browser coverage incomplete: all three regression checks must pass without skips.",
    );
  }
}
