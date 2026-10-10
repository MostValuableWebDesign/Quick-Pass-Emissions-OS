import "dotenv/config";
import { db } from "../src/lib/db";
import { runJobs } from "../src/modules/tasks/jobs";
runJobs()
  .then(console.log)
  .catch(() => {
    console.error("Operations check failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
