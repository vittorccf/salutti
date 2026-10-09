import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("lista de espera: cadastro manual, vaga que combina, formulário público, urgência e virar paciente", async ({ page, browser }) => {
  const tag = Date.now().toString().slice(-6);
  const slug = `espera-${tag}`;
  await login(page, "guilherme");

  // A página pública mostra quem atende com o registro: cadastra uma profissional com CRP.
  await page.goto("/app/equipe");
  await page.locator("#fullName").fill(`Dra. Lia ${tag}`);
  await page.locator("#councilNumber").fill(`09/${tag}`);
  await page.getByRole("button", { name: "Cadastrar profissional" }).click();
  await expect(page.getByRole("cell", { name: `Dra. Lia ${tag}`, exact: true })).toBeVisible();
  await page.goto("/app");

  await page.getByRole("link", { name: "Lista de espera" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Lista de espera" })).toBeVisible();

  // Cadastro manual: noite de quarta, online.
  await page.getByText("Incluir na lista").click();
  await page.locator("#name-new").fill(`Ana Espera ${tag}`);
  await page.locator("#email-new").fill(`ana${tag}@exemplo.com`);
  await page.locator("#modality-new").selectOption("online");
  await page.locator('input[name="days"][value="qua"]').first().check();
  await page.locator('input[name="shifts"][value="noite"]').first().check();
  await page.locator("#reason-new").fill("Ansiedade no trabalho");
  await page.getByRole("button", { name: "Incluir", exact: true }).click();
  await expect(page.getByText(`Ana Espera ${tag} salvo na lista.`)).toBeVisible();
  const card = page.getByRole("listitem").filter({ hasText: `Ana Espera ${tag}` });
  await expect(card.getByText("Motivo: Ansiedade no trabalho")).toBeVisible();

  // Abriu uma vaga: quarta à noite combina; segunda de manhã, não.
  await page.locator("#dia").selectOption("qua");
  await page.locator("#turno").selectOption("noite");
  await page.getByRole("button", { name: "Ver quem combina" }).click();
  await expect(page.getByText(`Ana Espera ${tag}`)).toBeVisible();
  await page.locator("#dia").selectOption("seg");
  await page.locator("#turno").selectOption("manha");
  await page.getByRole("button", { name: "Ver quem combina" }).click();
  await expect(page.getByText(`Ana Espera ${tag}`)).toHaveCount(0);
  await page.getByRole("link", { name: "Limpar" }).click();

  // Registrar contato muda para "Contatado".
  await card.getByRole("button", { name: "Registrar contato" }).click();
  await expect(card.getByText("1 contato")).toBeVisible();

  // Formulário público: endereço inválido é recusado; depois abre.
  await page.locator('input[name="public"]').check();
  await page.locator("#slug").fill("-ana-");
  await page.getByRole("button", { name: "Salvar formulário" }).click();
  await expect(page.getByText("Use de 3 a 40 letras minúsculas, números ou hífen.")).toBeVisible();
  await page.locator("#slug").fill(slug);
  await page.locator("#estimate").fill("de 30 a 60 dias");
  await page.getByRole("button", { name: "Salvar formulário" }).click();
  await expect(page.getByText("Formulário público salvo.")).toBeVisible();
  await expect(page.getByText(`/espera/${slug}`)).toBeVisible();

  // Visitante sem login se inscreve marcando urgência: vê os contatos de crise.
  const visitor = await browser.newContext();
  const pub = await visitor.newPage();
  await pub.goto(`/espera/${slug}`);
  await expect(pub.getByText(/188 \(CVV/)).toBeVisible();
  await expect(pub.getByText("Previsão de espera: de 30 a 60 dias.")).toBeVisible();
  await expect(pub.getByRole("list", { name: "Quem atende" }).getByText(`CRP 09/${tag}`)).toBeVisible();
  await pub.locator("#fullName").fill(`Bruno Publico ${tag}`);
  await pub.locator("#email").fill(`bruno${tag}@exemplo.com`);
  await pub.locator('input[name="urgent"]').check();
  await pub.locator('input[name="consent"]').check();
  // Menor de idade sem o responsável é recusado; o campo aparece ao marcar.
  await expect(pub.locator("#guardianName")).toBeHidden();
  await pub.locator('input[name="isMinor"]').check();
  await expect(pub.locator("#guardianName")).toBeVisible();
  await pub.getByRole("button", { name: "Entrar na lista" }).click();
  await expect(pub.getByText("Para menor de idade, informe o nome do responsável.")).toBeVisible();
  await pub.locator('input[name="isMinor"]').uncheck();
  await pub.getByRole("button", { name: "Entrar na lista" }).click();
  await expect(pub.getByRole("heading", { name: "Inscrição feita" })).toBeVisible();
  await expect(pub.getByText(/188 \(CVV/)).toBeVisible();
  await visitor.close();

  // Aparece para a equipe como urgente, vindo do formulário.
  await page.goto("/app/lista-espera");
  await expect(page.getByRole("alert").filter({ hasText: "ajuda urgente" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Lista de espera.*inscriç(ão|ões) urgente/ }).first()).toBeVisible();
  const bruno = page.getByRole("listitem").filter({ hasText: `Bruno Publico ${tag}` });
  await expect(bruno.getByText("Pelo formulário")).toBeVisible();
  await expect(bruno.getByText("Urgente")).toBeVisible();

  // Virou paciente: cria o cadastro e abre a agenda com ele.
  await card.getByRole("button", { name: "Virou paciente" }).click();
  await expect(page).toHaveURL(/\/app\/agenda\/novo\?patientId=/);
  await page.goto("/app/lista-espera?ver=agendados");
  await expect(page.getByRole("listitem").filter({ hasText: `Ana Espera ${tag}` }).getByRole("link", { name: "Abrir paciente" })).toBeVisible();

  // Desligado, o link público some.
  await page.goto("/app/lista-espera");
  await page.locator('input[name="public"]').uncheck();
  await page.getByRole("button", { name: "Salvar formulário" }).click();
  await expect(page.getByText("Formulário público salvo.")).toBeVisible();
  const res = await page.request.get(`/espera/${slug}`);
  expect(res.status()).toBe(404);
});
