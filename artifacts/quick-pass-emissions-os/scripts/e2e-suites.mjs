export function browserSuite(env) {
  if (env.E2E_PERFORMANCE_PANELS === "1") return {
    "performance-panels.spec.ts": 1,
    ...(env.E2E_CERTIFICATE_UX === "1" ? { "certificate-portal-ux.spec.ts": 5 } : {}),
  };
  if (env.E2E_CERTIFICATE_UX === "1") return { "certificate-portal-ux.spec.ts": 5 };
  if (env.E2E_DAY_ONLY === "1") return { "navigation.spec.ts": 1 };
  if (env.E2E_PERFORMANCE_ONLY === "1") return { "performance.spec.ts": 2 };
  if (env.E2E_SUPPORT_ONLY === "1") return { "support.spec.ts": 1 };
  if (env.E2E_CERTIFICATES_ONLY === "1") return { "certificate-order.spec.ts": 4 };
  if (env.E2E_IMPORT_ONLY === "1") return { "business-import.spec.ts": 1 };
  if (env.E2E_STATION_ONLY === "1") return { "station.spec.ts": 1 };
  return {
    "regression.spec.ts": 3,
    "navigation.spec.ts": 6,
    "operations.spec.ts": 3,
    "phase2.spec.ts": 1,
    "phase3.spec.ts": 1,
    "phase4.spec.ts": 1,
    "phase5.spec.ts": 2,
    ...(env.E2E_STATION_HISTORY === "1" ? { "station.spec.ts": 2, "performance.spec.ts": 2 } : {}),
  };
}
export function assertSuiteReport(report, suite) {
  const actual = {};
  function visit(node, file) {
    file = (node.file ?? file)?.split(/[\\/]/).at(-1);
    for (const spec of node.specs ?? [])
      actual[file] = (actual[file] ?? 0) + (spec.tests?.length ?? 0);
    for (const child of node.suites ?? []) visit(child, file);
  }
  visit(report);
  if (
    Object.keys(actual).length !== Object.keys(suite).length ||
    Object.entries(suite).some(([file, count]) => actual[file] !== count)
  ) {
    throw new Error("Browser report omitted or changed a required workflow suite.");
  }
}
