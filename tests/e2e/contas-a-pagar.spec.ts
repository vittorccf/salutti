import { expect, test } from "@playwright/test";
import { mod10, mod11Bancario } from "@/lib/boleto";
import { login } from "./helpers";

// Boleto do Banco do Brasil com fator 1605 (20/10/2026, no ciclo que recomeçou em 22/02/2025) e R$ 1,00.
function buildBoleto(factor: string, amount10: string) {
  const rest = factor + amount10 + "0500940144816060680935031";
  const barcode = "0019" + mod11Bancario("0019" + rest) + rest;
  const f1 = barcode.slice(0, 4) + barcode.slice(19, 24);
  const f2 = barcode.slice(24, 34);
  const f3 = barcode.slice(34, 44);
  return f1 + mod10(f1) + f2 + mod10(f2) + f3 + mod10(f3) + barcode[4] + barcode.slice(5, 19);
}
const BOLETO = buildBoleto("1605", "0000000100");

test("contas a pagar: boleto lido, parcelas, pagamento com juros, anexo, estorno, relatórios e isolamento", async ({ page, browser }) => {
  const tag = Date.now().toString().slice(-6);
  await login(page, "guilherme");

  // Abas do financeiro e plano de contas padrão.
  await page.goto("/app/financeiro");
  await page.getByRole("navigation", { name: "Áreas do financeiro" }).getByRole("link", { name: "Contas a pagar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Contas a pagar" })).toBeVisible();
  await page.getByRole("link", { name: "Plano de contas" }).click();
  await expect(page.getByRole("heading", { name: "Ocupação do consultório" })).toBeVisible();
  await expect(page.locator('input[value="Aluguel ou sublocação de sala"]')).toBeVisible();

  // Conta única com boleto: valor e vencimento preenchidos pela linha digitável; categoria marca "dedutível".
  await page.goto("/app/financeiro/pagar/nova");
  await page.locator("#description").fill(`Condomínio ${tag}`);
  await page.locator("#supplierId").selectOption("__new");
  await page.locator("#newSupplierName").fill(`Condomínio Ed. Central ${tag}`);
  const condominio = await page.locator("#categoryId option", { hasText: "Condomínio" }).first().getAttribute("value");
  await page.locator("#categoryId").selectOption(condominio!);
  await expect(page.locator('input[name="deductible"]')).toBeChecked();
  await page.locator("#barcode").fill(BOLETO);
  await expect(page.locator("#amount")).toHaveValue("1,00");
  await expect(page.locator("#dueDate")).toHaveValue("2026-10-20");
  await expect(page.getByText(/Boleto lido: valor R\$\s?1,00/)).toBeVisible();
  await page.locator("#dueDate").fill("2026-10-05");
  await page.locator("#amount").fill("100,00");
  await page.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Condomínio ${tag} · R\\$\\s?100,00`) })).toBeVisible();

  // Linha digitável com DV errado é recusada no servidor também.
  await page.goto("/app/financeiro/pagar/nova");
  await page.locator("#description").fill(`Errado ${tag}`);
  await page.locator("#categoryId").selectOption(condominio!);
  await page.locator("#amount").fill("10,00");
  await page.locator("#barcode").fill(BOLETO.slice(0, 5) + ((Number(BOLETO[5]) + 1) % 10) + BOLETO.slice(6));
  await expect(page.getByText("Dígito verificador não confere. Confira os números.")).toBeVisible();
  await page.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByText("Linha digitável com dígito verificador errado. Confira os números do boleto.")).toBeVisible();

  // Pagamento parcial com juros, depois o restante; estorno volta o saldo.
  await page.goto("/app/financeiro/pagar?status=all&q=" + encodeURIComponent(`Condomínio ${tag}`));
  await page.getByRole("link", { name: `Condomínio ${tag}` }).click();
  await page.locator("#paidAt").fill("2026-10-06");
  await page.locator("#paidAmount").fill("45,00");
  await page.locator("#interest").fill("5,00");
  await page.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(page.getByText("Pagamento registrado.")).toBeVisible();
  await expect(page.getByText(/Saldo: R\$\s?60,00/)).toBeVisible();
  await expect(page.getByText(/Saiu do caixa: R\$\s?45,00/)).toBeVisible();
  await page.locator("#paidAmount").fill("60,00");
  await page.locator("#interest").fill("");
  await page.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(page.getByText("Paga", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Estornar" }).last().click();
  await expect(page.getByText(/Estornado em/)).toBeVisible();
  await expect(page.getByText(/Saldo: R\$\s?60,00/)).toBeVisible();

  // Anexo em PDF (só papéis do financeiro baixam).
  await page.locator("#att-file").setInputFiles({ name: "boleto.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%teste\n") });
  await page.getByRole("button", { name: "Anexar" }).click();
  await expect(page.getByText("Anexo enviado.")).toBeVisible();
  const attachment = page.getByRole("link", { name: /boleto\.pdf/ });
  const attachmentHref = await attachment.getAttribute("href");
  const res = await page.request.get(attachmentHref!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  const payableUrl = page.url();

  // Parcelada em 3: centavos sobrando vão para a primeira; a mesma competência nas três.
  await page.goto("/app/financeiro/pagar/nova");
  await page.locator("#description").fill(`Cadeira ${tag}`);
  const equip = await page.locator("#categoryId option", { hasText: "Equipamentos e móveis" }).first().getAttribute("value");
  await page.locator("#categoryId").selectOption(equip!);
  await page.locator("#amount").fill("100,00");
  await page.locator("#dueDate").fill("2026-11-10");
  await page.getByLabel("Parcelada").check();
  await page.locator("#installments").fill("3");
  await page.locator("#weekendRule").selectOption("keep");
  await page.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByRole("heading", { name: "Parcelas" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /R\$\s?33,34/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /R\$\s?33,33/ })).toHaveCount(2);

  // Lista: filtro, exportação CSV e pagamento em lote.
  await page.goto("/app/financeiro/pagar?status=open&q=" + encodeURIComponent(`Cadeira ${tag}`));
  await expect(page.getByText(/parcela 1\/3/)).toBeVisible();
  const csv = await page.request.get(`/app/financeiro/pagar/exportar?status=open&q=${encodeURIComponent(`Cadeira ${tag}`)}`);
  const csvText = await csv.text();
  expect(csvText).toContain(`Cadeira ${tag} (1/3);`);
  expect(csvText).toContain("33,34");
  await page.getByRole("checkbox", { name: `Selecionar Cadeira ${tag}` }).first().check();
  await page.getByRole("button", { name: "Marcar selecionadas como pagas" }).click();
  await expect(page.getByText("1 conta marcada como paga.")).toBeVisible();

  // Relatórios: Livro-Caixa e DRE do ano.
  await page.goto("/app/financeiro/relatorios?view=livro&year=2026");
  await expect(page.getByRole("heading", { name: "Livro-Caixa" })).toBeVisible();
  await expect(page.getByRole("link", { name: `Condomínio ${tag}` })).toBeVisible();
  await page.goto("/app/financeiro/relatorios?view=dre&year=2026");
  await expect(page.getByRole("cell", { name: "(-) Ocupação do consultório" })).toBeVisible();
  const dreCsv = await page.request.get("/app/financeiro/relatorios/exportar?view=dre&year=2026");
  expect(await dreCsv.text()).toContain("Resultado");

  // Outro consultório não vê a conta nem o anexo.
  const other = await browser.newContext({ locale: "pt-BR" });
  const otherPage = await other.newPage();
  await login(otherPage, "kris");
  expect((await otherPage.goto(payableUrl))?.status()).toBe(404);
  expect((await otherPage.request.get(attachmentHref!)).status()).toBe(404);
  await other.close();
});
