import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// O segundo teste usa a senha definida no primeiro.
test.describe.configure({ mode: "serial" });

// Senha inicial do admin no banco dos testes (scripts/e2e-server.mjs); a de produção não está no repositório.
const INITIAL_PASSWORD = "senha-inicial-e2e";
const NEW_PASSWORD = "backoffice-seguro-123";

test("backoffice: admin entra com a senha inicial, troca a senha provisória e vê planos, clientes e chamados", async ({ page, context }) => {
  // Sem sessão, qualquer tela manda para o login do backoffice.
  await page.goto("/backoffice/chamados");
  await expect(page).toHaveURL(/\/backoffice\/login$/);

  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Usuário ou senha incorretos.")).toBeVisible();

  await page.locator("#username").fill("admin");
  await page.locator("#password").fill(INITIAL_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Senha provisória: troca obrigatória antes de qualquer outra tela.
  await expect(page).toHaveURL(/\/backoffice\/senha$/);
  await page.goto("/backoffice/clientes");
  await expect(page).toHaveURL(/\/backoffice\/senha$/);
  await page.locator("#current").fill(INITIAL_PASSWORD);
  await page.locator("#password").fill(NEW_PASSWORD);
  await page.locator("#confirm").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();

  // A sessão do backoffice não vale no app dos consultórios.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/backoffice/planos");
  for (const name of ["Teste grátis", "Básico", "Essencial", "Anual"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Mensal · R$ 49,90/mês")).toBeVisible();
  await expect(page.getByText("Mensal · R$ 89,90/mês")).toBeVisible();
  await expect(page.getByText("Anual · R$ 749,90/ano")).toBeVisible();

  await page.goto("/backoffice/chamados");
  await expect(page.getByRole("heading", { name: "Chamados" })).toBeVisible();

  // Sair e entrar de novo com a senha nova.
  await context.clearCookies();
  await page.goto("/backoffice");
  await expect(page).toHaveURL(/\/backoffice\/login$/);
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
});

async function backofficeLogin(page: Page) {
  await page.goto("/backoffice/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
}

test("suporte: cliente abre chamado pelo botão, equipe responde e o cliente vê a resposta", async ({ browser }) => {
  const client = await browser.newPage();
  await login(client, "guilherme");
  const button = client.getByRole("button", { name: "Falar com o suporte" });
  // Componente cliente: no servidor de desenvolvimento o clique pode chegar antes da hidratação.
  await expect(async () => {
    await button.click();
    await expect(client.getByLabel("Sobre o que é?")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(client.getByRole("button", { name: "Fechar suporte" })).toHaveAttribute("aria-expanded", "true");
  await client.getByLabel("Sobre o que é?").selectOption("bug");
  await client.getByLabel("Assunto").fill("Agenda não salva");
  await client.getByLabel("Mensagem").fill("Cliquei em salvar e a tela ficou carregando.");
  await client.getByRole("button", { name: "Enviar" }).click();
  await expect(client.getByText(/Recebemos seu chamado nº \d+/)).toBeVisible();

  const staff = await browser.newPage();
  await backofficeLogin(staff);
  await staff.goto("/backoffice/chamados");
  await staff.getByRole("link", { name: /Agenda não salva/ }).click();
  await expect(staff.getByText("Cliquei em salvar e a tela ficou carregando.")).toBeVisible();
  await expect(staff.getByText("/app", { exact: true })).toBeVisible();
  await staff.getByPlaceholder("Escreva a resposta ao cliente…").fill("Já estamos olhando, obrigado!");
  await staff.getByRole("button", { name: "Enviar" }).click();
  await expect(staff.getByText("Resposta enviada ao cliente.")).toBeVisible();

  await client.reload();
  await expect(client.getByRole("button", { name: /Há resposta nova do suporte/ })).toBeVisible();
  await expect(async () => {
    await client.getByRole("button", { name: /Falar com o suporte/ }).click();
    await expect(client.getByRole("tab", { name: /Meus chamados/ })).toHaveAttribute("aria-selected", "true", { timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await client.getByRole("button", { name: /Agenda não salva/ }).click();
  await expect(client.getByText("Já estamos olhando, obrigado!")).toBeVisible();
});

test("acesso de suporte: senha de 15 min, uso único, somente leitura, sem prontuário e com aviso ao dono", async ({ browser }) => {
  const staff = await browser.newPage();
  await backofficeLogin(staff);
  await staff.goto("/backoffice/clientes?q=Guilherme");
  await staff.getByRole("link", { name: "Consultório Guilherme Quintino" }).click();
  await staff.locator("#reason").fill("Teste e2e: investigar agenda");
  await staff.getByRole("button", { name: "Acessar conta" }).click();
  await expect(staff.locator("#support-email")).toHaveValue("suporte_salutti@salutti.com");
  const password = await staff.locator("#support-password").inputValue();
  expect(password).toHaveLength(20);

  // Contexto separado: o login do suporte não mistura cookies com o backoffice.
  const ctx = await browser.newContext();
  const support = await ctx.newPage();
  await support.goto("/login");
  await support.locator("#email").fill("suporte_salutti@salutti.com");
  await support.locator("#password").fill(password);
  await support.getByRole("button", { name: "Entrar" }).click();
  await expect(support).toHaveURL(/\/app$/);
  await expect(support.getByText(/Acesso de suporte à conta Consultório Guilherme Quintino/)).toBeVisible();
  await expect(support.getByRole("button", { name: "Falar com o suporte" })).toHaveCount(0);

  // Sem conteúdo clínico.
  const prontuario = await support.goto("/app/prontuario");
  expect(prontuario?.status()).toBe(404);

  // Somente leitura: a Server Action é recusada e nada é gravado.
  await support.goto("/app/pacientes/novo");
  await support.locator("#fullName").fill("Paciente criado pelo suporte");
  await support.getByRole("button", { name: "Cadastrar paciente" }).click();
  // A action falha (erro de servidor); a navegação seguinte pode interromper a resposta dela: tenta de novo.
  await expect(async () => {
    await support.goto("/app/pacientes");
    await expect(support.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await expect(support.getByText("Paciente criado pelo suporte")).toHaveCount(0);

  // Encerrar o acesso e tentar de novo com a mesma senha: uso único.
  await support.getByRole("button", { name: "Encerrar acesso" }).click();
  await expect(support).toHaveURL(/\/login/);
  await support.locator("#email").fill("suporte_salutti@salutti.com");
  await support.locator("#password").fill(password);
  await support.getByRole("button", { name: "Entrar" }).click();
  await expect(support).toHaveURL(/error=credenciais/);
  await ctx.close();

  // O dono vê o aviso com o motivo.
  const owner = await browser.newPage();
  await login(owner, "guilherme");
  await expect(owner.getByText("A equipe Salutti acessou sua conta")).toBeVisible();
  await expect(owner.getByText(/Teste e2e: investigar agenda/)).toBeVisible();
});
