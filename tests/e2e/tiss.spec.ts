// Faturamento por convênio ponta a ponta: o XML baixado pela tela é validado contra o XSD oficial.
import { expect, test } from "@playwright/test";
import { createPatient, login, selectByText } from "./helpers";
import { validateTiss } from "../helpers/tiss-xsd";

test("convênio → paciente com carteirinha → sessão realizada → lote TISS válido", async ({ page }) => {
  const sufixo = Date.now().toString().slice(-6);
  await login(page, "guilherme");

  // Convênio e dados do prestador.
  await page.goto("/app/convenios");
  await page.locator("#name").fill(`Operadora E2E ${sufixo}`);
  await page.locator("#ansRegistry").fill("123456");
  await page.locator("#sessionPrice").fill("95.50");
  await page.getByRole("button", { name: "Cadastrar convênio" }).click();
  await page.locator("#cnpj").fill("12.345.678/0001-90");
  await page.getByRole("button", { name: "Salvar dados do prestador" }).click();
  await expect(page.locator("#cnpj")).toHaveValue("12.345.678/0001-90");

  // Psicóloga com CRP e UF.
  await page.goto("/app/equipe");
  await page.locator("#fullName").fill(`Psi TISS ${sufixo}`);
  await page.locator("#councilNumber").fill("09/12345");
  await page.locator("#councilUF").selectOption({ label: "GO" });
  await page.getByRole("button", { name: "Cadastrar profissional" }).click();

  // Paciente com convênio; uma segunda sem carteirinha.
  await page.goto("/app/pacientes/novo");
  await page.locator("#fullName").fill(`Beneficiária ${sufixo}`);
  await selectByText(page, "#insurancePlanId", `Operadora E2E ${sufixo}`);
  await page.locator("#insuranceCardNumber").fill("0099887766");
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page.getByText(/carteirinha 0099887766/)).toBeVisible();
  const semCarteira = await createPatient(page, `Sem Carteira ${sufixo}`);
  await page.goto(semCarteira);
  await selectByText(page, "#insurancePlanId", `Operadora E2E ${sufixo}`);
  await page.getByRole("button", { name: "Salvar convênio" }).click();

  // Duas sessões pelo convênio, ambas realizadas.
  for (const nome of [`Beneficiária ${sufixo}`, `Sem Carteira ${sufixo}`]) {
    await page.goto("/app/agenda/novo");
    await page.locator("#patientId").selectOption({ label: nome });
    await selectByText(page, "#professionalId", `Psi TISS ${sufixo}`);
    await page.locator("#startsAt").fill("2026-10-01T10:00");
    await page.locator("#modality").selectOption("presencial");
    await selectByText(page, "#billing", `Operadora E2E ${sufixo}`);
    await page.getByRole("button", { name: "Agendar sessão" }).click();
    await expect(page.getByRole("link", { name: "Ver cobrança" })).toHaveCount(0); // convênio não gera Pix
    await page.getByRole("button", { name: "Marcar realizada" }).click();
    await expect(page.getByText("Realizada")).toBeVisible();
  }

  // Faturamento: só a sessão com carteirinha fica pronta.
  await page.goto("/app/convenios");
  await page.getByRole("row", { name: new RegExp(`Operadora E2E ${sufixo}`) }).getByRole("link", { name: "Faturar" }).click();
  await expect(page.getByText("Paciente sem número da carteirinha.")).toBeVisible();
  await expect(page.getByText("1 pronta para faturar")).toBeVisible();
  await page.getByRole("button", { name: "Gerar lote TISS" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Lote \d+ gerado/ })).toBeVisible();

  // Linha do lote (a tabela de pendentes também mostra o tipo de guia e o valor).
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: "XML" }) }).first();
  await expect(row).toContainText("Guia SP/SADT");
  await expect(row).toContainText("R$ 95,50");
  const href = await row.getByRole("link", { name: "XML" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.headers()["content-type"]).toContain("ISO-8859-1");
  const bytes = new Uint8Array(await res.body());
  const xml = Buffer.from(bytes).toString("latin1");

  const result = await validateTiss(bytes);
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
  expect(xml).toContain("<ans:registroANS>123456</ans:registroANS>");
  expect(xml).toContain("<ans:CNPJ>12345678000190</ans:CNPJ>");
  expect(xml).toContain("<ans:numeroCarteira>0099887766</ans:numeroCarteira>");
  expect(xml).toContain("<ans:codigoProcedimento>50000470</ans:codigoProcedimento>");
  expect(xml).toContain("<ans:conselhoProfissional>09</ans:conselhoProfissional>");
  expect(xml).toContain("<ans:UF>52</ans:UF>");
  expect(xml).toContain("<ans:horaInicial>10:00:00</ans:horaInicial>");
  expect(xml).toContain("<ans:valorTotalGeral>95.50</ans:valorTotalGeral>");
  expect(xml).not.toContain("0099887766X");

  // A sessão faturada sai da lista; a sem carteirinha continua pendente.
  await expect(page.getByText(`Beneficiária ${sufixo}`)).toHaveCount(0);
  await expect(page.getByText(`Sem Carteira ${sufixo}`)).toBeVisible();
});

