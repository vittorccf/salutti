import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("paciente com telefone de Portugal, e-mail corrigido e endereço pelo CEP; depois edição", async ({ page }) => {
  await login(page, "guilherme");
  // CEP simulado: o teste não depende do ViaCEP estar no ar.
  await page.route("**/api/cep/74005010", (r) =>
    r.fulfill({ json: { cep: "74005010", street: "Avenida Goiás", district: "Setor Central", city: "Goiânia", state: "GO" } }),
  );

  await page.goto("/app/pacientes/novo");
  await page.locator("#fullName").fill("Inês Contato E2E");

  // País pelo seletor com busca.
  await page.getByRole("button", { name: /País do telefone/ }).click();
  await page.getByRole("textbox", { name: "Buscar país ou DDI" }).fill("Portugal");
  await page.getByRole("option", { name: /Portugal/ }).click();
  await page.locator("#phone").fill("912345678");
  await expect(page.locator("#phone")).toHaveValue("912 345 678");

  // Sugestão de e-mail.
  await page.locator("#email").fill("ines@gmial.com");
  await page.locator("#pronouns").click();
  await page.getByRole("button", { name: "ines@gmail.com" }).click();
  await expect(page.locator("#email")).toHaveValue("ines@gmail.com");

  // CEP preenche o endereço e leva o foco ao número.
  await page.locator("#cep").fill("74005010");
  await expect(page.locator("#street")).toHaveValue("Avenida Goiás");
  await expect(page.locator("#city")).toHaveValue("Goiânia");
  await expect(page.locator("#addressNumber")).toBeFocused();
  await page.locator("#addressNumber").fill("100");

  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page.getByRole("heading", { name: "Paciente · Inês Contato E2E" })).toBeVisible();
  await expect(page.getByText("+351 912 345 678")).toBeVisible();
  await expect(page.locator('img[src="/flags/PT.svg"]').first()).toBeVisible();
  await expect(page.getByText("Avenida Goiás, 100 · Setor Central · Goiânia/GO · 74005-010")).toBeVisible();

  // Edição mantém os dados; telefone inválido é recusado com mensagem.
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page.locator("#phone")).toHaveValue("912 345 678");
  await expect(page.locator("#street")).toHaveValue("Avenida Goiás");
  await page.locator("#phone").fill("12");
  await expect(page.getByText(/Número incompleto ou inválido/)).toBeVisible();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Telefone inválido" })).toBeVisible();
});
