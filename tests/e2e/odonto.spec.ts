// Salutti Odonto de ponta a ponta: cadastro do dentista → tabela de procedimentos → odontograma → plano por dente →
// aprovação com parcelas → procedimento realizado atualiza o odontograma → orçamento impresso → prótese e retornos.
import { expect, test } from "@playwright/test";
import { createPatient } from "./helpers";

test("odonto: cadastro → tabela → odontograma → plano aprovado com parcelas → realizado → impressão, prótese e retornos", async ({ page }) => {
  test.setTimeout(180_000);
  const tag = Date.now().toString().slice(-6);
  const email = `odonto-${tag}@example.com`;

  // Página da área e cadastro: dentista autônomo, clínica geral.
  await page.goto("/odonto");
  await expect(page.getByRole("img", { name: "Salutti Odonto" }).first()).toBeVisible();
  await expect(page.getByRole("figure", { name: "Exemplo de odontograma" })).toBeVisible();
  await page.goto("/odonto/cadastro");
  await expect(page.getByText("Criar sua conta na Salutti Odonto")).toBeVisible();
  await page.getByText("Profissional autônomo", { exact: true }).click();
  await expect(page.locator("#segment")).toHaveValue("odonto_clinico");
  await page.locator("#name").fill("Renata Dentista");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("senha-segura-123");
  await page.locator("#passwordConfirm").fill("senha-segura-123");
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/primeiros-passos$/);

  // Marca e menu: planos, retornos e prótese; convênios ligado (GTO), sem cartão diário.
  const aside = page.locator("aside");
  await expect(aside.getByRole("img", { name: "Salutti Odonto" })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Planos e orçamentos" })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Retornos" })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Prótese" })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Convênios" })).toBeVisible();

  // Dentista com CRO por padrão.
  await expect(page.locator("#professionalType")).toHaveValue("dentista");
  await expect(page.locator("#councilType")).toHaveValue("CRO");
  await page.locator("#councilNumber").fill("12345");
  await page.locator("#councilUF").selectOption({ label: "GO" });
  await page.getByRole("button", { name: "Cadastrar profissional" }).click();
  await expect(page.getByRole("button", { name: "Cadastrar profissional" })).toHaveCount(0);

  // Tabela: carrega a sugerida e inclui um procedimento com preço e TUSS.
  await page.goto("/app/planos/tabela");
  await page.getByRole("button", { name: "Carregar tabela sugerida" }).click();
  await expect(page.getByText(/procedimentos carregados/)).toBeVisible();
  await page.getByText("Novo procedimento").click();
  await page.locator("#name-new").fill(`Resina 3 faces ${tag}`);
  await page.locator("#spec-new").selectOption("dentistica");
  await page.locator("#price-new").fill("280,00");
  await page.locator("#tuss-new").fill("8510009");
  await page.locator("#result-new").selectOption("restaurado");
  await page.locator("#ret-new").fill("6");
  await page.getByRole("button", { name: "Incluir", exact: true }).click();
  await expect(page.getByText("O código TUSS tem 8 dígitos.")).toBeVisible();
  await page.locator("#tuss-new").fill("85100099");
  await page.getByRole("button", { name: "Incluir", exact: true }).click();
  await expect(page.getByText(`Resina 3 faces ${tag} salvo.`)).toBeVisible();

  // Odontograma: 16 a tratar nas faces MOD.
  const patientUrl = await createPatient(page, `Paulo Mendes ${tag}`);
  await page.getByRole("link", { name: "Odontograma" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Odontograma" })).toBeVisible();
  await page.getByRole("link", { name: "Dente 16: Hígido" }).click();
  await expect(page.getByRole("heading", { name: "Dente 16" })).toBeVisible();
  await page.locator("#status").selectOption("carie");
  for (const f of ["M", "O", "D"]) await page.locator(`#face-16-${f}`).check();
  await page.getByRole("button", { name: "Salvar dente" }).click();
  await expect(page.getByText("Dente 16 atualizado.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Dente 16: Cárie / a tratar" })).toBeVisible();

  // Plano de tratamento a partir do odontograma.
  await page.getByRole("button", { name: "Novo plano" }).click();
  await expect(page).toHaveURL(/\/app\/planos\/[a-z0-9]+$/);
  await expect(page.getByText("Em estudo").first()).toBeVisible();
  await page.locator("#procedureId").selectOption({ label: `Resina 3 faces ${tag} · R$ 280,00 · por dente` });
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByText(`Resina 3 faces ${tag} é por dente: escolha o dente.`)).toBeVisible();
  await page.locator("#tooth").selectOption("16");
  for (const f of ["M", "O", "D"]) await page.locator(`#add-face-${f}`).check();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByText(`Resina 3 faces ${tag} adicionado.`)).toBeVisible();
  await page.locator("#procedureId").selectOption({ label: "Extração simples · por dente" });
  await page.locator("#tooth").selectOption("48");
  await page.locator("#price").fill("150,00");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByText("Extração simples adicionado.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "16 · MOD" })).toBeVisible();

  // Condições: 2 parcelas e R$ 30 de desconto → total R$ 400,00.
  await page.locator("#professionalId").selectOption({ label: "Renata Dentista" });
  await page.locator("#discount").fill("30,00");
  await page.locator("#installments").fill("2");
  await page.getByRole("button", { name: "Salvar condições" }).click();
  await expect(page.getByText("Condições salvas.")).toBeVisible();
  await expect(page.getByText(/Em 2 vezes de R\$\s?200,00/)).toBeVisible();

  // Aprovação: duas parcelas em Cobranças.
  await page.getByRole("button", { name: "Aprovar orçamento" }).click();
  await expect(page.getByText("Orçamento aprovado. 2 parcelas geradas em Cobranças.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^1\/2 · / })).toBeVisible();
  await expect(page.getByRole("link", { name: /^2\/2 · / })).toBeVisible();

  // Realizados: o 16 fica restaurado e o 48 ausente; o plano conclui.
  // Realizado vira evolução no prontuário (com a anotação clínica).
  const row16 = page.getByRole("row").filter({ hasText: `Resina 3 faces ${tag}` });
  await row16.locator("summary").click();
  await row16.getByLabel("Evolução (vai para o prontuário)").fill("Lidocaína 2% c/ epinefrina, 1 tubete. Sem intercorrências.");
  await row16.getByRole("button", { name: "Confirmar realizado" }).click();
  await expect(page.getByText(`Resina 3 faces ${tag} realizado. Odontograma atualizado.`)).toBeVisible();
  const row48 = page.getByRole("row").filter({ hasText: "Extração simples" });
  await row48.locator("summary").click();
  await row48.getByRole("button", { name: "Confirmar realizado" }).click();
  await expect(page.getByText("Concluído").first()).toBeVisible();
  const planUrl = page.url();
  await page.goto(`${patientUrl}/odontograma`);
  await expect(page.getByRole("link", { name: "Dente 16: Restaurado" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dente 48: Ausente" })).toBeVisible();

  // Orçamento impresso com dente, faces e assinatura.
  const planId = planUrl.split("/").pop();
  await page.goto(`/impressao/orcamento/${planId}`);
  await expect(page.getByText("16 · MOD")).toBeVisible();
  await expect(page.getByText(/li e aprovo este orçamento/)).toBeVisible();
  await expect(page.getByText("CRO-GO 12345").first()).toBeVisible();
  await expect(page.getByText(/não constitui promessa de resultado/)).toBeVisible();

  // Retorno nasceu da resina (6 meses); inclui outro já vencido e registra o contato.
  await page.goto("/app/retornos?ver=todos");
  await expect(page.getByRole("listitem").filter({ hasText: `Paulo Mendes ${tag}` }).filter({ hasText: "Revisão" })).toBeVisible();
  await page.getByText("Novo retorno").click();
  await page.locator("#patientId").selectOption({ label: `Paulo Mendes ${tag}` });
  await page.locator("#reason").selectOption("periodontal");
  await page.locator("#dueDate").fill("2026-01-15");
  await page.getByRole("button", { name: "Agendar retorno" }).click();
  await expect(page.getByText(`Retorno de Paulo Mendes ${tag} agendado.`)).toBeVisible();
  await page.goto("/app/retornos?ver=vencidos");
  const recall = page.getByRole("listitem").filter({ hasText: "Manutenção periodontal" }).first();
  await recall.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("Contato registrado.")).toBeVisible();

  // Prótese: ordem enviada e recebida do laboratório.
  await page.goto("/app/protese");
  await page.getByText("Nova ordem de serviço").click();
  await page.locator("#patientId").selectOption({ label: `Paulo Mendes ${tag}` });
  await page.locator("#lab").fill("Lab Sorriso");
  await page.locator("#work").fill("Coroa metalocerâmica");
  await page.locator("#teeth").fill("16");
  await page.locator("#shade").fill("A2");
  await page.getByRole("button", { name: "Registrar ordem" }).click();
  await expect(page.getByText("Ordem de Coroa metalocerâmica registrada.")).toBeVisible();
  const order = page.getByRole("listitem").filter({ hasText: "Coroa metalocerâmica" });
  await expect(order.getByText("No laboratório")).toBeVisible();
  await order.getByRole("combobox").selectOption("recebido");
  await order.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("Etapa atualizada.")).toBeVisible();
});
