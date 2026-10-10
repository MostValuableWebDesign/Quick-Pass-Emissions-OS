import { describe, expect, it } from "vitest";
import { backupDatabase, databaseUrl, postgresEnvironment } from "../src/lib/database-maintenance";

describe("PostgreSQL storage configuration", () => {
  it("refuses backup files in public or build output", async () => {
    for (const DATA_BACKUP_DIR of ["public", "public/backups", ".next/static/backups"])
      await expect(
        backupDatabase("postgresql://localhost/fixture", { ...process.env, DATA_BACKUP_DIR }),
      ).rejects.toThrow("outside public");
  });
  it("rejects missing, file and in-memory database connections without exposing input", () => {
    for (const value of [undefined, "file:./data.db", "memory://private", "secret-input"])
      expect(() => databaseUrl(value)).toThrow("Configure a persistent PostgreSQL");
  });

  it("translates credentials and TLS to private libpq environment, ignoring stale PG settings", () => {
    const env = postgresEnvironment(
      "postgresql://operator:p%40ssword@db.example.test:5433/business?schema=public&sslmode=verify-full&sslrootcert=%2Fprivate%2Fca.pem&connection_limit=3",
      {
        NODE_ENV: "test",
        PATH: "/bin",
        PGHOST: "wrong",
        PGPASSWORD: "stale",
        PGSSLMODE: "disable",
      },
    );
    expect(env).toMatchObject({
      PATH: "/bin",
      PGHOST: "db.example.test",
      PGPORT: "5433",
      PGUSER: "operator",
      PGPASSWORD: "p@ssword",
      PGDATABASE: "business",
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: "/private/ca.pem",
    });
    expect(env.PGDATABASE).not.toContain("postgresql:");
    expect(env.schema).toBeUndefined();
  });
});
