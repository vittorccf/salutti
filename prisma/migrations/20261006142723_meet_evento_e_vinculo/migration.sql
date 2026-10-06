-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "meetingEventId" TEXT,
ADD COLUMN     "meetingOwnerId" TEXT;

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "userId" TEXT;

-- Profissional criado nos primeiros passos é o próprio dono da conta (mesmo e-mail): vincula ao usuário.
UPDATE "Professional" p SET "userId" = u."id"
FROM "User" u, "Membership" m
WHERE p."userId" IS NULL AND lower(p."email") = lower(u."email")
  AND m."userId" = u."id" AND m."workspaceId" = p."workspaceId";
