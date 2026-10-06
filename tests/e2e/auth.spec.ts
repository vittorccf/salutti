import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("senha errada mostra erro sem entrar", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill("guilherme@salutti.dev");
  await page.locator("#password").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Credenciais inválidas" })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("login, navegação sem perder a sessão e logout pelo menu", async ({ page }) => {
  await login(page, "guilherme");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Guilherme");
  // Regressão: o prefetch do link de logout encerrava a sessão.
  for (const path of ["/app/pacientes", "/app/agenda", "/app/financeiro", "/app/ajustes"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  await page.getByRole("button", { name: /Guilherme Quintino/ }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});

test("logout por GET não é aceito", async ({ request }) => {
  const res = await request.get("/logout", { maxRedirects: 0 });
  expect(res.status()).toBe(405);
});
