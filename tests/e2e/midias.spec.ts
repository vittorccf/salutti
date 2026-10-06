// Foto de perfil e banner no lugar da marca Salutti; foto do paciente só para o próprio consultório.
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

let PNG: Buffer;
const file = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

test("foto de perfil e banner no menu; foto do paciente com acesso restrito", async ({ browser }) => {
  const g = await (await browser.newContext()).newPage();
  await login(g, "guilherme");
  // PNG de verdade, desenhado pelo próprio navegador (o ImageUpload reduz e converte antes de enviar).
  const dataUrl = await g.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 48;
    const x = c.getContext("2d")!;
    x.fillStyle = "#2a9d8f";
    x.fillRect(0, 0, 64, 48);
    return c.toDataURL("image/png");
  });
  PNG = Buffer.from(dataUrl.split(",")[1], "base64");

  // Foto de perfil.
  await g.goto("/app/ajustes");
  await g.locator('input[name="avatar"]').setInputFiles(file("eu.png"));
  await expect(g.getByText("Imagem pronta. Salve para aplicar.")).toBeVisible();
  await g.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(g.getByText("Perfil salvo.")).toBeVisible();

  // No topo do menu: foto de quem usa.
  await g.getByRole("radio", { name: "Foto de perfil de quem está usando" }).check();
  await g.getByRole("button", { name: "Salvar dados" }).click();
  await expect(g.getByText("Dados salvos.")).toBeVisible();
  await g.goto("/app");
  const brandImg = g.locator("aside a[href='/app'] img").first();
  await expect(brandImg).toHaveAttribute("src", /\/api\/media\//);

  // Banner sem imagem é recusado; com imagem, aparece.
  await g.goto("/app/ajustes");
  await g.getByRole("radio", { name: "Banner profissional" }).check();
  await g.getByRole("button", { name: "Salvar dados" }).click();
  await expect(g.getByRole("alert").filter({ hasText: "Envie o banner" })).toBeVisible();
  await g.locator('input[name="banner"]').setInputFiles(file("banner.png"));
  await expect(g.getByText("Imagem pronta. Salve para aplicar.").last()).toBeVisible();
  await g.getByRole("button", { name: "Salvar dados" }).click();
  await expect(g.getByText("Dados salvos.")).toBeVisible();
  await g.goto("/app");
  await expect(g.locator("aside a[href='/app'] img[alt='Consultório Guilherme Quintino']")).toBeVisible();

  // Foto do paciente.
  await g.goto("/app/pacientes/novo");
  await g.locator("#fullName").fill("Paciente Foto E2E");
  await g.locator('input[name="photo"]').setInputFiles(file("p.png"));
  await expect(g.getByText("Imagem pronta. Salve para aplicar.")).toBeVisible();
  await g.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(g.getByRole("heading", { name: "Paciente · Paciente Foto E2E" })).toBeVisible();
  const photo = g.locator("header img").first();
  const src = (await photo.getAttribute("src"))!;
  expect(src).toMatch(/^\/api\/media\//);
  const own = await g.request.get(src);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toMatch(/^image\/(webp|jpeg)$/);

  // Outro consultório não acessa a foto; sem sessão também não.
  const k = await (await browser.newContext()).newPage();
  await login(k, "kris");
  expect((await k.request.get(src)).status()).toBe(404);
  const anon = await (await browser.newContext()).request.get(new URL(src, g.url()).toString());
  expect(anon.status()).toBe(401);

  // Volta a marca Salutti para não afetar outros testes.
  await g.goto("/app/ajustes");
  await g.getByRole("radio", { name: "Marca Salutti" }).check();
  await g.getByRole("button", { name: "Salvar dados" }).click();
  await expect(g.getByText("Dados salvos.")).toBeVisible();
});
