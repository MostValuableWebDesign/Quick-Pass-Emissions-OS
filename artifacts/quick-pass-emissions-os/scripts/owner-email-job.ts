import "dotenv/config";
import { db } from "../src/lib/db";
import { runOwnerEmails } from "../src/modules/automation/owner-email";

async function run() {
  try {
    const result = await runOwnerEmails();
    if (!result.configured) {
      console.error("Resend and the public app URL are not configured; no owner email was sent.");
      process.exitCode = 1;
    } else {
      console.log(
        `Owner email job complete: ${result.accepted} provider-accepted, ${result.failed} failed.`,
      );
      if (result.failed) process.exitCode = 1;
    }
  } catch {
    console.error("Owner email job failed. Review the protected email history and scheduler logs.");
    process.exitCode = 1;
  } finally {
    await db.$disconnect().catch(() => {
      console.error("Owner email job could not close its database connection.");
      process.exitCode = 1;
    });
  }
}

void run();
