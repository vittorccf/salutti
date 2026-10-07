import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("Termos de Uso e Política de Privacidade são públicos e ligados entre si", async ({ page }) => {
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toBeVisible();
  // Declaração de Uso Limitado exigida pelo Google para o escopo da Agenda.
  await expect(page.getByText("Uso Limitado (Limited Use)", { exact: false })).toBeVisible();
  await page.getByRole("navigation", { name: "Outros documentos" }).getByRole("link", { name: "Termos de Uso" }).click();
  await expect(page).toHaveURL(/\/termos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Termos de Uso" })).toBeVisible();
});

test("cadastro exige o aceite, com links para os dois documentos", async ({ page }) => {
  await page.goto("/signup");
  await page.getByText("Profissional autônomo", { exact: true }).click();
  const label = page.locator('label[for="acceptTerms"]');
  await expect(label.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
  await expect(label.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");

  await page.locator("#name").fill("Teo Sem Aceite");
  await page.locator("#email").fill(`sem-aceite-${Date.now()}@example.com`);
  await page.locator("#password").fill("senha-segura-123");
  await page.locator("#passwordConfirm").fill("senha-segura-123");
  // Sem o "required" do navegador, o servidor também recusa.
  await page.locator("#acceptTerms").evaluate((el) => el.removeAttribute("required"));
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "aceite os Termos de Uso" })).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
});

test("conta anterior aos documentos vê o aviso no app até aceitar", async ({ page }) => {
  await login(page, "kris");
  const banner = page.getByRole("region", { name: "Termos de Uso e Política de Privacidade" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");
  await banner.getByRole("button", { name: "Li e aceito" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Termos de Uso e Política de Privacidade" })).toHaveCount(0);
});
