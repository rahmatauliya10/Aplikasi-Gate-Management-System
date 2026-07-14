-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SECURITY', 'WAREHOUSE', 'QC');

-- CreateEnum
CREATE TYPE "ProcessType" AS ENUM ('GBB', 'GBJ', 'GSP');

-- CreateEnum
CREATE TYPE "CargoProcessType" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WeighbridgeType" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "WarehouseUnit" AS ENUM ('KG', 'PCS', 'BAG', 'ROLL', 'PALLET');

-- CreateEnum
CREATE TYPE "WarehouseCondition" AS ENUM ('GOOD', 'DAMAGED', 'HOLD', 'PARTIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('REGISTERED', 'WEIGH_IN_DONE', 'QC_VEHICLE_PENDING', 'QC_VEHICLE_IN_PROGRESS', 'QC_VEHICLE_PASSED', 'QC_VEHICLE_REJECTED', 'WAREHOUSE_IN_PROGRESS', 'WAREHOUSE_DONE', 'INCOMING_CHECK_PENDING', 'INCOMING_CHECK_IN_PROGRESS', 'INCOMING_CHECK_PASSED', 'INCOMING_CHECK_REJECTED', 'WEIGH_OUT_DONE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QcType" AS ENUM ('VEHICLE_CHECK', 'INCOMING_CHECK');

-- CreateEnum
CREATE TYPE "QcResult" AS ENUM ('PASS', 'REJECT');

-- CreateEnum
CREATE TYPE "CheckResult" AS ENUM ('PASS', 'REJECT', 'NA');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('PHOTO', 'DOCUMENT', 'SAMPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('PENDING_DATA', 'SAFE', 'WARNING', 'CRITICAL', 'INVALID_DATA');

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('INFO', 'WARNING', 'FRAUD_ALERT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AnnouncementLocation" AS ENUM ('ALL_PAGES', 'DASHBOARD', 'GATE', 'WEIGHBRIDGE', 'WAREHOUSE', 'QC');

-- CreateEnum
CREATE TYPE "AnnouncementSpeed" AS ENUM ('SLOW', 'NORMAL', 'FAST');

-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "refreshTokenHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWarehouseAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "processType" "ProcessType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWarehouseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "transactionNumber" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "processType" "ProcessType" NOT NULL,
    "cargoType" TEXT NOT NULL,
    "cargoSubType" TEXT,
    "cargoProcessType" "CargoProcessType" NOT NULL,
    "suratJalanNumber" TEXT,
    "poNumber" TEXT,
    "permitCardNumber" TEXT,
    "guestIdNumber" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'REGISTERED',
    "gateInAt" TIMESTAMP(3),
    "gateOutAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "remarks" TEXT,
    "grossWeight" DOUBLE PRECISION,
    "tareWeight" DOUBLE PRECISION,
    "netWeight" DOUBLE PRECISION,
    "weighInAt" TIMESTAMP(3),
    "weighOutAt" TIMESTAMP(3),
    "weighInById" TEXT,
    "weighOutById" TEXT,
    "warehouseStartAt" TIMESTAMP(3),
    "warehouseEndAt" TIMESTAMP(3),
    "warehouseStartById" TEXT,
    "warehouseEndById" TEXT,
    "actualWeight" DOUBLE PRECISION,
    "actualQuantity" INTEGER,
    "warehouseUnit" "WarehouseUnit",
    "qcStartAt" TIMESTAMP(3),
    "qcEndAt" TIMESTAMP(3),
    "qcAnalysisCompleted" BOOLEAN NOT NULL DEFAULT false,
    "qcAnalysisCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionStatusHistory" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "oldStatus" "TransactionStatus",
    "newStatus" "TransactionStatus" NOT NULL,
    "changedById" TEXT,
    "notes" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeighbridgeRecord" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "type" "WeighbridgeType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "ticketNumber" TEXT,
    "operatorId" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeighbridgeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseProcess" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "processType" "ProcessType" NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "startById" TEXT,
    "endById" TEXT,
    "actualWeight" DOUBLE PRECISION,
    "actualQuantity" INTEGER,
    "unit" "WarehouseUnit",
    "palletCount" INTEGER,
    "bagCount" INTEGER,
    "rollCount" INTEGER,
    "condition" "WarehouseCondition",
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcVehicleCheck" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "result" "QcResult",
    "vehicleCleanliness" "CheckResult",
    "vehicleOdor" "CheckResult",
    "pestEvidence" "CheckResult",
    "vehicleCondition" "CheckResult",
    "documentCompleteness" "CheckResult",
    "sealCondition" "CheckResult",
    "notes" TEXT,
    "checklistItems" JSONB,
    "checkedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QcVehicleCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingMaterialCheck" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "result" "QcResult",
    "odor" "CheckResult",
    "color" "CheckResult",
    "moisture" DOUBLE PRECISION,
    "foreignMatter" DOUBLE PRECISION,
    "beanCondition" "CheckResult",
    "sampleWeight" DOUBLE PRECISION,
    "itemCondition" "CheckResult",
    "packagingCondition" "CheckResult",
    "quantityCheck" "CheckResult",
    "documentCheck" "CheckResult",
    "visualInspection" "CheckResult",
    "defectNotes" TEXT,
    "notes" TEXT,
    "checklistItems" JSONB,
    "checkedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingMaterialCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "attachmentType" "AttachmentType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "description" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudCheck" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "netWeight" DOUBLE PRECISION,
    "warehouseActualWeight" DOUBLE PRECISION,
    "deviationKg" DOUBLE PRECISION,
    "deviationPercent" DOUBLE PRECISION,
    "riskLevel" "RiskLevel" NOT NULL,
    "riskReason" TEXT,
    "isAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgementRemarks" TEXT,
    "calculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "status" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL DEFAULT 'INFO',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'ACTIVE',
    "location" "AnnouncementLocation" NOT NULL DEFAULT 'ALL_PAGES',
    "speed" "AnnouncementSpeed" NOT NULL DEFAULT 'NORMAL',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "textColor" TEXT,
    "backgroundColor" TEXT,
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserWarehouseAccess_userId_processType_key" ON "UserWarehouseAccess"("userId", "processType");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transactionNumber_key" ON "Transaction"("transactionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- AddForeignKey
ALTER TABLE "UserWarehouseAccess" ADD CONSTRAINT "UserWarehouseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_weighInById_fkey" FOREIGN KEY ("weighInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_weighOutById_fkey" FOREIGN KEY ("weighOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_warehouseStartById_fkey" FOREIGN KEY ("warehouseStartById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_warehouseEndById_fkey" FOREIGN KEY ("warehouseEndById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionStatusHistory" ADD CONSTRAINT "TransactionStatusHistory_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeighbridgeRecord" ADD CONSTRAINT "WeighbridgeRecord_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseProcess" ADD CONSTRAINT "WarehouseProcess_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseProcess" ADD CONSTRAINT "WarehouseProcess_startById_fkey" FOREIGN KEY ("startById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseProcess" ADD CONSTRAINT "WarehouseProcess_endById_fkey" FOREIGN KEY ("endById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcVehicleCheck" ADD CONSTRAINT "QcVehicleCheck_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcVehicleCheck" ADD CONSTRAINT "QcVehicleCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingMaterialCheck" ADD CONSTRAINT "IncomingMaterialCheck_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingMaterialCheck" ADD CONSTRAINT "IncomingMaterialCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudCheck" ADD CONSTRAINT "FraudCheck_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudCheck" ADD CONSTRAINT "FraudCheck_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
