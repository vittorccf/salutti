// Convite para a equipe: a clínica convida a recepção, a pessoa cria a conta pelo link e entra sem ver o prontuário.
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("convite da clínica para a recepção: link, conta nova e acesso sem prontuário", async ({ page, browser }) => {
  const email = `recepcao-${Date.now()}@example.com`;
  await login(page, "kris");
  await page.goto("/app/equipe");
  await page.locator("#invite-email").fill(email);
  await page.locator("#invite-role").selectOption("receptionist");
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const link = await page.getByRole("textbox", { name: "Link do convite" }).inputValue();
  expect(link).toMatch(/\/convite\/[A-Za-z0-9_-]+$/);
  await expect(page.getByText(email)).toBeVisible();

  const guest = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByText("Você foi convidado como Recepção")).toBeVisible();
  await guest.locator("#name").fill("Rosa Recepção");
  await guest.locator("#password").fill("senha-segura-123");
  await guest.locator("#passwordConfirm").fill("senha-segura-123");
  await guest.getByRole("button", { name: "Criar conta e entrar na equipe" }).click();
  await expect(guest).toHaveURL(/\/app$/);
  await expect(guest.getByRole("link", { name: "Pacientes" }).first()).toBeVisible();
  await expect(guest.getByRole("link", { name: "Prontuário" })).toHaveCount(0);
  const res = await guest.goto("/app/prontuario");
  expect(res?.status()).toBe(404);

  // O link não serve duas vezes.
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByText("Convite indisponível")).toBeVisible();
});
