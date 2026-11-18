import "dotenv/config";
import { db } from "../src/lib/db";
import { executeStaffingJob } from "../src/modules/automation/staffing-job";

async function main() {
  try {
    const result = await executeStaffingJob(db, process.env, process.argv.slice(2));
    // Deliberately excludes recipient addresses, source rows and provider responses.
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error(
      "Staffing check failed. Review the protected alert status, storage identity and scheduler configuration.",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

void main();
