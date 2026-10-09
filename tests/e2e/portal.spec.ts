import { expect, test } from "@playwright/test";
import { createPatient, createProfessional, login, selectByText } from "./helpers";

// CPF válido de teste (dígitos verificadores corretos).
const CPF = "529.982.247-25";
const PASSWORD = "cafe com leite na varanda";

test("portal do paciente: convite, criar senha, semana, check-in, mensagens, tarefa, remarcação e login com CPF", async ({ page, browser }) => {
  const tag = Date.now().toString().slice(-6);
  const name = `Paciente Portal ${tag}`;
  await login(page, "guilherme");
  await createProfessional(page, `Dra. Portal ${tag}`);
  const patientUrl = await createPatient(page, name);

  // Sessão online no futuro para o paciente responder.
  await page.goto("/app/agenda/novo");
  await page.locator("#patientId").selectOption({ label: name });
  await selectByText(page, "#professionalId", `Dra. Portal ${tag}`);
  await page.locator("#startsAt").fill("2027-03-10T15:00");
  await page.locator("#modality").selectOption("online");
  await page.locator("#videoProvider").selectOption("none");
  await page.locator("#generateCharge").uncheck();
  await page.getByRole("button", { name: "Agendar sessão" }).click();
  await expect(page.getByRole("heading", { name: `Sessão · ${name}` })).toBeVisible();

  // Profissional: abre o portal do paciente, publica uma tarefa e gera o convite.
  await page.goto(patientUrl);
  await page.getByRole("link", { name: "Abrir portal do paciente" }).click();
  await expect(page.getByRole("heading", { name: `Portal · ${name}` })).toBeVisible();
  await page.locator("#h-title").fill("Registro de pensamentos");
  await page.locator("#h-body").fill("Anote 3 situações na semana.");
  await page.getByRole("button", { name: "Publicar para o paciente" }).click();
  await expect(page.getByText("Publicado no portal do paciente.")).toBeVisible();
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const linkText = page.locator("p.font-mono", { hasText: "/portal/convite/" });
  await expect(linkText).toBeVisible();
  const invite = (await linkText.textContent())!.trim();
  await expect(page.getByRole("link", { name: "Enviar pelo WhatsApp" })).toHaveAttribute("href", /wa\.me\/\?text=.*portal%2Fconvite/);

  // Paciente (outro navegador, sem sessão do app): o link sozinho não mostra dados; cria a senha.
  const ctxP = await browser.newContext({ locale: "pt-BR" });
  const p = await ctxP.newPage();
  await p.goto(invite);
  await expect(p.getByRole("heading", { name: "Crie seu acesso" })).toBeVisible();
  await expect(p.getByText(name)).toHaveCount(0);
  await p.locator("#cpf").fill("111.111.111-11");
  await p.locator("#password").fill(PASSWORD);
  await p.locator("#confirm").fill(PASSWORD);
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Criar acesso e entrar" }).click();
  await expect(p.getByText("CPF inválido. Confira os 11 dígitos.")).toBeVisible();
  await p.locator("#cpf").fill(CPF);
  await p.locator("#password").fill("12345678");
  await p.locator("#confirm").fill("12345678");
  await p.getByRole("button", { name: "Criar acesso e entrar" }).click();
  await expect(p.getByText("Essa senha é fácil de adivinhar. Escolha outra.")).toBeVisible();
  await p.locator("#password").fill(PASSWORD);
  await p.locator("#confirm").fill(PASSWORD);
  await p.getByRole("button", { name: "Criar acesso e entrar" }).click();

  // Semana: próxima sessão, confirmação, tarefa e check-in.
  await expect(p).toHaveURL(/\/portal$/);
  await expect(p.getByRole("heading", { name: `Olá, Paciente` })).toBeVisible();
  await expect(p.locator("#next-session")).toContainText("Próxima sessão · no dia 10/03/2027");
  await p.getByText("Preciso remarcar").click();
  await p.locator("#reschedule-note").fill("Posso na sexta à tarde");
  await p.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(p.getByText("Pedido de remarcação enviado. O consultório vai falar com você.")).toBeVisible();
  await expect(p.getByText("Registro de pensamentos")).toBeVisible();
  await p.getByLabel("Já fiz").check();
  await p.getByLabel("Comentário sobre a tarefa").fill("Consegui em 2 dias");
  await p.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(p.getByText("Tarefa marcada como feita.")).toBeVisible();
  await p.getByText("Bem", { exact: true }).click();
  await p.getByRole("button", { name: "Registrar" }).click();
  await expect(p.getByText("Registro salvo. Obrigado por contar.")).toBeVisible();

  // Mensagem do paciente, com o aviso de emergência.
  await p.getByRole("navigation", { name: "Portal" }).getByRole("link", { name: /Mensagens/ }).click();
  await expect(p.getByText(/Este canal não é para emergências/)).toBeVisible();
  await p.locator("#body").fill("Oi! Posso trocar a sessão?");
  await p.getByRole("button", { name: "Enviar" }).click();
  await expect(p.getByText("Oi! Posso trocar a sessão?")).toBeVisible();

  // Profissional: badge no menu, pedido de remarcação, resposta e tarefa feita.
  await page.goto("/app/portal");
  await expect(page.getByRole("heading", { name: "Pedidos de remarcação" })).toBeVisible();
  await expect(page.getByText("“Posso na sexta à tarde”")).toBeVisible();
  await page.getByRole("link", { name, exact: true }).first().click();
  await expect(page.getByText("Oi! Posso trocar a sessão?")).toBeVisible();
  await expect(page.getByText(/Consegui em 2 dias/)).toBeVisible();
  await page.locator("#reply").fill("Claro, sexta às 16h funciona.");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Mensagem enviada.")).toBeVisible();
  await expect(page.getByText("Pediu remarcação", { exact: true })).toBeVisible();

  // Paciente vê a resposta; sai e entra de novo com CPF + senha.
  await p.goto("/portal/mensagens");
  await expect(p.getByText("Claro, sexta às 16h funciona.")).toBeVisible();
  await p.goto("/portal/conta");
  await p.getByRole("button", { name: "Sair" }).click();
  await expect(p).toHaveURL(/\/portal\/entrar$/);
  await p.goto("/portal");
  await expect(p).toHaveURL(/\/portal\/entrar$/);
  await p.locator("#cpf").fill(CPF);
  await p.locator("#password").fill("senha errada demais");
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.getByText("CPF ou senha incorretos.")).toBeVisible();
  await p.locator("#password").fill(PASSWORD);
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p).toHaveURL(/\/portal$/);

  // Convite já usado não vale de novo.
  await p.goto(invite);
  await expect(p.getByRole("heading", { name: "Link sem validade" })).toBeVisible();

  // Revogar: a sessão do paciente cai.
  await page.goto(`${patientUrl}/portal`);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Revogar acesso" }).click();
  await expect(page.getByText("Sem acesso", { exact: true })).toBeVisible();
  await p.goto("/portal");
  await expect(p).toHaveURL(/\/portal\/entrar$/);
  await ctxP.close();
});
