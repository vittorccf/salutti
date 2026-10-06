// Idioma da interface: escolha em Ajustes vale na hora, sobrevive ao login em outro navegador,
// e sem escolha o app segue o idioma do navegador. Conta própria para não afetar os outros testes.
import { expect, test } from "@playwright/test";

test("trocar o idioma em Ajustes (en, es, pt-PT) e manter no próximo login", async ({ page, browser }) => {
  const email = `idioma-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByText("Profissional autônomo", { exact: true }).click();
  await page.locator("#name").fill("Lia Idiomas");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("senha-segura-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/primeiros-passos/);

  // Inglês: a confirmação já vem no idioma escolhido, e o menu muda.
  await page.goto("/app/ajustes");
  await page.locator("#profile-locale").selectOption("en");
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.goto("/app/pacientes");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "Patients" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" }).first()).toBeVisible();

  // Espanhol.
  await page.goto("/app/ajustes");
  await page.locator("#profile-locale").selectOption("es");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Perfil guardado.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");

  // Português de Portugal ("Perfil guardado." é igual ao do espanhol: recarrega para não confirmar a mensagem anterior).
  await page.goto("/app/ajustes");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.locator("#profile-locale").selectOption("pt-PT");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText("Perfil guardado.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");
  await page.goto("/app");
  await expect(page.getByRole("link", { name: "Definições" }).first()).toBeVisible();

  // Outro navegador (idioma pt-BR): ao entrar, vale o idioma salvo no perfil.
  const other = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await other.goto("/login");
  await other.locator("#email").fill(email);
  await other.locator("#password").fill("senha-segura-123");
  await other.getByRole("button", { name: "Entrar" }).click();
  await expect(other).toHaveURL(/\/app/);
  await expect(other.locator("html")).toHaveAttribute("lang", "pt-PT");
});

test("sem escolha, segue o idioma do navegador", async ({ browser }) => {
  const en = await (await browser.newContext({ locale: "en-US" })).newPage();
  await en.goto("/login");
  await expect(en.locator("html")).toHaveAttribute("lang", "en");
  await expect(en.getByRole("button", { name: "Sign in" })).toBeVisible();

  const pt = await (await browser.newContext({ locale: "pt-PT" })).newPage();
  await pt.goto("/login");
  await expect(pt.locator("html")).toHaveAttribute("lang", "pt-PT");
});
