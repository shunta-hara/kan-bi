-- Sprint 4: SyncStatus enum と DataSource 同期ステータスカラムの追加

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('IDLE', 'SYNCING', 'OK', 'ERROR', 'REAUTH_REQUIRED');

-- AlterTable
ALTER TABLE "DataSource" ADD COLUMN "syncStatus" "SyncStatus" NOT NULL DEFAULT 'IDLE';
ALTER TABLE "DataSource" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "DataSource" ADD COLUMN "lastSyncError" TEXT;
