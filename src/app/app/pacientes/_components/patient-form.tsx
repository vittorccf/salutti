import type { InsurancePlan, Patient } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmailInput } from "@/components/forms/email-input";
import { PhoneInput } from "@/components/forms/phone-input";
import { AddressFields } from "@/components/forms/address-fields";
import { dateKeySP } from "@/lib/dates";

// Campos do paciente, usados no cadastro e na edição.
export function PatientFields({ patient, plans }: { patient?: Patient | null; plans: InsurancePlan[] }) {
  const p = patient;
  return (
    <div className="space-y-6">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Dados pessoais</legend>
        <div className="space-y-1">
          <Label htmlFor="fullName">Nome completo *</Label>
          <Input id="fullName" name="fullName" required defaultValue={p?.fullName ?? ""} autoComplete="off" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pronouns">Pronomes</Label>
          <Input id="pronouns" name="pronouns" defaultValue={p?.pronouns ?? ""} placeholder="ele/dele, ela/dela, elu/delu…" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">E-mail</Label>
          <EmailInput id="email" name="email" defaultValue={p?.email} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Telefone (WhatsApp)</Label>
          <PhoneInput id="phone" name="phone" defaultValue={p?.phone} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cpf">CPF (opcional)</Label>
          <Input id="cpf" name="cpf" defaultValue={p?.cpf ?? ""} placeholder="000.000.000-00" inputMode="numeric" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="birthDate">Data de nascimento</Label>
          <Input id="birthDate" name="birthDate" type="date" defaultValue={p?.birthDate ? dateKeySP(p.birthDate) : ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="responsibleName">Responsável (se menor)</Label>
          <Input id="responsibleName" name="responsibleName" defaultValue={p?.responsibleName ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emergencyContact">Contato de emergência</Label>
          <Input id="emergencyContact" name="emergencyContact" defaultValue={p?.emergencyContact ?? ""} placeholder="Nome e telefone" />
        </div>
        {plans.length > 0 ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="insurancePlanId">Convênio</Label>
              <Select id="insurancePlanId" name="insurancePlanId" defaultValue={p?.insurancePlanId ?? ""}>
                <option value="">Particular</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="insuranceCardNumber">Número da carteirinha</Label>
              <Input id="insuranceCardNumber" name="insuranceCardNumber" maxLength={20} defaultValue={p?.insuranceCardNumber ?? ""} placeholder="Só para convênio" />
            </div>
          </>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Endereço</legend>
        {p?.address && !p.street ? (
          <p className="text-xs text-muted-foreground">Endereço anterior: {p.address}</p>
        ) : null}
        <AddressFields defaultValue={p ?? {}} />
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor="notes">Observações administrativas</Label>
        <Textarea id="notes" name="notes" defaultValue={p?.notes ?? ""} placeholder="Só dados administrativos. A evolução clínica vai no prontuário." />
      </div>
    </div>
  );
}
