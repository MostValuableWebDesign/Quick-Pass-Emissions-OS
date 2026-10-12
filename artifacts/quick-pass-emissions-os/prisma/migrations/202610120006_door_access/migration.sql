-- CreateTable
CREATE TABLE "DoorLock" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "online" BOOLEAN,
    "locked" BOOLEAN,
    "batteryPercent" INTEGER,
    "checkedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failure" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorAccessCode" (
    "id" TEXT NOT NULL,
    "doorId" TEXT NOT NULL,
    "employeeId" TEXT,
    "label" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "providerId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "replacesId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "desiredState" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitToken" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3),
    "revokeRequestedBy" TEXT,
    "revokeRequestedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failure" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorAccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DoorLock_deviceId_key" ON "DoorLock"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DoorAccessCode_providerRef_key" ON "DoorAccessCode"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "DoorAccessCode_providerId_key" ON "DoorAccessCode"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "DoorAccessCode_replacesId_key" ON "DoorAccessCode"("replacesId");

-- CreateIndex
CREATE INDEX "DoorAccessCode_status_nextCheckAt_idx" ON "DoorAccessCode"("status", "nextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoorAccessCode_doorId_fingerprint_key" ON "DoorAccessCode"("doorId", "fingerprint");

-- AddForeignKey
ALTER TABLE "DoorLock" ADD CONSTRAINT "DoorLock_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorAccessCode" ADD CONSTRAINT "DoorAccessCode_doorId_fkey" FOREIGN KEY ("doorId") REFERENCES "DoorLock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorAccessCode" ADD CONSTRAINT "DoorAccessCode_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorAccessCode" ADD CONSTRAINT "DoorAccessCode_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorAccessCode" ADD CONSTRAINT "DoorAccessCode_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "DoorAccessCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
