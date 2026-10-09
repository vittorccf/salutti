import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getFormat, getTranslations } from "@/i18n/server";
import { paymentOutflow } from "@/lib/payables";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { saveSupplierAction } from "../_actions";
import { ensureDefaultCategories, requirePayables } from "../_lib";

type Supplier = Awaited<ReturnType<typeof loadSuppliers>>[number];
type Category = { id: string; name: string };

const loadSuppliers = (workspaceId: string) =>
  db.supplier.findMany({ where: { workspaceId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { defaultCategory: { select: { name: true } } } });

async function SupplierFields({ s, categories }: { s?: Supplier; categories: Category[] }) {
  const t = await getTranslations("payables.suppliers");
  const k = s?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor={`name-${k}`}>{t("name")}</Label>
        <Input id={`name-${k}`} name="name" required minLength={2} maxLength={120} defaultValue={s?.name ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`doc-${k}`}>{t("document")}</Label>
        <Input id={`doc-${k}`} name="document" inputMode="numeric" defaultValue={s?.document ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`email-${k}`}>{t("email")}</Label>
        <Input id={`email-${k}`} name="email" type="email" defaultValue={s?.email ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`phone-${k}`}>{t("phone")}</Label>
        <Input id={`phone-${k}`} name="phone" type="tel" defaultValue={s?.phone ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`pix-${k}`}>{t("pixKey")}</Label>
        <Input id={`pix-${k}`} name="pixKey" defaultValue={s?.pixKey ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`cat-${k}`}>{t("defaultCategory")}</Label>
        <Select id={`cat-${k}`} name="defaultCategoryId" defaultValue={s?.defaultCategoryId ?? ""}>
          <option value="">-</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`notes-${k}`}>{t("notes")}</Label>
        <Input id={`notes-${k}`} name="notes" maxLength={300} defaultValue={s?.notes ?? ""} />
      </div>
    </div>
  );
}

export default async function SuppliersPage() {
  const ctx = await requirePayables();
  const wsId = ctx.workspace.id;
  await ensureDefaultCategories(wsId);
  const [t, f, suppliers, categories, payments] = await Promise.all([
    getTranslations("payables.suppliers"),
    getFormat(),
    loadSuppliers(wsId),
    db.financeCategory.findMany({ where: { workspaceId: wsId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Gasto com cada fornecedor no ano corrente.
    db.payablePayment.findMany({
      where: { workspaceId: wsId, reversedAt: null, paidAt: { gte: parseDateOnly(`${dateKeySP().slice(0, 4)}-01-01`) } },
      include: { payable: { select: { supplierId: true } } },
    }),
  ]);
  const spent = new Map<string, number>();
  for (const p of payments) if (p.payable.supplierId) spent.set(p.payable.supplierId, (spent.get(p.payable.supplierId) ?? 0) + paymentOutflow(p));

  return (
    <div className="space-y-6">
      <Link href="/app/financeiro/pagar" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("back")}
      </Link>
      <header>
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("newTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveSupplierAction} resetOnSuccess className="space-y-3">
            <SupplierFields categories={categories} />
            <div className="flex justify-end">
              <Button type="submit">{t("create")}</Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      {suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {suppliers.map((s) => (
            <details key={s.id} className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="flex items-center gap-2 font-medium">
                  {s.name}
                  {!s.active ? <Badge variant="muted">{t("inactive")}</Badge> : null}
                </span>
                <span className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {s.defaultCategory ? <span>{s.defaultCategory.name}</span> : null}
                  <span className="tabular-nums">{t("spentYear", { amount: f.money((spent.get(s.id) ?? 0) / 100) })}</span>
                  <Link href={`/app/financeiro/pagar?status=all&supplier=${s.id}`} className="text-brand underline-offset-4 hover:underline">
                    {t("seeBills")}
                  </Link>
                </span>
              </summary>
              <div className="border-t p-4">
                <ActionForm action={saveSupplierAction} className="space-y-3">
                  <SupplierFields s={s} categories={categories} />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="active" defaultChecked={s.active} className="h-4 w-4 accent-primary" />
                      {t("active")}
                    </label>
                    <Button type="submit" variant="outline" size="sm">
                      {t("save")}
                    </Button>
                  </div>
                </ActionForm>
              </div>
            </details>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t("privacy")}</p>
    </div>
  );
}
