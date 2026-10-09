import Link from "next/link";
import { getTranslations } from "@/i18n/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalShell } from "../_components/portal-shell";

export const dynamic = "force-dynamic";

// Link antigo do portal (de antes da senha). O link sozinho não abre mais o portal nem cria senha:
// quem já tem senha entra pela tela de entrar; quem não tem pede um convite novo (o consultório vê a lista).
export default async function LegacyPortalLink() {
  const t = await getTranslations("portal.legacy");
  return (
    <PortalShell>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/portal/entrar" className="text-sm font-medium text-brand underline-offset-4 hover:underline">
            {t("login")}
          </Link>
        </CardContent>
      </Card>
    </PortalShell>
  );
}
