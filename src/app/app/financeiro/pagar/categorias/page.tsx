import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { CATEGORY_GROUPS } from "@/lib/payables";
import { getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { saveCategoryAction } from "../_actions";
import { ensureDefaultCategories, requirePayables } from "../_lib";

export default async function CategoriesPage() {
  const ctx = await requirePayables();
  const wsId = ctx.workspace.id;
  await ensureDefaultCategories(ctx.workspace);
  const [t, tg, categories, usage] = await Promise.all([
    getTranslations("payables.categories"),
    getTranslations("payables.groups"),
    db.financeCategory.findMany({ where: { workspaceId: wsId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.payable.groupBy({ by: ["categoryId"], where: { workspaceId: wsId }, _count: { _all: true } }),
  ]);
  const used = new Map(usage.map((u) => [u.categoryId, u._count._all]));

  const groupSelect = (id: string, value?: string) => (
    <Select id={id} name="group" defaultValue={value ?? "outros"}>
      {CATEGORY_GROUPS.map((g) => (
        <option key={g} value={g}>
          {tg(g)}
        </option>
      ))}
    </Select>
  );

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
          <CardDescription>{t("deductibleHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveCategoryAction} resetOnSuccess className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name-new">{t("name")}</Label>
              <Input id="cat-name-new" name="name" required minLength={2} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-group-new">{t("group")}</Label>
              {groupSelect("cat-group-new")}
            </div>
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" name="deductible" className="h-4 w-4 accent-primary" />
              {t("deductible")}
            </label>
            <Button type="submit">{t("create")}</Button>
          </ActionForm>
        </CardContent>
      </Card>

      {CATEGORY_GROUPS.map((g) => {
        const items = categories.filter((c) => c.group === g);
        if (!items.length) return null;
        return (
          <section key={g} aria-labelledby={`group-${g}`} className="space-y-2">
            <h2 id={`group-${g}`} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {tg(g)}
            </h2>
            <div className="divide-y rounded-xl border bg-card">
              {items.map((c) => (
                <ActionForm key={c.id} action={saveCategoryAction} className="grid items-center gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_200px_auto_auto_auto]">
                  <input type="hidden" name="id" value={c.id} />
                  <div className="flex items-center gap-2">
                    <Input name="name" aria-label={t("name")} required minLength={2} maxLength={80} defaultValue={c.name} />
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{t("usage", { count: used.get(c.id) ?? 0 })}</span>
                    {!c.active ? <Badge variant="muted">{t("inactive")}</Badge> : null}
                  </div>
                  {groupSelect(`cat-group-${c.id}`, c.group)}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="deductible" defaultChecked={c.deductible} className="h-4 w-4 accent-primary" />
                    {t("deductible")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={c.active} className="h-4 w-4 accent-primary" />
                    {t("active")}
                  </label>
                  <Button type="submit" variant="outline" size="sm">
                    {t("save")}
                  </Button>
                </ActionForm>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
