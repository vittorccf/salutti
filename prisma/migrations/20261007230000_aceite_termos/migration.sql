-- Aceite dos Termos de Uso e da Política de Privacidade no cadastro (prova do aceite e da versão aceita).
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "termsVersion" TEXT;
