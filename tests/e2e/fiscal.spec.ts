// Fiscal de ponta a ponta: perfil fiscal (PF) → pagamento gera recibo "a enviar" → apuração do carnê-leão do mês →
// CSV do Carnê-Leão Web/Receita Saúde (16 campos, indicador S, responsável como pagador do menor) → confirmação de
// importação → recibo com valor por extenso → informe anual.
import { expect, test, type Page } from "@playwright/test";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function paidCharge(page: Page, patientId: string, amount: string) {
  await page.goto(`/app/financeiro/novo?patientId=${patientId}`);
  await page.locator("#amount").fill(amount);
  await page.locator("#dueDate").fill(today());
  await page.getByRole("button", { name: /Criar cobrança|Gerar cobrança/ }).click();
  await page.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByText("Pago", { exact: true })).toBeVisible();
  // Pessoa física: só o recibo (NFS-e é do consultório com CNPJ).
  await page.getByRole("button", { name: "Emitir recibo", exact: true }).click();
  await expect(page.getByText(/Recibo R\d{5}/)).toBeVisible();
}

test("fiscal: perfil, recibo, carnê-leão, CSV da Receita Saúde, recibo impresso e informe anual", async ({ page }) => {
  test.setTimeout(180_000);
  const tag = Date.now().toString().slice(-6);
  await page.goto("/signup");
  await page.getByText("Profissional autônomo", { exact: true }).click();
  await page.locator("#name").fill("Clara Fiscal");
  await page.locator("#email").fill(`fiscal-${tag}@example.com`);
  await page.locator("#password").fill("senha-segura-123");
  await page.locator("#passwordConfirm").fill("senha-segura-123");
  await page.locator("#workspaceName").fill(`Consultório Clara ${tag}`);
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/primeiros-passos$/);

  // Perfil fiscal: pessoa física, CPF do titular (inválido é recusado), ocupação 255 sugerida para psicologia.
  await page.goto("/app/fiscal");
  await expect(page.getByRole("heading", { level: 1, name: "Fiscal" })).toBeVisible();
  await expect(page.locator("#taxOccupation")).toHaveValue("255");
  // Sem CPF do titular, o arquivo não sai.
  expect((await page.request.get(`/app/fiscal/exportar?mes=${today().slice(0, 7)}`)).status()).toBe(400);
  await page.locator("#taxCpf").fill("111.111.111-11");
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByText("CPF inválido. Confira os 11 dígitos.")).toBeVisible();
  await page.locator("#taxCpf").fill("111.444.777-35");
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByText("Perfil fiscal salvo.")).toBeVisible();

  // Paciente adulto com CPF.
  await page.goto("/app/pacientes/novo");
  await page.locator("#fullName").fill(`Ana Pagadora ${tag}`);
  await page.locator("#cpf").fill("529.982.247-25");
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page.getByRole("heading", { name: `Paciente · Ana Pagadora ${tag}` })).toBeVisible();
  const patientId = page.url().split("/").pop()!;
  await paidCharge(page, patientId, "1250.50");

  // Menor de idade: a mãe paga (CPF do responsável) e o paciente é o beneficiário no arquivo da Receita.
  await page.goto("/app/pacientes/novo");
  await page.locator("#fullName").fill(`Beto Menor ${tag}`);
  await page.locator("#cpf").fill("390.533.447-05");
  await page.locator("#responsibleName").fill(`Carla Mãe ${tag}`);
  await page.locator("#responsibleCpf").fill("123.456.789-00");
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page.getByText("CPF do responsável inválido. Confira os 11 dígitos.")).toBeVisible();
  await page.locator("#responsibleCpf").fill("123.456.789-09");
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page.getByRole("heading", { name: `Paciente · Beto Menor ${tag}` })).toBeVisible();
  await paidCharge(page, page.url().split("/").pop()!, "300");

  await page.goto("/app/fiscal");
  await expect(page.getByText("Receita Saúde: 2 recibos a enviar.", { exact: false })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`Ana Pagadora ${tag}`) })).toContainText("A enviar");

  // Carnê-leão do mês corrente: rendimentos entram; com até R$ 5 mil o redutor zera o imposto.
  const month = today().slice(0, 7);
  await page.goto(`/app/fiscal/carne-leao?mes=${month}`);
  await expect(page.getByText("Rendimentos (2 pagamentos)")).toBeVisible();
  await expect(page.getByText("Sem imposto a pagar neste mês")).toBeVisible();

  // CSV para o Carnê-Leão Web: 16 campos, ocupação 255, valor sem milhar, indicador S e CPF do titular.
  const csv = await page.request.get(`/app/fiscal/exportar?mes=${month}`);
  expect(csv.status()).toBe(200);
  const lines = (await csv.text()).trim().split(/\r?\n/);
  expect(lines).toHaveLength(2);
  const adult = lines.find((l) => l.includes(";1250,50;"))!.split(";");
  expect(adult).toHaveLength(16);
  expect(adult.slice(1, 4)).toEqual(["R01.001.001", "255", "1250,50"]);
  expect(adult[7]).toBe("52998224725");
  expect(adult[8]).toBe("");
  expect(adult[13]).toBe("S");
  expect(adult[14]).toBe("11144477735");
  const minor = lines.find((l) => l.includes(";300,00;"))!.split(";");
  expect(minor[6]).toBe(`Carla Mãe ${tag}`);
  expect(minor[7]).toBe("12345678909");
  expect(minor[8]).toBe("39053344705");

  // Baixar não muda nada; depois de importar no Carnê-Leão Web, marca-se como exportado e eles saem do próximo arquivo.
  await page.goto("/app/fiscal");
  await expect(page.getByRole("row", { name: new RegExp(`Ana Pagadora ${tag}`) })).toContainText("A enviar");
  await page.goto(`/app/fiscal/carne-leao?mes=${month}`);
  await page.getByRole("button", { name: "Já importei: marcar 2 recibos como exportados" }).click();
  await expect(page.getByText("2 recibos marcados como exportados.")).toBeVisible();
  expect((await (await page.request.get(`/app/fiscal/exportar?mes=${month}`)).text()).trim()).toBe("");
  await page.goto("/app/fiscal");
  const row = page.getByRole("row", { name: new RegExp(`Ana Pagadora ${tag}`) });
  await expect(row).toContainText("Exportado (CSV)");

  // Recibo impresso com valor por extenso e CPF de quem recebeu; informe anual com o total.
  await row.getByRole("link", { name: /Imprimir recibo R\d+/ }).click();
  const receiptPage = await page.context().waitForEvent("page");
  await expect(receiptPage.getByText(/mil duzentos e cinquenta reais e cinquenta centavos/)).toBeVisible();
  await expect(receiptPage.getByText("CPF 111.444.777-35")).toBeVisible();
  await receiptPage.close();
  await page.goto(`/impressao/informe/${patientId}?ano=${month.slice(0, 4)}`);
  await expect(page.getByRole("cell", { name: /R\$\s?1\.250,50/ }).last()).toBeVisible();
});
