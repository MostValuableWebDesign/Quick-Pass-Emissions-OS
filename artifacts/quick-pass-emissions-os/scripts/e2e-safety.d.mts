export function isolatedDatabaseEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  url: string,
): Record<string, string | undefined>;
export function assertOwnedDatabase(env: Readonly<Record<string, string | undefined>>): void;
export function assertCompleteReport(report: unknown, expected?: number): void;
