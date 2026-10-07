// "Entrar com Google" depois do retorno do Google: sem conta, a identidade fica num cookie assinado e o cadastro
// (ou o convite) segue com o e-mail da conta Google e sem senha. O vaivém com o Google em si não roda aqui; o cookie
// é assinado com o mesmo segredo dos testes (playwright.config.ts), como o retorno faria.
import { expect, test, type BrowserContext } from "@playwright/test";
import { SignJWT } from "jose";
import { login } from "./helpers";

const SECRET = new TextEncoder().encode("e2e-secret-only-for-tests-0123456789abcdef");

async function pendingGoogle(context: BrowserContext, identity: { sub: string; email: string; name: string }) {
  const token = await new SignJWT(identity)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("salutti-google-pending")
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(SECRET);
  await context.addCookies([{ name: "salutti_google_pending", value: token, domain: "localhost", path: "/", httpOnly: true }]);
}

test("cadastro com a conta Google: e-mail fixo, sem senha, e a senha não entra depois", async ({ page, context }) => {
  const email = `google-${Date.now()}@gmail.com`;
  await pendingGoogle(context, { sub: `sub-${Date.now()}`, email, name: "Lia Google" });

  await page.goto("/estetica/cadastro");
  await expect(page.getByText(`Cadastro com a conta Google ${email}.`)).toBeVisible();
  await expect(page.locator("#email")).toHaveValue(email);
  await expect(page.locator("#name")).toHaveValue("Lia Google");
  await expect(page.locator("#password")).toHaveCount(0);
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/primeiros-passos$/);

  // Segurança da conta mostra o vínculo e não deixa desvincular (a conta não tem senha).
  await page.goto("/app/conta/seguranca");
  await expect(page.getByText(`Conta: ${email}`)).toBeVisible();
  await expect(page.getByText("Sua conta foi criada com o Google e entra só por ele.")).toBeVisible();

  await context.clearCookies();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("qualquer-senha-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Credenciais inválidas")).toBeVisible();
});

test("usar outro e-mail descarta a conta Google pendente", async ({ page, context }) => {
  await pendingGoogle(context, { sub: `sub-outro-${Date.now()}`, email: `outro-${Date.now()}@gmail.com`, name: "Outro" });
  await page.goto("/signup");
  await page.getByRole("link", { name: "Usar outro e-mail" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByText(/Cadastro com a conta Google/)).toHaveCount(0);
  // O clique pode chegar antes da hidratação no dev server: repete até o formulário abrir.
  await expect(async () => {
    await page.getByText("Profissional autônomo", { exact: true }).click();
    await expect(page.locator("#password")).toBeVisible({ timeout: 2_000 });
  }).toPass();
});

test("convite aceito com a conta Google do e-mail convidado", async ({ page, browser }) => {
  const email = `convite-google-${Date.now()}@gmail.com`;
  await login(page, "kris");
  await page.goto("/app/equipe");
  await page.locator("#invite-email").fill(email);
  await page.locator("#invite-role").selectOption("receptionist");
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const link = await page.getByRole("textbox", { name: "Link do convite" }).inputValue();

  // Conta Google de outro e-mail: avisa e mantém o cadastro com senha.
  const wrong = await browser.newContext({ locale: "pt-BR" });
  await pendingGoogle(wrong, { sub: `sub-errado-${Date.now()}`, email: "errado@gmail.com", name: "Errado" });
  const wrongPage = await wrong.newPage();
  await wrongPage.goto(new URL(link).pathname);
  await expect(wrongPage.getByText(/A conta Google errado@gmail.com não é o e-mail deste convite/)).toBeVisible();
  await expect(wrongPage.locator("#password")).toBeVisible();

  const ctx = await browser.newContext({ locale: "pt-BR" });
  await pendingGoogle(ctx, { sub: `sub-convite-${Date.now()}`, email, name: "Rosa Google" });
  const guest = await ctx.newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByText(`Cadastro com a conta Google ${email}.`)).toBeVisible();
  await expect(guest.locator("#password")).toHaveCount(0);
  await guest.locator("#acceptTerms").check();
  await guest.getByRole("button", { name: "Criar conta e entrar na equipe" }).click();
  await expect(guest).toHaveURL(/\/app$/);
});
