import { expect, test } from "@playwright/test";

test("conta nova: cadastro → primeiros passos até 'Tudo pronto'", async ({ page }) => {
  const email = `onboarding-${Date.now()}@teste.dev`;
  await page.goto("/signup");
  await page.getByText("Profissional autônomo", { exact: true }).click();
  await page.locator("#name").fill("Marina Teste");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("senha-segura-123");
  await page.locator("#workspaceName").fill("Espaço Marina");
  await page.locator("#segment").selectOption("solo_psicanalista");
  await page.getByRole("button", { name: "Criar conta" }).click();

  // Cai direto nos primeiros passos, com o modelo do tipo de atendimento já criado.
  await expect(page).toHaveURL(/\/app\/primeiros-passos$/);
  await expect(page.getByText("1 de 4")).toBeVisible();
  await expect(page.getByText("Entrevistas preliminares (psicanálise)")).toBeVisible();

  // Nova sessão sem profissional explica o que falta.
  await page.goto("/app/agenda/novo");
  await expect(page.getByText("Nenhum profissional cadastrado")).toBeVisible();

  // Painel mostra o lembrete.
  await page.goto("/app");
  await expect(page.getByText("Primeiros passos · 1 de 4")).toBeVisible();
  await page.getByRole("link", { name: "Continuar" }).click();

  // Profissional com os padrões do tipo de atendimento (psicanalista, sem registro).
  await expect(page.locator("#fullName")).toHaveValue("Marina Teste");
  await expect(page.locator("#councilType")).toHaveValue("sem_registro");
  await page.getByRole("button", { name: "Cadastrar profissional" }).click();
  await expect(page.getByText("2 de 4")).toBeVisible();

  // Mais um modelo da biblioteca.
  await page.getByRole("checkbox", { name: /Anamnese em TCC/ }).check();
  await page.getByRole("button", { name: "Adicionar modelos selecionados" }).click();
  await expect(page.getByText("Anamnese em TCC").locator("..")).toContainText("Adicionado");

  // Paciente e primeira sessão.
  await page.getByRole("link", { name: "Cadastrar paciente" }).click();
  await page.locator("#fullName").fill("Primeiro Paciente");
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await page.goto("/app/primeiros-passos");
  await expect(page.getByText("3 de 4")).toBeVisible();
  await page.getByRole("link", { name: "Agendar sessão" }).click();
  await page.locator("#patientId").selectOption({ label: "Primeiro Paciente" });
  await page.locator("#professionalId").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Agendar sessão" }).click();
  await expect(page.getByRole("heading", { name: "Sessão · Primeiro Paciente" })).toBeVisible();

  await page.goto("/app/primeiros-passos");
  await expect(page.getByText("Tudo pronto")).toBeVisible();
  await page.goto("/app");
  await expect(page.getByText(/Primeiros passos ·/)).toHaveCount(0);
});
