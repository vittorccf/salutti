// Ficha da paciente na Salutti Estética: histórico de procedimentos (com insumos e lotes aplicados) e fotos
// clínicas (antes/durante/depois). Só para a equipe clínica: quem chama confere canSeeClinical.
import Link from "next/link";
import { Camera, History, Trash2, Undo2 } from "lucide-react";
import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/media";
import { dateKeySP } from "@/lib/dates";
import { groupPhotos, PHOTO_STAGES } from "@/lib/procedures";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { ImageUpload } from "@/components/forms/image-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { removeClinicalPhotoAction, revokeMarketingAction, uploadClinicalPhotoAction } from "../_actions";

export async function PatientAesthetics({ workspaceId, patientId, uploaded }: { workspaceId: string; patientId: string; uploaded: boolean }) {
  const [t, ts, f] = await Promise.all([getTranslations("aesthetics.patient"), getTranslations("aesthetics.stages"), getFormat()]);
  const [sessions, uses, photos, procedures] = await Promise.all([
    db.appointment.findMany({
      where: { workspaceId, patientId, procedureId: { not: null } },
      orderBy: { startsAt: "desc" },
      take: 50,
    }),
    db.stockMovement.findMany({
      where: { workspaceId, patientId, kind: { in: ["uso", "estorno"] } },
      include: { lot: true, product: true },
      orderBy: { createdAt: "asc" },
    }),
    db.clinicalPhoto.findMany({ where: { workspaceId, patientId, removedAt: null }, orderBy: { takenAt: "desc" } }),
    db.procedure.findMany({ where: { workspaceId }, select: { id: true, name: true, active: true }, orderBy: { name: "asc" } }),
  ]);
  const procedureName = new Map(procedures.map((p) => [p.id, p.name]));
  const usesBySession = new Map<string, typeof uses>();
  for (const u of uses) if (u.appointmentId) usesBySession.set(u.appointmentId, [...(usesBySession.get(u.appointmentId) ?? []), u]);
  const groups = groupPhotos(photos);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-brand" aria-hidden /> {t("historyTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>{t("date")}</TH>
                <TH>{t("procedure")}</TH>
                <TH>{t("supplies")}</TH>
              </TR>
            </THead>
            <TBody>
              {sessions.length === 0 ? (
                <TR>
                  <TD colSpan={3} className="text-center text-muted-foreground">
                    {t("historyEmpty")}
                  </TD>
                </TR>
              ) : (
                sessions.map((a) => {
                  const lines = usesBySession.get(a.id) ?? [];
                  return (
                    <TR key={a.id}>
                      <TD className="whitespace-nowrap align-top">
                        <Link href={`/app/agenda/${a.id}`} className="text-brand underline-offset-4 hover:underline">
                          {f.dateTime(a.startsAt)}
                        </Link>
                      </TD>
                      <TD className="align-top">
                        {procedureName.get(a.procedureId ?? "") ?? "-"} <StatusBadge kind="appointment" status={a.status} />
                      </TD>
                      <TD className="align-top text-sm">
                        {lines.length === 0 ? (
                          <span className="text-muted-foreground">{t("notRecorded")}</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {lines.map((u) => (
                              <li key={u.id} className={u.kind === "estorno" ? "text-muted-foreground" : undefined}>
                                {u.kind === "estorno" ? `${t("reversed")}: ` : null}
                                {t("supplyLine", {
                                  product: u.product.name,
                                  quantity: f.number(Math.abs(u.quantity)),
                                  unit: u.product.unit,
                                  lot: u.lot?.lotNumber ?? "-",
                                  expires: u.lot ? f.date(u.lot.expiresAt) : "-",
                                })}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card id="fotos-clinicas">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-brand" aria-hidden /> {t("photosTitle")}
          </CardTitle>
          <CardDescription>{t("photosDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {uploaded ? (
            <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
              {t("uploaded")}
            </p>
          ) : null}

          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("photosEmpty")}</p>
          ) : (
            groups.map((g) => {
              const stages = PHOTO_STAGES.filter((s) => s !== "durante" || g.stages.durante.length > 0);
              return (
                <section key={g.procedureId ?? "none"} className="space-y-2">
                  <h3 className="text-sm font-medium">{g.procedureId ? procedureName.get(g.procedureId) ?? "-" : t("noProcedure")}</h3>
                  <div className={`grid gap-3 ${stages.length === 3 ? "sm:grid-cols-3" : "grid-cols-2"}`}>
                    {stages.map((stage) => (
                      <div key={stage} className="space-y-2">
                        <p className="text-overline text-muted-foreground">{ts(stage)}</p>
                        {g.stages[stage].length === 0 ? (
                          <div className="grid aspect-square place-content-center rounded-md border border-dashed text-xs text-muted-foreground">
                            {t("noPhotoStage")}
                          </div>
                        ) : (
                          g.stages[stage].map((p) => (
                            <figure key={p.id} className="space-y-1">
                              {/* eslint-disable-next-line @next/next/no-img-element -- imagem privada servida por /api/media */}
                              <img
                                src={mediaUrl(p.mediaId) ?? ""}
                                alt={t("photoAlt", { stage: ts(stage), date: f.date(p.takenAt) })}
                                className="aspect-square w-full rounded-md border object-cover"
                                loading="lazy"
                              />
                              <figcaption className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                <span>{f.date(p.takenAt)}</span>
                                {p.region ? <span>· {p.region}</span> : null}
                                {p.allowMarketing ? <Badge variant="muted">{t("marketingAllowed")}</Badge> : null}
                              </figcaption>
                              {p.allowMarketing ? (
                                <form action={revokeMarketingAction}>
                                  <input type="hidden" name="id" value={p.id} />
                                  <Button type="submit" variant="link" size="sm" className="h-auto p-0 text-xs">
                                    <Undo2 className="h-3.5 w-3.5" aria-hidden /> {t("revokeMarketing")}
                                  </Button>
                                </form>
                              ) : null}
                              {/* Remoção lógica com motivo: a foto sai da ficha, o registro fica no prontuário. */}
                              <details className="text-xs">
                                <summary className="flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground">
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t("remove")}
                                  <span className="sr-only">
                                    ({ts(stage)}, {f.date(p.takenAt)})
                                  </span>
                                </summary>
                                <form action={removeClinicalPhotoAction} className="mt-2 flex gap-2">
                                  <input type="hidden" name="id" value={p.id} />
                                  <Label htmlFor={`remove-reason-${p.id}`} className="sr-only">
                                    {t("removeReason")}
                                  </Label>
                                  <Input
                                    id={`remove-reason-${p.id}`}
                                    name="reason"
                                    required
                                    maxLength={300}
                                    placeholder={t("removeReason")}
                                    className="h-8 text-xs"
                                  />
                                  <Button type="submit" variant="outline" size="sm" className="h-8">
                                    {t("removeConfirm")}
                                  </Button>
                                </form>
                                <p className="mt-1 text-muted-foreground">{t("removeHint")}</p>
                              </details>
                            </figure>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}

          <ActionForm action={uploadClinicalPhotoAction} className="space-y-3 rounded-xl border p-4">
            <input type="hidden" name="patientId" value={patientId} />
            <ImageUpload name="photo" label={t("photo")} shape="clinical" hint={t("photoHint")} consentLabel={t("clinicalConsent")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="photo-stage">{t("stage")}</Label>
                <Select id="photo-stage" name="stage" defaultValue="antes">
                  {PHOTO_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {ts(s)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="photo-procedure">{t("procedure")}</Label>
                <Select id="photo-procedure" name="procedureId" defaultValue="">
                  <option value="">{t("noProcedure")}</option>
                  {procedures
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="photo-session">{t("session")}</Label>
                <Select id="photo-session" name="appointmentId" defaultValue="">
                  <option value="">{t("noSession")}</option>
                  {sessions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {f.dateTime(a.startsAt)} · {procedureName.get(a.procedureId ?? "") ?? "-"}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="photo-region">{t("region")}</Label>
                <Input id="photo-region" name="region" maxLength={80} placeholder={t("regionPlaceholder")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="photo-takenAt">{t("takenAt")}</Label>
                <Input id="photo-takenAt" name="takenAt" type="date" defaultValue={dateKeySP()} max={dateKeySP()} />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="allowMarketing" className="mt-0.5 h-4 w-4 accent-brand" aria-describedby="allowMarketing-hint" />
              <span>
                {t("marketing")}
                <span id="allowMarketing-hint" className="block text-xs text-muted-foreground">
                  {t("marketingHint")}
                </span>
              </span>
            </label>
            <Button type="submit" variant="outline">
              <Camera className="h-4 w-4" aria-hidden /> {t("upload")}
            </Button>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
