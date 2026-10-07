// Salutti Estética de ponta a ponta: cadastro da profissional autônoma → estoque com lote → procedimento com kit →
// sessão com termo aceito e procedimento registrado → baixa no lote, rastreabilidade, retorno e alerta no painel.
import { expect, test } from "@playwright/test";
import { createPatient, selectByText } from "./helpers";

// Data de hoje em São Paulo, deslocada em anos ("2027-10-07").
const dateInYears = (years: number) => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).split("-");
  return `${Number(y) + years}-${m}-${d}`;
};

test("estética: cadastro → estoque → procedimento com kit → sessão registrada → baixa, rastreio e alertas", async ({ page }) => {
  const email = `estetica-${Date.now()}@example.com`;

  // Cadastro pela página da Salutti Estética: autônoma já escolhida, segmento de farmácia estética.
  await page.goto("/estetica/cadastro");
  await expect(page.getByRole("radio", { name: /Profissional autônomo/ })).toBeChecked();
  await expect(page.locator("#segment")).toHaveValue("estetica_farmacia");
  await page.locator("#name").fill("Ana Esteta");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("senha-segura-123");
  await page.locator("#passwordConfirm").fill("senha-segura-123");
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/primeiros-passos$/);

  // Marca e menu da área: Procedimentos e Estoque, sem Convênios.
  const aside = page.locator("aside");
  await expect(aside.getByRole("img", { name: "Salutti Estética" })).toBeVisible();
  // O selo "estética" faz parte do arquivo do logo (Cormorant em curvas).
  await expect(aside.locator('img[src*="salutti-estetica-logo"]').first()).toBeVisible();
  await expect(aside.getByRole("link", { name: "Procedimentos" })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Estoque" })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Convênios" })).toHaveCount(0);

  // Profissional nos primeiros passos: farmacêutica com CRF por padrão.
  await expect(page.locator("#fullName")).toHaveValue("Ana Esteta");
  await expect(page.locator("#professionalType")).toHaveValue("farmaceutico");
  await expect(page.locator("#councilType")).toHaveValue("CRF");
  await page.locator("#councilNumber").fill("12345");
  await page.locator("#councilUF").selectOption({ label: "MT" });
  await page.getByRole("button", { name: "Cadastrar profissional" }).click();
  await expect(page.getByRole("button", { name: "Cadastrar profissional" })).toHaveCount(0);

  // Estoque: produto com validade depois de aberto e mínimo; entrada do lote L123.
  await page.goto("/app/estoque");
  await page.getByRole("link", { name: "Novo produto" }).first().click();
  await page.locator("#name").fill("Toxina botulínica");
  await page.locator("#unit").selectOption("U");
  await page.locator("#openShelfLifeHours").fill("72");
  await page.locator("#minStock").fill("100");
  await page.getByRole("button", { name: "Cadastrar produto" }).click();
  await expect(page.getByRole("heading", { name: /Toxina botulínica/ })).toBeVisible();
  await page.locator("#lotNumber").fill("L123");
  await page.locator("#expiresAt").fill(dateInYears(1));
  await page.locator("#quantity").fill("100");
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  const lotRow = page.getByRole("row", { name: /^L123/ });
  await expect(lotRow).toContainText("100 U");
  await expect(page.getByText("Saldo utilizável: 100 U")).toBeVisible();
  const productUrl = page.url();

  // Procedimento com retorno de 120 dias e kit de 50 U do produto.
  await page.goto("/app/procedimentos/novo");
  await page.locator("#name").fill("Toxina botulínica");
  await page.locator("#category").selectOption("injetavel");
  await page.locator("#durationMinutes").fill("45");
  await page.locator("#price").fill("1200");
  await page.locator("#returnDays").fill("120");
  await page.getByRole("button", { name: "Adicionar insumo" }).click();
  await page.locator('select[name="supplyProduct"]').selectOption({ label: "Toxina botulínica (U)" });
  await page.locator('input[name="supplyQuantity"]').fill("50");
  await page.locator("#consentText").fill("Declaro que fui informada sobre riscos, cuidados e ausência de garantia de resultado.");
  await page.getByRole("button", { name: "Cadastrar procedimento" }).click();
  await expect(page).toHaveURL(/\/app\/procedimentos$/);
  await expect(page.getByText("Toxina botulínica").first()).toBeVisible();

  // Paciente e sessão com o procedimento (duração e valor vêm dele).
  const patientUrl = await createPatient(page, "Paciente Estética E2E");
  await page.goto("/app/agenda/novo");
  await page.locator("#patientId").selectOption({ label: "Paciente Estética E2E" });
  await page.locator("#procedureId").selectOption({ label: "Toxina botulínica · 45 min" });
  await expect(page.locator("#durationMinutes")).toHaveValue("45");
  await expect(page.locator("#price")).toHaveValue("1200");
  await selectByText(page, "#professionalId", "Ana Esteta");
  await page.getByRole("button", { name: "Agendar sessão" }).click();
  await expect(page.getByRole("heading", { name: "Sessão · Paciente Estética E2E" })).toBeVisible();
  const sessionUrl = page.url();

  // Termo aceito e procedimento registrado (lote automático, FEFO).
  await expect(page.getByText("A paciente ainda não aceitou esta versão do termo.")).toBeVisible();
  // Assinatura da paciente na tela: um traço no quadro de assinatura.
  const pad = page.getByRole("img", { name: "Assinatura da paciente" });
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 30, { steps: 8 });
  await page.mouse.move(box.x + 220, box.y + 80, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText(/Assinatura colhida/)).toBeVisible();
  await page.getByRole("button", { name: "Registrar termo aceito" }).click();
  await expect(page.getByText(/Termo aceito e assinado em/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Assinatura da paciente no termo" })).toBeVisible();
  await expect(page.locator("#quantity-0")).toHaveValue("50");
  await page.getByRole("button", { name: "Registrar procedimento" }).click();
  await expect(page.getByText("Procedimento registrado e estoque atualizado.")).toBeVisible();

  // Sessão: lote aplicado e retorno sugerido.
  const applied = page.getByRole("row", { name: /L123/ });
  await expect(applied).toContainText("Toxina botulínica");
  await expect(applied).toContainText("50 U");
  await expect(page.getByText("Retorno sugerido")).toBeVisible();
  await expect(page.getByText(/120 dias depois desta sessão/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Agendar retorno" })).toBeVisible();

  // Estoque: saldo do lote L123 caiu para 50 U.
  await page.goto(productUrl);
  await expect(page.getByRole("row", { name: /^L123/ })).toContainText("50 U");
  await expect(page.getByText("Saldo utilizável: 50 U")).toBeVisible();

  // Rastreabilidade: a tela do lote mostra a paciente e a sessão.
  await page.getByRole("link", { name: "Quem recebeu" }).click();
  await expect(page.getByRole("heading", { name: /Lote L123 · quem recebeu/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Paciente Estética E2E" })).toBeVisible();
  await page.getByRole("row", { name: /Paciente Estética E2E/ }).getByRole("link").nth(1).click();
  await expect(page).toHaveURL(sessionUrl);

  // Painel: alerta de estoque abaixo do mínimo (50 U de 100 U).
  await page.goto("/app");
  await expect(page.getByText("Estoque · 1 alerta")).toBeVisible();
  await expect(page.getByRole("link", { name: "1 abaixo do mínimo" })).toBeVisible();
  await page.goto("/app/estoque");
  await expect(page.getByText("Saldo 50 U, mínimo 100 U")).toBeVisible();

  // Estorno de lançamento errado: o saldo volta ao lote e a sessão pode ser registrada de novo.
  await page.goto(sessionUrl);
  await page.getByText("Estornar registro (lançamento errado)").click();
  await page.locator("#reverse-reason").fill("Quantidade lançada errada");
  await page.getByRole("button", { name: "Estornar e devolver ao estoque" }).click();
  await expect(page.getByText(/Registro estornado/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar procedimento" })).toBeVisible();
  await page.goto(productUrl);
  await expect(page.getByText("Saldo utilizável: 100 U")).toBeVisible();

  // Fotos clínicas: antes, ligada à sessão, com divulgação autorizada; depois revogada e removida com motivo.
  await page.goto(patientUrl);
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 48;
    const x = c.getContext("2d")!;
    x.fillStyle = "#d8c8ee";
    x.fillRect(0, 0, 64, 48);
    return c.toDataURL("image/png");
  });
  await page.locator('input[name="photo"]').setInputFiles({ name: "antes.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") });
  await page.locator('input[name="photoConsent"]').check();
  await page.locator("#photo-session").selectOption({ index: 1 });
  await page.locator('input[name="allowMarketing"]').check();
  await page.getByRole("button", { name: "Adicionar foto" }).click();
  await expect(page.getByText("Foto adicionada.")).toBeVisible();
  await expect(page.getByText("Divulgação autorizada")).toBeVisible();
  await page.getByRole("button", { name: "Revogar divulgação" }).click();
  await expect(page.getByText("Divulgação autorizada")).toHaveCount(0);
  await page.getByText("Remover foto").click();
  await page.getByPlaceholder("Motivo da remoção").fill("Foto duplicada");
  await page.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(page.getByText(/Nenhuma foto clínica ainda/)).toBeVisible();
});
