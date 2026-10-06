import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("assinatura em modo de teste ativa o plano e encerra o teste grátis", async ({ page }) => {
  await login(page, "kris");
  await expect(page.getByText(/Teste grátis: \d+ dias? restantes?/)).toBeVisible();
  await page.goto("/app/ajustes");
  await page.getByRole("button", { name: "Ativar Pro (simulação)" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Plano ativado em modo de teste" })).toBeVisible();
  await expect(page.getByText("Plano atual: Pro")).toBeVisible();
  await expect(page.getByText(/Teste grátis: \d+ dias?/)).toHaveCount(0);
});

test("webhook do Stripe sem assinatura válida é recusado", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", { data: { type: "checkout.session.completed" } });
  expect([400, 501]).toContain(res.status());
});
