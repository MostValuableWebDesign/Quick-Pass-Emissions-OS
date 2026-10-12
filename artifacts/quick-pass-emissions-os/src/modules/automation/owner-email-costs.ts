// Replit Scheduled Deployment rates checked October 12, 2026.
export const OWNER_EMAIL_JOB_PRICE = {
  monthlyBaseUsd: 1,
  usdPerMillionComputeUnits: 3.2,
  exampleComputeUnitsPerRun: 50_000,
} as const;

export const ownerEmailCadenceExamples = [
  { cadence: "Every 5 minutes", runsPer30Days: 8640 },
  { cadence: "Every 15 minutes", runsPer30Days: 2880 },
  { cadence: "Hourly", runsPer30Days: 720 },
  { cadence: "Once daily", runsPer30Days: 30 },
] as const;

export function estimatedOwnerEmailScheduleCost(runsPer30Days: number) {
  if (!Number.isSafeInteger(runsPer30Days) || runsPer30Days < 0) {
    throw new RangeError("Run count must be a non-negative integer.");
  }

  const computeCost =
    (runsPer30Days *
      OWNER_EMAIL_JOB_PRICE.exampleComputeUnitsPerRun *
      OWNER_EMAIL_JOB_PRICE.usdPerMillionComputeUnits) /
    1_000_000;
  return OWNER_EMAIL_JOB_PRICE.monthlyBaseUsd + computeCost;
}
