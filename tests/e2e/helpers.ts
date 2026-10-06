import { expect, type Page } from "@playwright/test";

export const USERS = {
  guilherme: { email: "guilherme@salutti.dev", password: "salutti123" },
  kris: { email: "kris@salutti.dev", password: "salutti123" },
} as const;

export async function login(page: Page, user: keyof typeof USERS) {
  await page.goto("/login");
  await page.locator("#email").fill(USERS[user].email);
  await page.locator("#password").fill(USERS[user].password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

export async function createProfessional(page: Page, name: string) {
  await page.goto("/app/equipe");
  await page.locator("#fullName").fill(name);
  await page.getByRole("button", { name: "Cadastrar profissional" }).click();
  await expect(page.getByRole("cell", { name })).toBeVisible();
}

export async function createPatient(page: Page, name: string) {
  await page.goto("/app/pacientes/novo");
  await page.locator("#fullName").fill(name);
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page.getByRole("heading", { name: `Paciente · ${name}` })).toBeVisible();
  return page.url();
}

// Seleciona a <option> cujo texto contém `text` (o rótulo do profissional inclui o conselho).
export async function selectByText(page: Page, selector: string, text: string) {
  const value = await page
    .locator(`${selector} option`, { hasText: text })
    .first()
    .getAttribute("value");
  if (!value) throw new Error(`Opção "${text}" não encontrada em ${selector}`);
  await page.locator(selector).selectOption(value);
}
