// Standing owner instruction applies to every dealership, including newly added partners.
// These are dealership contract terms, not the public station's $20 inspection price.
export const STANDARD_DEALERSHIP_TERMS = {
  defaultRateCents: 1500,
  termsDays: 30,
  taxBps: 0,
  termsReference:
    "Owner-authorized dealership terms: $15 per car, monthly billing, Net 30, 0% tax.",
} as const;
