-- Login com Google: conta pode não ter senha; vínculo pelo "sub" da conta Google.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;
ALTER TABLE "User" ADD COLUMN "googleEmail" TEXT;
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
