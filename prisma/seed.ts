/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays } from "date-fns";

const db = new PrismaClient();

const hash = (pw: string) => bcrypt.hashSync(pw, 10);

const defaultAnamnesis = {
  sections: [
    {
      title: "Identificação",
      questions: [
        { key: "queixa", label: "Queixa principal", type: "textarea" },
        { key: "expectativa", label: "Expectativa com o tratamento", type: "textarea" },
      ],
    },
    {
      title: "História clínica",
      questions: [
        { key: "antecedentes", label: "Antecedentes (físicos e psiquiátricos)", type: "textarea" },
        { key: "medicacoes", label: "Medicações em uso", type: "text" },
        { key: "sono", label: "Qualidade do sono", type: "select", options: ["Boa", "Regular", "Ruim"] },
      ],
    },
    {
      title: "Contexto",
      questions: [
        { key: "familia", label: "Configuração familiar", type: "textarea" },
        { key: "trabalho", label: "Vida profissional", type: "textarea" },
      ],
    },
  ],
};

async function main() {
  console.log("🌱 Limpando dados existentes…");
  await db.notificationLog.deleteMany();
  await db.dailyCard.deleteMany();
  await db.aiInsight.deleteMany();
  await db.auditLog.deleteMany();
  await db.consentRecord.deleteMany();
  await db.invoice.deleteMany();
  await db.receipt.deleteMany();
  await db.subscription.deleteMany();
  await db.paymentLink.deleteMany();
  await db.charge.deleteMany();
  await db.clinicalNote.deleteMany();
  await db.appointment.deleteMany();
  await db.patientPortalAccess.deleteMany();
  await db.patient.deleteMany();
  await db.professional.deleteMany();
  await db.anamnesisTemplate.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.user.deleteMany();

  console.log("👤 Criando usuários demo…");
  const [guilherme, kris] = await Promise.all([
    db.user.create({
      data: {
        email: "guilherme@salutti.dev",
        name: "Guilherme Quintino",
        passwordHash: hash("salutti123"),
      },
    }),
    db.user.create({
      data: {
        email: "kris@salutti.dev",
        name: "Kris Fellipe",
        passwordHash: hash("salutti123"),
      },
    }),
  ]);

  console.log("🏥 Criando workspaces (perfis do discovery)…");
  await db.workspace.create({
    data: {
      name: "Consultório Guilherme Quintino",
      slug: "consultorio-guilherme",
      accountType: "autonomo",
      segment: "solo_psicologo",
      cnpj: "12.345.678/0001-90",
      trialEndsAt: addDays(new Date(), 13),
      planTier: "trial",
      memberships: { create: { userId: guilherme.id, role: "owner" } },
      anamnesisTemplates: {
        create: [
          {
            name: "Anamnese psicológica TCC",
            specialty: "psicologia",
            isDefault: true,
            schemaJson: JSON.stringify(defaultAnamnesis),
          },
        ],
      },
    },
  });

  await db.workspace.create({
    data: {
      name: "UBS Turvânia · Odonto",
      slug: "ubs-turvania",
      accountType: "clinica",
      segment: "ubs",
      cnpj: "00.000.000/0001-00",
      trialEndsAt: addDays(new Date(), 13),
      planTier: "trial",
      memberships: { create: { userId: kris.id, role: "owner" } },
      anamnesisTemplates: {
        create: [
          {
            name: "Anamnese odontológica",
            specialty: "odonto",
            isDefault: true,
            schemaJson: JSON.stringify({
              sections: [
                {
                  title: "Histórico",
                  questions: [
                    { key: "queixa", label: "Queixa principal", type: "textarea" },
                    { key: "alergias", label: "Alergias", type: "text" },
                    { key: "medicamentos", label: "Medicamentos contínuos", type: "text" },
                  ],
                },
                {
                  title: "Hábitos",
                  questions: [
                    { key: "higiene", label: "Hábitos de higiene bucal", type: "textarea" },
                    {
                      key: "fumante",
                      label: "Fumante?",
                      type: "select",
                      options: ["Sim", "Não", "Ex-fumante"],
                    },
                  ],
                },
              ],
            }),
          },
        ],
      },
    },
  });

  // Base limpa: sem profissionais, pacientes, agenda nem cobranças fictícias.
  // Cada consultório começa vazio e é preenchido pelo próprio app.

  console.log("✅ Seed concluído.");
  console.log("\nLogins:");
  console.log("  guilherme@salutti.dev / salutti123 → Consultório psicólogo (Goiânia)");
  console.log("  kris@salutti.dev / salutti123      → UBS odonto Turvânia");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
