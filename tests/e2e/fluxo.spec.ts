import { expect, test } from "@playwright/test";
import { createPatient, createProfessional, login, selectByText } from "./helpers";

test("profissional → paciente → sessão online com Meet → cobrança paga", async ({ page }) => {
  await login(page, "kris");
  await createProfessional(page, "Dra. Fluxo E2E");
  await createPatient(page, "Paciente Fluxo E2E");

  await page.goto("/app/agenda/novo");
  await page.locator("#patientId").selectOption({ label: "Paciente Fluxo E2E" });
  await selectByText(page, "#professionalId", "Dra. Fluxo E2E");
  await page.locator("#startsAt").fill("2026-11-10T15:00");
  await page.locator("#modality").selectOption("online");
  await page.locator("#videoProvider").selectOption("google_meet");
  await page.locator("#price").fill("200");
  await page.getByRole("button", { name: "Agendar sessão" }).click();

  // Horário digitado = horário exibido (fuso de São Paulo).
  await expect(page.getByRole("heading", { name: "Sessão · Paciente Fluxo E2E" })).toBeVisible();
  await expect(page.getByText("10/11/2026, 15:00 até 15:50")).toBeVisible();
  await expect(page.getByText("Agendada")).toBeVisible();
  const meet = page.getByRole("link", { name: /Entrar no Google Meet/ });
  await expect(meet).toContainText("Simulado");

  await page.getByRole("link", { name: "Ver cobrança" }).click();
  await expect(page.getByText(/Vencimento 10\/11\/2026/)).toBeVisible();
  await expect(page.getByText("Pendente")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByText("Pago", { exact: true })).toBeVisible();

  await page.goto("/app/financeiro");
  const row = page.getByRole("row", { name: /Paciente Fluxo E2E/ });
  await expect(row).toContainText("R$ 200,00");
  await expect(row).toContainText("Pago");

  // A sessão aparece na terça, 10/11, da semana certa.
  await page.goto("/app/agenda?week=2026-11-09");
  await expect(page.getByText("Terça, 10")).toBeVisible();
  await expect(page.getByRole("link", { name: /15:00.*Paciente Fluxo E2E/ })).toBeVisible();

  // Visão mensal: a mesma sessão no dia 10 de novembro (primeiro nome na grade).
  await page.getByRole("link", { name: "Mês" }).click();
  await expect(page).toHaveURL(/view=month&month=2026-11/);
  await expect(page.getByRole("link", { name: /15:00 Paciente/ })).toBeVisible();
});

test("sessão online sem link: gerar link do Meet depois", async ({ page }) => {
  await login(page, "kris");
  await createProfessional(page, "Dr. Link E2E");
  await createPatient(page, "Paciente Link E2E");
  await page.goto("/app/agenda/novo");
  await page.locator("#patientId").selectOption({ label: "Paciente Link E2E" });
  await selectByText(page, "#professionalId", "Dr. Link E2E");
  await page.locator("#modality").selectOption("online");
  await page.locator("#videoProvider").selectOption("none");
  await page.locator("#generateCharge").uncheck();
  await page.getByRole("button", { name: "Agendar sessão" }).click();

  await page.getByRole("button", { name: "Gerar link" }).click();
  await expect(page.getByRole("link", { name: /Entrar no Google Meet/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar link" })).toBeVisible();
});
