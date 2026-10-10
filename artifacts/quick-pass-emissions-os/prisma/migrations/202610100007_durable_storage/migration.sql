CREATE TABLE "DataStore" (
    "id" TEXT NOT NULL DEFAULT 'business',
    "instanceId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataStore_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DataStore_singleton" CHECK ("id" = 'business')
);
CREATE UNIQUE INDEX "DataStore_instanceId_key" ON "DataStore"("instanceId");
INSERT INTO "DataStore" ("id") VALUES ('business');
