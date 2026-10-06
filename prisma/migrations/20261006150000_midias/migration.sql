-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "photoId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarId" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "bannerId" TEXT,
ADD COLUMN     "brandDisplay" TEXT NOT NULL DEFAULT 'salutti';

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaFile_workspaceId_idx" ON "MediaFile"("workspaceId");

-- CreateIndex
CREATE INDEX "MediaFile_userId_idx" ON "MediaFile"("userId");
