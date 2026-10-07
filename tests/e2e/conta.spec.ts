// Tipo de conta desde o cadastro (clínica × autônomo), migração entre os dois e aniversários no painel.
import { expect, test } from "@playwright/test";

// Data de hoje em São Paulo, no ano pedido ("1990-10-06").
const todayIn = (year: number) => {
  const [, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).split("-");
  return `${year}-${m}-${d}`;
};

test("clínica no cadastro → equipe → vira autônomo só com um profissional → aniversários no painel", async ({ page }) => {
  const email = `clinica-${Date.now()}@example.com`;
  await page.goto("/signup");

  // Sem escolher o tipo, os campos não aparecem.
  await expect(page.locator("#name")).toHaveCount(0);
  await page.getByText("Clínica", { exact: true }).click();
  await page.locator("#name").fill("Rita Gestora");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("senha-segura-123");
  await page.locator("#passwordConfirm").fill("senha-segura-123");
  await page.locator("#birthDate").fill(todayIn(1988));
  await page.locator("#workspaceName").fill("Clínica Ponte E2E");
  await page.locator("#cnpj").fill("11.222.333/0001-82");
  await expect(page.locator("#segment")).toHaveValue("clinica");
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: "Criar conta" }).click();

  // CNPJ com dígito errado: erro na hora, sem perder o que foi digitado.
  await expect(page.getByRole("alert").filter({ hasText: "CNPJ inválido" })).toBeVisible();
  await expect(page.locator("#workspaceName")).toHaveValue("Clínica Ponte E2E");
  await page.locator("#cnpj").fill("11.222.333/0001-81");
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/primeiros-passos$/);

  // Clínica cadastra mais de um profissional.
  for (const name of ["Dra. Uma E2E", "Dr. Dois E2E"]) {
    await page.goto("/app/equipe");
    await page.locator("#fullName").fill(name);
    await page.getByRole("button", { name: "Cadastrar profissional" }).click();
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  }

  // Com dois profissionais ativos, não dá para virar autônomo.
  await page.goto("/app/ajustes");
  await expect(page.getByText("Atual: Clínica")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mudar para profissional autônomo" })).toBeDisabled();
  await expect(page.getByText(/há 2 profissionais ativos/)).toBeVisible();

  // Desativa um e migra.
  await page.goto("/app/equipe");
  await page.getByRole("button", { name: "Desativar Dr. Dois E2E" }).click();
  await expect(page.getByRole("button", { name: "Reativar Dr. Dois E2E" })).toBeVisible();
  await page.goto("/app/ajustes");
  await page.getByRole("button", { name: "Mudar para profissional autônomo" }).click();
  await expect(page.getByText("Pronto: a conta agora é de profissional autônomo.")).toBeVisible();

  // Autônomo: não cadastra nem reativa um segundo profissional.
  await page.goto("/app/equipe");
  await expect(page.getByText("Conta de profissional autônomo", { exact: true })).toBeVisible();
  await expect(page.locator("#fullName")).toHaveCount(0);
  await page.getByRole("button", { name: "Reativar Dr. Dois E2E" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "tem um profissional ativo" })).toBeVisible();

  // Volta para clínica.
  await page.goto("/app/ajustes");
  await page.getByRole("button", { name: "Mudar para clínica" }).click();
  await expect(page.getByText("Pronto: a conta agora é de clínica.")).toBeVisible();

  // Clínica: paciente com aniversário hoje, mas que Rita não atende, não aparece no painel dela (sigilo).
  await page.goto("/app/pacientes/novo");
  await page.locator("#fullName").fill("Paciente Aniversário E2E");
  await page.locator("#birthDate").fill(todayIn(2000));
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page.getByRole("heading", { name: "Paciente · Paciente Aniversário E2E" })).toBeVisible();

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Feliz aniversário, Rita!" })).toBeVisible();
  await expect(page.locator("li", { hasText: "Seu aniversário" })).toBeVisible();
  await expect(page.getByText("Paciente Aniversário E2E")).toHaveCount(0);
});

test("perfil e dados do consultório em Ajustes (CEP preenche o endereço)", async ({ page }) => {
  const email = `autonomo-${Date.now()}@example.com`;
  await page.route("**/api/cep/01001000", (r) =>
    r.fulfill({ json: { cep: "01001000", street: "Praça da Sé", district: "Sé", city: "São Paulo", state: "SP" } }),
  );
  await page.goto("/signup");
  await page.getByText("Profissional autônomo", { exact: true }).click();
  await page.locator("#name").fill("Davi Autônomo");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("senha-segura-123");
  await page.locator("#passwordConfirm").fill("senha-segura-123");
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/primeiros-passos$/);

  await page.goto("/app/ajustes");
  // Nome do consultório em branco no cadastro vira "Consultório de <nome>".
  await expect(page.locator("#ws-name")).toHaveValue("Consultório de Davi");
  await page.locator("#ws-cep").fill("01001000");
  await expect(page.locator("#ws-street")).toHaveValue("Praça da Sé");
  await page.locator("#ws-addressNumber").fill("1");
  await page.getByRole("button", { name: "Salvar dados" }).click();
  await expect(page.getByText("Dados salvos.")).toBeVisible();

  await page.locator("#profile-birthDate").fill(todayIn(1991));
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByText("Perfil salvo.")).toBeVisible();

  // Google Meet sem o app OAuth configurado: card explica que o link é simulado.
  await expect(page.getByText("A conexão com o Google ainda não foi ativada na Salutti.", { exact: false })).toBeVisible();

  await page.reload();
  await expect(page.locator("#ws-street")).toHaveValue("Praça da Sé");
  await expect(page.locator("#ws-addressNumber")).toHaveValue("1");

  // Autônomo vê os aniversários dos seus pacientes, sem a idade.
  await page.goto("/app/pacientes/novo");
  await page.locator("#fullName").fill("Paciente do Davi E2E");
  await page.locator("#birthDate").fill(todayIn(2001));
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page.getByRole("heading", { name: "Paciente · Paciente do Davi E2E" })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Feliz aniversário, Davi!" })).toBeVisible();
  const card = page.locator("li", { hasText: "Paciente do Davi E2E" });
  await expect(card).toContainText("Hoje");
  await expect(card).not.toContainText("anos");

  // Desligar o lembrete de pacientes em Ajustes.
  await page.goto("/app/ajustes");
  await page.getByRole("checkbox", { name: /aniversários dos meus pacientes/ }).uncheck();
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByText("Perfil salvo.")).toBeVisible();
  await page.goto("/app");
  await expect(page.getByText("Paciente do Davi E2E")).toHaveCount(0);
});
