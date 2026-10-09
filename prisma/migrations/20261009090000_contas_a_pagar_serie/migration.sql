-- Série recorrente: dia âncora, regra de fim de semana/feriado e série sem fim; principal pago mantido na conta.
ALTER TABLE "Payable" ADD COLUMN "anchorDate" TIMESTAMP(3),
ADD COLUMN "weekendRule" TEXT,
ADD COLUMN "seriesOpenEnded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paidCents" INTEGER NOT NULL DEFAULT 0;

-- Contas já lançadas: principal pago a partir dos pagamentos válidos.
UPDATE "Payable" p
SET "paidCents" = COALESCE((SELECT SUM(x."principalCents") FROM "PayablePayment" x WHERE x."payableId" = p."id" AND x."reversedAt" IS NULL), 0);

-- Mesma posição duas vezes na série (ex.: "Gerar as próximas" com clique duplo) é recusada.
CREATE UNIQUE INDEX "Payable_seriesId_seriesIndex_key" ON "Payable"("seriesId", "seriesIndex");
