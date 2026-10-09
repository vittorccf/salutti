# Permissões

São três camadas, todas checadas no servidor (o menu só esconde o que a pessoa não pode usar). Os catálogos ficam no código, e o banco guarda só o papel e os ajustes.

Fontes da pesquisa: OWASP Authorization Cheat Sheet (negar por padrão e menor privilégio), modelo RBAC do NIST, papéis do Stripe e do GitHub (papel-base com ajustes) e Stigg/Schematic (liberações separadas de feature flag).

## 1. Equipe do backoffice (`src/lib/backoffice/permissions.ts`)

- **Papéis prontos:** Administrador (tudo), Suporte, Financeiro e Comercial. Cada papel é o ponto de partida, ajustável por pessoa.
- **Banco:** `BackofficeUser.permsGranted` e `BackofficeUser.permsDenied`.
- **Permissões:** chamados (ver e responder), clientes (ver, editar plano, liberações, acesso de suporte), planos (ver e editar com Stripe), equipe, gestão de recursos e auditoria. A visão geral fica aberta a qualquer pessoa ativa, porque é para onde volta quem não tem uma permissão.
- **Guarda:** `requireBackoffice({ perm })` em toda tela e ação. Sem a permissão, a pessoa volta para a visão geral.
- **Regras contra escalonamento** (tela Equipe e permissões):
  - ninguém dá ou retira o que não tem, nem dá um papel com permissões que não tem;
  - ninguém mexe na própria conta;
  - quem tem permissões que você não tem só é alterado por quem tem pelo menos as mesmas;
  - sempre fica ao menos uma pessoa ativa com "equipe.gerenciar" (checado com a equipe travada na transação);
  - trocar o papel volta ao padrão do novo papel;
  - tudo vai para a auditoria, com as permissões acrescentadas e retiradas.
- **Tema escuro:** botão na barra lateral do backoffice. A escolha fica no navegador e vale também no app.

## 2. Liberações por cliente (`src/lib/areas.ts`, cartão "Liberações" na ficha do cliente)

- **Módulos:** prontuário, convênios, procedimentos, estoque, portal do paciente, contas a pagar, lista de espera e cartão diário.
- **Ligado** = padrão da área + liberado para o cliente − bloqueado para o cliente (`Workspace.modulesAdded` / `modulesRemoved`).
- **Limites do contrato:** máximo de profissionais e de pacientes ativos (`maxProfessionals` / `maxPatients`), aplicados no cadastro.
- **Motivo obrigatório** ao sair do padrão (ex.: piloto, contrato especial). Fica no cliente e na auditoria.
- **Módulo bloqueado:** some do menu e a rota responde 404. Os dados ficam guardados e voltam a aparecer se o módulo for liberado de novo. No portal, a sessão do paciente cai.
- **Permissão no backoffice:** "clientes.liberacoes" (padrão dos papéis Administrador e Comercial).

## 3. Membros do consultório (`src/lib/app-permissions.ts`, tela Profissionais → Acessos à conta)

- **Permissões:**
  - agenda;
  - pacientes;
  - **clínico** (prontuário, portal e cartão diário);
  - financeiro (receber e pagar);
  - fiscal;
  - estoque;
  - equipe;
  - LGPD.
- **Padrão de cada papel:** o mesmo acesso de antes. A exceção é a **LGPD** (exportar, anonimizar e excluir), que passou a ser só do dono e do administrador.
- **Regras fixas:**
  - o dono tem sempre tudo;
  - **recepção e financeiro nunca veem conteúdo clínico**, nem com ajuste (sigilo: Código de Ética do Psicólogo, art. 9º; necessidade: LGPD, art. 6º, III).
- **Quem edita:**
  - dono ou administrador com "equipe.gerenciar";
  - ninguém edita a si mesmo nem o dono;
  - administrador não edita outro administrador;
  - só se dá ou retira o que se tem.
- **Banco:** `Membership.permsGranted` / `permsDenied`. Trocar o papel zera os ajustes.
- **Contexto:** `ctx.permissions` (Set) vem em `requireContext()`. Guardas: `requirePermission("…")`, `canSeeClinical(ctx)`, `canManagePayables(ctx)`.

## Testes

- `tests/unit/permissoes.test.ts`: efetivas, diferença para o papel, escalonamento, regra clínica fixa e liberações por cliente.
- `tests/e2e/backoffice.spec.ts`, último teste:
  - tema escuro;
  - pessoa Comercial com permissão extra;
  - menu por permissão e 404 da equipe;
  - bloqueio do portal de um cliente refletido no app, e volta ao padrão.

## Ficou para depois

- Liberações por plano (hoje só por cliente) e com validade.
- Convite já com permissões definidas.
- Histórico de mudanças de permissão visível para o dono do consultório.
