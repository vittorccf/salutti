import { expect, test } from "@playwright/test";

const NEW_PASSWORD = "backoffice-seguro-123";

test("backoffice: admin/admin entra, troca a senha provisória e vê planos, clientes e chamados", async ({ page, context }) => {
  // Sem sessão, qualquer tela manda para o login do backoffice.
  await page.goto("/backoffice/chamados");
  await expect(page).toHaveURL(/\/backoffice\/login$/);

  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Usuário ou senha incorretos.")).toBeVisible();

  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("admin");
  await page.getByRole("button", { name: "Entrar" }).click();

  // Senha provisória: troca obrigatória antes de qualquer outra tela.
  await expect(page).toHaveURL(/\/backoffice\/senha$/);
  await page.goto("/backoffice/clientes");
  await expect(page).toHaveURL(/\/backoffice\/senha$/);
  await page.locator("#current").fill("admin");
  await page.locator("#password").fill(NEW_PASSWORD);
  await page.locator("#confirm").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();

  // A sessão do backoffice não vale no app dos consultórios.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/backoffice/planos");
  for (const name of ["Teste grátis", "Básico", "Essencial", "Anual"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Mensal · R$ 49,90/mês")).toBeVisible();
  await expect(page.getByText("Mensal · R$ 89,90/mês")).toBeVisible();
  await expect(page.getByText("Anual · R$ 749,90/ano")).toBeVisible();

  await page.goto("/backoffice/chamados");
  await expect(page.getByRole("heading", { name: "Chamados" })).toBeVisible();

  // Sair e entrar de novo com a senha nova.
  await context.clearCookies();
  await page.goto("/backoffice");
  await expect(page).toHaveURL(/\/backoffice\/login$/);
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
});
