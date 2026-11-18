import "dotenv/config";
import { db } from "../src/lib/db";
import { checkStorage } from "../src/lib/storage";
import { applyStandardDealershipRate } from "../src/modules/finance/service";

async function main() {
  try {
    await checkStorage(db, process.env.EXPECTED_DATABASE_ID);
    const owners = await db.user.findMany({
      where: { role: "OWNER", active: true },
      select: { id: true },
      take: 2,
    });
    if (owners.length !== 1) throw new Error("A single active owner is required.");
    const result = await applyStandardDealershipRate(owners[0].id);
    console.log(
      `Configured ${result.updated} of ${result.total} dealerships at $15 per car. Existing invoices were not changed.`,
    );
  } catch {
    console.error("Dealership rate setup could not be completed. No reset was attempted.");
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
void main();
