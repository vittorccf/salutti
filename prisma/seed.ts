/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, subDays, startOfDay, addMinutes } from "date-fns";

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

const txid = (i: number) => `pix_seed_${Math.random().toString(36).slice(2, 6)}${i}`;

const pixCopy = (amount: number, id: string) =>
  `00020126360014BR.GOV.BCB.PIX0114SALUTI-DEMO0208${id}5204000053039865404${amount.toFixed(2).replace(".", "")}5802BR5915SALUTI SAUDE LTDA6009GOIANIA62070503***6304ABCD`;

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
        email: "guilherme@saluti.dev",
        name: "Guilherme Quintino",
        passwordHash: hash("saluti123"),
      },
    }),
    db.user.create({
      data: {
        email: "kris@saluti.dev",
        name: "Kris Fellipe",
        passwordHash: hash("saluti123"),
      },
    }),
  ]);

  console.log("🏥 Criando workspaces (perfis do discovery)…");
  const wsGuilherme = await db.workspace.create({
    data: {
      name: "Consultório Guilherme Quintino",
      slug: "consultorio-guilherme",
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

  const wsKris = await db.workspace.create({
    data: {
      name: "UBS Turvânia · Odonto",
      slug: "ubs-turvania",
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

  console.log("🩺 Profissionais…");
  const proGuilherme = await db.professional.create({
    data: {
      workspaceId: wsGuilherme.id,
      fullName: "Guilherme Quintino",
      email: "guilherme@saluti.dev",
      phone: "(62) 9 9111-2233",
      professionalType: "psicologo",
      councilType: "CRP",
      councilNumber: "09/12345",
      specialty: "TCC, casais",
      hourlyRate: 180,
    },
  });
  // Diferencial: terapeuta SEM CRP no mesmo consultório
  const proTerapeuta = await db.professional.create({
    data: {
      workspaceId: wsGuilherme.id,
      fullName: "Larissa Mendes",
      email: "larissa@saluti.dev",
      phone: "(62) 9 9222-3344",
      professionalType: "psicanalista",
      noCouncil: true,
      councilType: "sem_registro",
      specialty: "Psicanálise lacaniana · formação Inst. Sigmund Freud",
      hourlyRate: 150,
    },
  });
  const proKris = await db.professional.create({
    data: {
      workspaceId: wsKris.id,
      fullName: "Kris Fellipe",
      email: "kris@saluti.dev",
      phone: "(62) 9 9333-4455",
      professionalType: "dentista",
      councilType: "CRO",
      councilNumber: "GO 12345",
      specialty: "Odonto SUS, clínica geral",
      hourlyRate: 0,
    },
  });

  console.log("👥 Pacientes…");
  const pacientesGuilherme = await Promise.all(
    [
      { fullName: "Ana Beatriz Souza", phone: "(62) 9 8111-2222", email: "ana@email.com", cpf: "111.111.111-11" },
      { fullName: "Bruno Carvalho", phone: "(62) 9 8222-3333", email: "bruno@email.com" },
      { fullName: "Camila Diniz", phone: "(62) 9 8333-4444", email: "camila@email.com", cpf: "222.222.222-22" },
      { fullName: "Diego Esteves", phone: "(62) 9 8444-5555" },
      { fullName: "Eduarda Faria", phone: "(62) 9 8555-6666", email: "eduarda@email.com" },
      { fullName: "Fernando Gomes", phone: "(62) 9 8666-7777" },
      { fullName: "Gabriela Hoffmann", phone: "(62) 9 8777-8888", email: "gabi@email.com" },
      { fullName: "Henrique Iida", phone: "(62) 9 8888-9999" },
    ].map((p) =>
      db.patient.create({
        data: {
          workspaceId: wsGuilherme.id,
          fullName: p.fullName,
          phone: p.phone,
          email: p.email ?? null,
          cpf: p.cpf ?? null,
          birthDate: new Date(1985 + Math.floor(Math.random() * 25), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 27)),
          consentRecords: {
            create: [
              {
                workspaceId: wsGuilherme.id,
                purpose: "tutela_saude",
                legalBasis: "tutela_saude",
                granted: true,
              },
            ],
          },
        },
      }),
    ),
  );

  const pacientesKris = await Promise.all(
    [
      { fullName: "Manoel da Silva", phone: "(62) 9 7111-2222" },
      { fullName: "Joana Pereira", phone: "(62) 9 7222-3333" },
      { fullName: "Luiz Henrique", phone: "(62) 9 7333-4444" },
    ].map((p) =>
      db.patient.create({
        data: {
          workspaceId: wsKris.id,
          fullName: p.fullName,
          phone: p.phone,
          consentRecords: {
            create: [
              { workspaceId: wsKris.id, purpose: "tutela_saude", legalBasis: "tutela_saude", granted: true },
            ],
          },
        },
      }),
    ),
  );

  console.log("📱 Portal Ana Beatriz com cartões diários…");
  const ana = pacientesGuilherme[0]!;
  await db.patientPortalAccess.create({
    data: {
      patientId: ana.id,
      token: "ana-demo-token-please-rotate",
    },
  });
  for (let i = 0; i < 10; i++) {
    const date = startOfDay(subDays(new Date(), i));
    await db.dailyCard.create({
      data: {
        workspaceId: wsGuilherme.id,
        patientId: ana.id,
        date,
        mood: 1 + Math.floor(Math.random() * 5),
        sleepHours: 5 + Math.random() * 4,
        anxiety: 1 + Math.floor(Math.random() * 5),
        notes: i === 0 ? "Dia tranquilo, consegui meditar." : undefined,
      },
    });
  }

  console.log("📅 Agenda + sessões passadas + futuras…");
  for (let i = 0; i < 25; i++) {
    const patient = pacientesGuilherme[i % pacientesGuilherme.length]!;
    const professional = i % 3 === 0 ? proTerapeuta : proGuilherme;
    const startsAt = addMinutes(addDays(startOfDay(new Date()), i - 12), 9 * 60 + (i % 6) * 60);
    const endsAt = addMinutes(startsAt, 50);
    const isPast = startsAt < new Date();
    const isOnline = i % 2 === 0;
    const price = professional.hourlyRate ?? 180;

    const appt = await db.appointment.create({
      data: {
        workspaceId: wsGuilherme.id,
        patientId: patient.id,
        professionalId: professional.id,
        startsAt,
        endsAt,
        modality: isOnline ? "online" : "presencial",
        meetingUrl: isOnline ? `https://meet.saluti.app/sessao/${Math.random().toString(36).slice(2, 10)}` : null,
        status: isPast ? (i % 11 === 0 ? "no_show" : "done") : i % 3 === 0 ? "confirmed" : "scheduled",
        price,
        reminderSentAt: isPast ? subDays(startsAt, 1) : null,
      },
    });

    // Cobrança vinculada
    const dueDate = isPast ? subDays(new Date(), Math.floor(Math.random() * 30)) : addDays(new Date(), Math.floor(Math.random() * 14));
    const id = txid(i);
    const charge = await db.charge.create({
      data: {
        workspaceId: wsGuilherme.id,
        patientId: patient.id,
        appointmentId: appt.id,
        amount: price,
        method: "pix",
        dueDate,
        status: isPast ? (i % 4 === 0 ? "pending" : "paid") : "pending",
        paidAt: isPast && i % 4 !== 0 ? dueDate : null,
        externalId: id,
        pixCopyPaste: pixCopy(price, id),
      },
    });
    await db.paymentLink.create({
      data: {
        workspaceId: wsGuilherme.id,
        chargeId: charge.id,
        token: id,
        url: `/pay/${id}`,
      },
    });

    if (appt.status === "done" && i % 2 === 0) {
      const aiTopics = ["Ansiedade", "Vínculo conjugal", "Sono"];
      await db.clinicalNote.create({
        data: {
          workspaceId: wsGuilherme.id,
          patientId: patient.id,
          professionalId: professional.id,
          appointmentId: appt.id,
          noteType: "evolucao",
          contentMarkdown: `Sessão #${i}\n\nA paciente relatou ansiedade relacionada ao trabalho e dificuldades no sono. Falamos sobre o vínculo conjugal e fizemos exercício de respiração diafragmática. Para a próxima semana: registrar Cartão Diário todos os dias.`,
          aiSummary: `**Paciente:** ${patient.fullName}\n\n**Densidade clínica:** média (62 palavras).\n\n**Temas detectados:** Ansiedade, Distúrbios de sono, Vínculo conjugal.\n\n**Síntese inicial:** Sessão centrada em manejo de ansiedade ocupacional e impacto no sono.\n\n**Sugestão LUMA:** manter monitoramento via Cartões Diários e reavaliar plano em 4 sessões.`,
          aiTopics: aiTopics.join(","),
          signedAt: new Date(),
          signedHash: "sha256:" + Math.random().toString(36).slice(2),
        },
      });
    }

    if (charge.status === "paid" && i % 5 === 0) {
      await db.receipt.create({
        data: {
          workspaceId: wsGuilherme.id,
          patientId: patient.id,
          chargeId: charge.id,
          receiptNumber: `R${String(i + 1).padStart(5, "0")}`,
          amount: charge.amount,
          receitaSaudeId: `RS-${i + 1}-${Date.now().toString(36)}`,
          receitaSaudeStatus: "confirmed",
        },
      });
      await db.invoice.create({
        data: {
          workspaceId: wsGuilherme.id,
          patientId: patient.id,
          chargeId: charge.id,
          invoiceNumber: `NFS${String(i + 1).padStart(5, "0")}`,
          amount: charge.amount,
          externalId: `nfeio_${Math.random().toString(36).slice(2, 10)}`,
          issStatus: "issued",
        },
      });
    }
  }

  console.log("📅 Agenda Kris/UBS…");
  for (let i = 0; i < 6; i++) {
    const patient = pacientesKris[i % pacientesKris.length]!;
    const startsAt = addMinutes(addDays(startOfDay(new Date()), i - 2), 13 * 60 + (i % 4) * 60);
    const endsAt = addMinutes(startsAt, 30);
    await db.appointment.create({
      data: {
        workspaceId: wsKris.id,
        patientId: patient.id,
        professionalId: proKris.id,
        startsAt,
        endsAt,
        modality: "presencial",
        status: startsAt < new Date() ? "done" : "scheduled",
        price: 0, // UBS SUS
      },
    });
  }

  console.log("💬 Notificações WhatsApp recentes…");
  await db.notificationLog.createMany({
    data: [
      {
        workspaceId: wsGuilherme.id,
        channel: "whatsapp",
        recipient: ana.phone!,
        template: "reminder_24h",
        payload: JSON.stringify({ body: `Olá, Ana! Lembrete da consulta com Guilherme amanhã às 14h.` }),
        status: "sent",
      },
      {
        workspaceId: wsGuilherme.id,
        channel: "whatsapp",
        recipient: pacientesGuilherme[1]!.phone!,
        template: "charge_due",
        payload: JSON.stringify({ body: "Olá, Bruno. Sua cobrança no valor de R$ 180,00 vence amanhã." }),
        status: "sent",
      },
    ],
  });

  console.log("✨ Pré-cálculo de insights LUMA…");
  const { insightsEngine } = await import("../src/lib/providers/insights");
  await insightsEngine.regenerate({ workspaceId: wsGuilherme.id });
  await insightsEngine.regenerate({ workspaceId: wsKris.id });

  console.log("✅ Seed concluído.");
  console.log("\nLogins:");
  console.log("  guilherme@saluti.dev / saluti123 → Consultório psicólogo (Goiânia)");
  console.log("  kris@saluti.dev / saluti123      → UBS odonto Turvânia");
  console.log("\nPortal do paciente: /portal/ana-demo-token-please-rotate");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
