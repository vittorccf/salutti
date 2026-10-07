import { Logo } from "@/components/brand/logo";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

async function simulatePaymentAction(formData: FormData) {
  "use server";
  const token = formData.get("token") as string;
  const link = await db.paymentLink.findUnique({
    where: { token },
    include: { charge: true },
  });
  if (!link) return;
  await db.charge.update({
    where: { id: link.chargeId },
    data: { status: "paid", paidAt: new Date() },
  });
  redirect(`/pay/${token}?ok=1`);
}

export default async function PublicPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { token } = await params;
  const { ok } = await searchParams;
  const link = await db.paymentLink.findUnique({
    where: { token },
    include: {
      charge: { include: { patient: true } },
      workspace: true,
    },
  });
  if (!link) notFound();
  const charge = link.charge;
  const t = await getTranslations("public.pay");
  const f = await getFormat();
  const label = labeler(await getTranslations("common.labels"));

  return (
    <main className="ds2-glow min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-[440px]">
        <CardHeader className="text-center">
          <Logo variant="symbol" size={48} className="mx-auto" />
          <CardTitle>{t("title", { workspace: link.workspace.name })}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-4 text-sm">
            <p>{t.rich("chargeFor", { name: charge.patient.fullName, strong: (chunks) => <strong>{chunks}</strong> })}</p>
            <p>{t("dueDate", { date: f.date(charge.dueDate) })}</p>
            <p className="text-page-title mt-2 tabular-nums">{f.money(charge.amount)}</p>
            <p className="text-muted-foreground">{t("method", { method: label("paymentMethod", charge.method ?? "pix") })}</p>
          </div>
          {charge.pixCopyPaste ? (
            <div>
              <p className="text-xs text-muted-foreground">{t("pixCopyPaste")}</p>
              <code className="block break-all rounded-md bg-muted p-2 text-xs">
                {charge.pixCopyPaste}
              </code>
            </div>
          ) : null}
          {charge.status === "paid" || ok ? (
            <div className="rounded-md bg-success/[.12] p-3 text-sm text-success-strong flex items-center gap-2" role="status">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> {t("confirmed")}
            </div>
          ) : (
            <form action={simulatePaymentAction}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" className="w-full">{t("simulate")}</Button>
            </form>
          )}
          <p className="text-xs text-muted-foreground text-center">
            {t("processedBy")}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
