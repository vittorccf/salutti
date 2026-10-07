# Backoffice da Salutti

Painel interno da equipe Salutti em **`/backoffice`** (ex.: https://salutti.vercel.app/backoffice). Só em pt-BR, fora do `next-intl`.

## Acesso

- Login próprio em `/backoffice/login`. Os usuários ficam na tabela `BackofficeUser`, separada de `User` (que é dos consultórios).
- Acesso inicial **`admin` / `admin`**, criado pela migration `20261007200000_backoffice_suporte_planos`. A troca de senha é
  obrigatória no primeiro login (`mustChangePassword`): até trocar, toda tela redireciona para `/backoffice/senha`.
- Sessão: cookie `salutti_bo` (httpOnly, `path=/backoffice`), JWT com audiência `salutti-backoffice`, validade de 12 h.
  A sessão do app recusa qualquer token com audiência, então um não vale no lugar do outro.
- 5 senhas erradas seguidas bloqueiam o usuário por 15 minutos. Pessoa desativada perde o acesso na próxima requisição.
- Papéis: **admin** (tudo) e **suporte** (chamados e consulta de clientes, usuários e planos; não muda plano, equipe nem vê auditoria).
- Toda ação relevante vai para `BackofficeAuditLog` (tela Auditoria).

## Telas

| Rota | O que tem |
|---|---|
| `/backoffice` | Números (clientes, usuários, testes grátis, chamados), chamados recentes, clientes por plano, cadastros recentes |
| `/backoffice/chamados` | Fila de chamados com busca (nº, assunto, nome, e-mail, consultório) e filtros (situação, tipo, prioridade, só meus). Mensagem nova primeiro |
| `/backoffice/chamados/[id]` | Conversa, resposta ao cliente ou nota interna, situação/prioridade/responsável, dados do cliente e contexto técnico |
| `/backoffice/clientes` | Consultórios com responsável, área, tipo, plano, validade do teste e contagens |
| `/backoffice/clientes/[id]` | Dados do consultório, usuários com papel e 2FA, chamados, ajuste manual de plano e de validade do teste |
| `/backoffice/usuarios` | Pessoas com login no app e seus consultórios |
| `/backoffice/planos` | Catálogo `PlatformPlan`: nome, preço, dias de teste, descrição, disponível ou não |
| `/backoffice/equipe` | (admin) Pessoas do backoffice: adicionar com senha provisória, papel, desativar, redefinir senha |
| `/backoffice/auditoria` | (admin) Últimas 200 ações |

**Privacidade:** o backoffice mostra só **contagens** de pacientes e atendimentos, nunca nomes, prontuários ou anamneses.

## Planos

Semeados pela migration (códigos gravados em `Workspace.planTier`):

| Código | Nome | Preço |
|---|---|---|
| `trial` | Teste grátis | 15 dias |
| `basico` | Básico | R$ 49,90/mês |
| `essencial` | Essencial | R$ 89,90/mês |
| `anual` | Anual | R$ 749,90/ano |

`starter`, `pro` e `enterprise` continuam aceitos como legados. A mudança de plano no backoffice é **manual**: não cria nem cancela
assinatura no Stripe. A cobrança automática (`src/lib/providers/billing.ts`, tela Ajustes) ainda usa Starter/Pro e os preços do Stripe;
alinhar ao catálogo novo é o próximo passo de planos.

## Toggle de suporte (a implementar no app)

O backoffice já recebe e responde chamados. Falta a interface no app. O contrato está pronto:

- **Domínio:** `src/lib/support.ts` (categorias, situações, prioridades, validação, `openTicket`, `addClientMessage`,
  `listClientTickets`, `markReadByClient`).
- **Server actions:** `src/app/app/_actions/support.ts`, ambas no formato do `ActionForm` (`(prev, formData) => { erro } | { ok }`):
  - `openSupportTicketAction`: campos `category` (`bug` | `duvida` | `sugestao` | `financeiro` | `acesso` | `outro`; padrão `bug`),
    `subject` (3–140), `message` (5–5000) e, opcionais, preenchidos pelo próprio toggle: `pageUrl` (`location.href`),
    `userAgent` (`navigator.userAgent`), `viewport` (`${innerWidth}x${innerHeight}`), `appVersion`.
  - `replySupportTicketAction`: `ticketId`, `message`. Cliente que responde reabre chamado resolvido, fechado ou aguardando.
- Usuário e consultório vêm da sessão (`requireContext`), nunca do formulário.
- `pageUrl` é gravado **só com o caminho**: query string e hash podem carregar nome de paciente ou ids.
- Bug e acesso entram com prioridade **alta**; o resto, **normal**. Limite de 10 chamados por usuário por hora.
- `unreadByStaff` / `unreadByClient` marcam mensagem nova de cada lado: o badge do menu "Chamados" usa o primeiro e o
  toggle pode usar o segundo para mostrar um ponto de "resposta nova". Notas internas (`internal: true`) e eventos de sistema nunca vão para o cliente.

Ficou para depois: anexos e captura de tela (reaproveitar `MediaFile`), aviso por e-mail ao cliente quando a equipe responde
(não há serviço de e-mail), SLA e respostas prontas.
