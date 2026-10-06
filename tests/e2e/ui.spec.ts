import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("tema escuro pelo menu do perfil persiste ao recarregar", async ({ page }) => {
  await login(page, "guilherme");
  await page.getByRole("button", { name: /Guilherme Quintino/ }).click();
  await page.getByRole("menuitem", { name: "Ativar tema escuro" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: /Guilherme Quintino/ }).click();
  await page.getByRole("menuitem", { name: "Ativar tema claro" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("mobile: sem rolagem horizontal e menu em gaveta", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "guilherme");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("link", { name: "Financeiro" }).click();
  await expect(page).toHaveURL(/\/app\/financeiro$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
