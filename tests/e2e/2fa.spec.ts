import { expect, test, type Page } from "@playwright/test";
import { totpCode } from "../../src/lib/totp";

const PASSWORD = "senha-segura-123";

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.locator("#name").fill("Conta 2FA");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#workspaceName").fill("Consultório 2FA");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/primeiros-passos/);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: /Conta 2FA/ }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function password(page: Page, email: string) {
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/login\/verificar/);
}

async function code(page: Page, value: string) {
  await page.locator("#code").fill(value);
  await page.getByRole("button", { name: "Verificar" }).click();
}

test("ativar 2FA, entrar com código e com código de recuperação, bloquear e desativar", async ({ page, context }) => {
  const email = `dois-fatores-${Date.now()}@teste.dev`;
  await signup(page, email);

  // Ativação pelo menu do perfil.
  await page.getByRole("button", { name: /Conta 2FA/ }).click();
  await page.getByRole("menuitem", { name: "Segurança da conta" }).click();
  await page.getByRole("button", { name: "Configurar verificação em duas etapas" }).click();
  await expect(page.getByRole("img", { name: "QR code para o app autenticador" })).toBeVisible();
  const secret = (await page.getByTestId("totp-secret").innerText()).trim();

  await page.locator("#confirm-code").fill("000000");
  await page.getByRole("button", { name: "Ativar verificação" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Código inválido" })).toBeVisible();

  await page.locator("#confirm-code").fill(totpCode(secret));
  await page.getByRole("button", { name: "Ativar verificação" }).click();
  const items = page.getByRole("list", { name: "Códigos de recuperação" }).getByRole("listitem");
  await expect(items).toHaveCount(8);
  const recovery = await items.allInnerTexts();
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();
  await expect(page.getByText("Ativa", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Códigos de recuperação" })).toHaveCount(0);

  // O token da etapa de 2FA não pode virar sessão.
  await logout(page);
  await password(page, email);
  const pending = (await context.cookies()).find((c) => c.name === "salutti_2fa")!;
  await context.addCookies([{ ...pending, name: "salutti_session" }]);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
  await context.clearCookies();

  // Senha + código.
  await page.goto("/login");
  await password(page, email);
  await code(page, "123456");
  await expect(page.getByRole("alert").filter({ hasText: "Código inválido" })).toBeVisible();
  await code(page, totpCode(secret));
  await expect(page).toHaveURL(/\/app$/);

  // Código de recuperação vale uma vez.
  await logout(page);
  await password(page, email);
  await code(page, recovery[0]);
  await expect(page).toHaveURL(/\/app$/);
  await logout(page);
  await password(page, email);
  await code(page, recovery[0]);
  await expect(page.getByRole("alert").filter({ hasText: "Código inválido" })).toBeVisible();

  // 5 erros bloqueiam, mesmo com o código certo em seguida. (1 erro acima + 4.)
  for (let i = 0; i < 4; i++) await code(page, "000000");
  await expect(page.getByRole("alert").filter({ hasText: "Muitas tentativas" })).toBeVisible();
  await code(page, totpCode(secret));
  await expect(page.getByRole("alert").filter({ hasText: "Muitas tentativas" })).toBeVisible();
});

test("desativar exige o código atual", async ({ page }) => {
  const email = `desativar-${Date.now()}@teste.dev`;
  await signup(page, email);
  await page.goto("/app/conta/seguranca");
  await page.getByRole("button", { name: "Configurar verificação em duas etapas" }).click();
  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.locator("#confirm-code").fill(totpCode(secret));
  await page.getByRole("button", { name: "Ativar verificação" }).click();
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();

  await page.locator("#disable-code").fill("000000");
  await page.getByRole("button", { name: "Desativar verificação" }).click();
  await expect(page.getByText("Ativa", { exact: true })).toBeVisible();

  await page.locator("#disable-code").fill(totpCode(secret));
  await page.getByRole("button", { name: "Desativar verificação" }).click();
  await expect(page.getByText("Desativada", { exact: true })).toBeVisible();

  // Sem 2FA, o login volta a ir direto para o app.
  await logout(page);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app$/);
});
