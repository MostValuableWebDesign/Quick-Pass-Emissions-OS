import type { PrismaClient } from "@prisma/client";
import { CATEGORIES } from "../src/modules/support/rules";

/** Synthetic contacts for the runner-owned, disposable browser database only. */
export async function supportBrowserFixtures(db: PrismaClient) {
  await db.vendor.createMany({
    data: [
      {
        name: "Filter Emissions Contact",
        contact: "Exhaust Fixture Desk",
        phone: "800-555-0110",
        email: "",
        reference: "",
        services: "Legacy fixture analyzer calibration",
        supportedServices: "Tailpipe fixture diagnostics",
        categories: [CATEGORIES[0]],
      },
      {
        name: "Filter Car Wash Contact",
        contact: "Wash Fixture Desk",
        phone: "800-555-0111",
        email: "",
        reference: "",
        services: "Legacy fixture wash support",
        supportedServices: "Hydraulic fixture cleaning",
        categories: [CATEGORIES[2]],
      },
      {
        name: "Filter Archived Contact",
        contact: "Archived Fixture Desk",
        phone: "800-555-0112",
        email: "",
        reference: "",
        services: "Legacy fixture wash support",
        categories: [CATEGORIES[2]],
        active: false,
      },
    ],
  });
}
