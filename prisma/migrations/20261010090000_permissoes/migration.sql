-- AlterTable
ALTER TABLE "BackofficeUser" ADD COLUMN     "permsDenied" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "permsGranted" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "permsDenied" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "permsGranted" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "entitlementNote" TEXT,
ADD COLUMN     "maxPatients" INTEGER,
ADD COLUMN     "maxProfessionals" INTEGER,
ADD COLUMN     "modulesAdded" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "modulesRemoved" TEXT[] DEFAULT ARRAY[]::TEXT[];

