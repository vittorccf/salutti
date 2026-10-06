-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT;
