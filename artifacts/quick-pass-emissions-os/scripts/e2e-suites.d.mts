export function browserSuite(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, number>;
export function assertSuiteReport(report: unknown, suite: Record<string, number>): void;
