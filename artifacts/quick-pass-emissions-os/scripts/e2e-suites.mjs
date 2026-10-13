export function browserSuite(env) {
  if (env.E2E_TREND_ONLY === "1") return { "performance-trend.spec.ts": 1 };
  if (env.E2E_NAV_CLEANUP_ONLY === "1") return { "navigation-cleanup.spec.ts": 1 };
  if (env.E2E_BUSINESS_HOURS_ONLY === "1") return { "business-hours.spec.ts": 1 };
  if (env.E2E_GOOGLE_CONNECTED_ONLY === "1") return { "analytics-connected.spec.ts": 1 };
  if (env.E2E_ANALYTICS_ONLY === "1") return { "analytics.spec.ts": 2 };

  if (env.E2E_MARKETING_ONLY === "1") return { "marketing.spec.ts": 1 };
  if (env.E2E_DOOR_CONNECTED_ONLY === "1") return { "door-access-connected.spec.ts": 2 };
  if (env.E2E_DOOR_ACCESS_ONLY === "1") return { "door-access.spec.ts": 3 };
  if (env.E2E_OWNER_EMAIL_ONLY === "1") return { "owner-email.spec.ts": 2 };
  if (env.E2E_ADDRESSES_ONLY === "1") return { "addresses.spec.ts": 3 };
  if (env.E2E_SECURITY_ONLY === "1") return { "security.spec.ts": 3 };
  if (env.E2E_EMPLOYEES_ONLY === "1") return { "employee-entry.spec.ts": 1 };
  if (env.E2E_DEALERSHIPS_ONLY === "1") return { "dealership-entry.spec.ts": 1 };
  if (env.E2E_VENDOR_ONLY === "1") return { "vendor-entry.spec.ts": 1 };
  if (env.E2E_THEME_ONLY === "1") return { "theme.spec.ts": 1 };
  if (env.E2E_LOGIN_ONLY === "1") return { "login.spec.ts": 1 };
  if (env.E2E_NAVIGATION_ONLY === "1") return { "navigation.spec.ts": 2 };
  if (env.E2E_PERFORMANCE_PANELS === "1")
    return {
      "performance-panels.spec.ts": 2,
      ...(env.E2E_CERTIFICATE_UX === "1" ? { "certificate-portal-ux.spec.ts": 5 } : {}),
    };
  if (env.E2E_CERTIFICATE_UX === "1") return { "certificate-portal-ux.spec.ts": 5 };
  if (env.E2E_DAY_ONLY === "1") return { "navigation.spec.ts": 1 };
  if (env.E2E_PERFORMANCE_ONLY === "1") return { "performance.spec.ts": 2 };
  if (env.E2E_SUPPORT_ONLY === "1") return { "support.spec.ts": 1 };
  if (env.E2E_CERTIFICATES_ONLY === "1") return { "certificate-order.spec.ts": 4 };
  if (env.E2E_IMPORT_ONLY === "1" || env.E2E_STATION_ONLY === "1")
    return { "settings-pages-retired.spec.ts": 1 };
  return {
    "analytics.spec.ts": 2,

    "marketing.spec.ts": 1,
    "business-hours.spec.ts": 1,
    "navigation-cleanup.spec.ts": 1,
    "door-access.spec.ts": 3,
    "owner-email.spec.ts": 2,
    "addresses.spec.ts": 3,
    "login.spec.ts": 1,
    "theme.spec.ts": 1,
    "security.spec.ts": 3,
    "performance-panels.spec.ts": 2,
    "regression.spec.ts": 3,
    "navigation.spec.ts": 6,
    "operations.spec.ts": 3,
    "phase2.spec.ts": 1,
    "phase3.spec.ts": 1,
    "phase4.spec.ts": 1,
    "phase5.spec.ts": 2,
    ...(env.E2E_STATION_HISTORY === "1"
      ? { "settings-pages-retired.spec.ts": 1, "performance.spec.ts": 2 }
      : {}),
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
