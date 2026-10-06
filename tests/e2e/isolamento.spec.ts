// Um consultório não pode ver nem alterar dados de outro (regressão do IDOR corrigido).
import { expect, test } from "@playwright/test";
import { createPatient, login } from "./helpers";

test("paciente de outro consultório: 404 na ficha e LGPD não altera", async ({ browser }) => {
  const g = await (await browser.newContext()).newPage();
  await login(g, "guilherme");
  const url = await createPatient(g, "Paciente Isolado E2E");
  const patientId = url.split("/").pop()!;

  const k = await (await browser.newContext()).newPage();
  await login(k, "kris");
  await k.goto(`/app/pacientes/${patientId}`);
  await expect(k.getByText(/could not be found|não encontrad/i)).toBeVisible();

  // Kris adultera o formulário da LGPD para apontar para o paciente do Guilherme.
  await k.goto("/app/lgpd");
  await k.locator("#patientId").evaluate((el, id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = "alvo";
    el.appendChild(opt);
    (el as HTMLSelectElement).value = id;
  }, patientId);
  await k.getByRole("button", { name: "Anonimizar" }).click();
  await k.waitForLoadState("networkidle");

  // O paciente continua intacto para o dono.
  await g.goto(url);
  await expect(g.getByRole("heading", { name: "Paciente · Paciente Isolado E2E" })).toBeVisible();
});
