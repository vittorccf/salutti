import type { InsurancePlan, Patient } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmailInput } from "@/components/forms/email-input";
import { PhoneInput } from "@/components/forms/phone-input";
import { AddressFields } from "@/components/forms/address-fields";
import { dateKeySP } from "@/lib/dates";
import { ImageUpload } from "@/components/forms/image-upload";
import { mediaUrl } from "@/lib/media";
import { getTranslations } from "@/i18n/server";

// Campos do paciente, usados no cadastro e na edição.
export async function PatientFields({ patient, plans }: { patient?: Patient | null; plans: InsurancePlan[] }) {
  const p = patient;
  const [t, tAddress] = await Promise.all([getTranslations("patients.form"), getTranslations("common.address")]);
  return (
    <div className="space-y-6">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{t("personalData")}</legend>
        <div className="space-y-1">
          <Label htmlFor="fullName">{t("fullName")}</Label>
          <Input id="fullName" name="fullName" required defaultValue={p?.fullName ?? ""} autoComplete="off" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pronouns">{t("pronouns")}</Label>
          <Input id="pronouns" name="pronouns" defaultValue={p?.pronouns ?? ""} placeholder={t("pronounsPlaceholder")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">{t("email")}</Label>
          <EmailInput id="email" name="email" defaultValue={p?.email} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">{t("phone")}</Label>
          <PhoneInput id="phone" name="phone" defaultValue={p?.phone} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cpf">{t("cpf")}</Label>
          <Input id="cpf" name="cpf" defaultValue={p?.cpf ?? ""} placeholder="000.000.000-00" inputMode="numeric" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="birthDate">{t("birthDate")}</Label>
          <Input id="birthDate" name="birthDate" type="date" defaultValue={p?.birthDate ? dateKeySP(p.birthDate) : ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="responsibleName">{t("responsible")}</Label>
          <Input id="responsibleName" name="responsibleName" defaultValue={p?.responsibleName ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emergencyContact">{t("emergencyContact")}</Label>
          <Input id="emergencyContact" name="emergencyContact" defaultValue={p?.emergencyContact ?? ""} placeholder={t("emergencyContactPlaceholder")} />
        </div>
        {plans.length > 0 ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="insurancePlanId">{t("insurance")}</Label>
              <Select id="insurancePlanId" name="insurancePlanId" defaultValue={p?.insurancePlanId ?? ""}>
                <option value="">{t("private")}</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="insuranceCardNumber">{t("cardNumber")}</Label>
              <Input id="insuranceCardNumber" name="insuranceCardNumber" maxLength={20} defaultValue={p?.insuranceCardNumber ?? ""} placeholder={t("cardNumberPlaceholder")} />
            </div>
          </>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tAddress("legend")}</legend>
        {p?.address ? (
          <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
            <p>{t("legacyAddress", { address: p.address })}</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="clearLegacyAddress" className="h-4 w-4 accent-primary" />
              {t("clearLegacyAddress")}
            </label>
          </div>
        ) : null}
        <AddressFields defaultValue={p ?? {}} />
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea id="notes" name="notes" defaultValue={p?.notes ?? ""} placeholder={t("notesPlaceholder")} />
      </div>
      <ImageUpload
        name="photo"
        label={t("photo")}
        shape="square"
        currentUrl={mediaUrl(p?.photoId)}
        hint={t("photoHint")}
        consentLabel={t("photoConsent")}
      />
    </div>
  );
}
