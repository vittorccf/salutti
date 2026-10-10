import { expect, test } from "@playwright/test";
import { createPatient, login } from "./helpers";

// CPF válido de teste, diferente do usado no portal.spec.
const CPF = "111.444.777-35";
const PASSWORD = "chuva fina na janela";

test("cartão diário: modelo e pergunta própria, aceite, check-in completo, PHQ-9 com risco, alerta e CSV", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const tag = Date.now().toString().slice(-6);
  const name = `Paciente Cartao ${tag}`;
  await login(page, "guilherme");
  const patientUrl = await createPatient(page, name);
  await page.goto(`${patientUrl}/editar`);
  await page.locator("#birthDate").fill("1992-05-20");
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  // Profissional personaliza: modelo Humor (PHQ-9) + pergunta própria sim/não.
  await page.goto(`${patientUrl}/cartao`);
  await expect(page.getByRole("heading", { name: `Cartão diário · ${name}` })).toBeVisible();
  await expect(page.getByText(/O paciente ainda não usa o portal/)).toBeVisible();
  await page.getByRole("button", { name: /^Humor/ }).click();
  // PHQ-9 só entra com a confirmação do protocolo de risco.
  await expect(page.getByText(/Modelo "Humor" aplicado. O PHQ-9 entra depois/)).toBeVisible();
  await page.getByLabel("Pergunta 1", { exact: true }).fill("Fez a respiração 4-7-8?");
  await page.getByLabel("Tipo da pergunta 1").selectOption("yesno");
  await page.locator('input[name="instruments"][value="phq9"]').check();
  await page.getByRole("button", { name: "Salvar cartão" }).click();
  await expect(page.getByText("Para ligar o PHQ-9, confirme que avaliará os alertas conforme o seu protocolo de risco.")).toBeVisible();
  await page.getByLabel(/Entendo que o Salutti não monitora em tempo real/).check();
  await page.getByRole("button", { name: "Salvar cartão" }).click();
  await expect(page.getByText("Cartão salvo.")).toBeVisible();

  // Convite do portal.
  await page.goto(`${patientUrl}/portal`);
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const linkText = page.locator("p.font-mono", { hasText: "/portal/convite/" });
  await expect(linkText).toBeVisible();
  const invite = (await linkText.textContent())!.trim();

  const ctxP = await browser.newContext({ locale: "pt-BR" });
  const p = await ctxP.newPage();
  await p.goto(invite);
  await p.locator("#birthDate").fill("1992-05-20");
  await p.locator("#cpf").fill(CPF);
  await p.locator("#password").fill(PASSWORD);
  await p.locator("#confirm").fill(PASSWORD);
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Criar acesso e entrar" }).click();
  await expect(p).toHaveURL(/\/portal$/);

  // Aceite: o que é, quem vê, que não é em tempo real e os contatos de crise.
  await expect(p.getByText(/Ninguém acompanha em tempo real/)).toBeVisible();
  await expect(p.getByText(/ligue 188 \(CVV/)).toBeVisible();
  await p.getByLabel("Entendi e quero usar o cartão diário.").check();
  await p.getByRole("button", { name: "Começar" }).click();

  // Check-in com emoção, atividade, energia e a pergunta própria.
  await p.getByText("Bem", { exact: true }).click();
  await p.getByText("Calma", { exact: true }).click();
  await p.getByText("Exercício", { exact: true }).click();
  await p.getByText("Mais detalhes (opcional)").click();
  await p.locator("#energy").selectOption("4");
  await p.locator("#sleepHours").fill("7,5");
  await p.getByLabel("Fez a respiração 4-7-8?").selectOption("sim");
  await p.getByRole("button", { name: "Registrar" }).click();
  await expect(p.getByText("Registro salvo. Obrigado por contar.")).toBeVisible();
  await expect(p.getByText("Você registrou 1 dia este mês.")).toBeVisible();

  // PHQ-9 vence na hora (nunca respondido). Item 9 acima de zero leva à tela de apoio.
  await expect(p.getByText("Questionário: PHQ-9 (humor)")).toBeVisible();
  for (let i = 1; i <= 8; i++) await p.locator(`input[name="i${i}"][value="0"]`).check();
  await p.locator('input[name="i9"][value="1"]').check();
  await p.getByRole("button", { name: "Enviar respostas" }).click();
  await expect(p).toHaveURL(/apoio=1/);
  await expect(p.getByRole("heading", { name: "Obrigado por contar como você está" })).toBeVisible();
  await expect(p.getByRole("link", { name: /Ligue 188/ })).toHaveAttribute("href", "tel:188");
  await expect(p.getByText("Questionário: PHQ-9 (humor)")).toHaveCount(0);
  await ctxP.close();

  // Profissional: faixa de alerta no topo de qualquer tela, com link para o cartão do paciente.
  await page.goto("/app");
  await page.getByRole("alert").filter({ hasText: "Cartão diário:" }).getByRole("link", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/cartao$/);
  const alert = page.getByRole("alert").filter({ hasText: "Resposta que pede atenção" });
  await expect(alert).toContainText('item 9 respondido como "Vários dias"');
  await expect(page.getByRole("cell", { name: "1 / 27" })).toBeVisible();
  await expect(page.getByText("Calma · 1")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Sim", exact: true })).toBeVisible();
  await alert.getByLabel("Conduta (opcional)").fill("Liguei e avaliei o risco.");
  await alert.getByRole("button", { name: "Registrar conduta" }).click();
  await expect(page.getByText("Resposta que pede atenção")).toHaveCount(0);
  await expect(page.getByText(/Conduta registrada por .*: Liguei e avaliei o risco\./)).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Cartão diário:" })).toHaveCount(0);
  const csv = await page.request.get(`${patientUrl}/cartao/csv`);
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body).toContain("Humor (1 a 5)");
  expect(body).toContain("Fez a respiração 4-7-8?");
  expect(body).toContain("Calma");
});
