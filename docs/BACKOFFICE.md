# Backoffice da Salutti

Painel interno da equipe Salutti em **`/backoffice`** (ex.: https://salutti.vercel.app/backoffice). Só em pt-BR, fora do `next-intl`.

## Acesso

- Login próprio em `/backoffice/login`. Os usuários ficam na tabela `BackofficeUser`, separada de `User` (que é dos consultórios).
- Acesso inicial: usuário **`admin`** com a senha combinada com o dono (só o hash está no repositório), criado pela migration `20261007200000_backoffice_suporte_planos`. A troca de senha é
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
| `/backoffice/clientes/[id]` | **Acessar conta** (acesso de suporte de 15 min, ver `docs/ACESSO-SUPORTE.md`), Dados do consultório, usuários com papel e 2FA, chamados, ajuste manual de plano e de validade do teste |
| `/backoffice/usuarios` | Pessoas com login no app e seus consultórios |
| `/backoffice/planos` | Catálogo `PlatformPlan`: nome, preço, dias de teste, descrição, disponível ou não |
| `/backoffice/equipe` | (admin) Pessoas do backoffice: adicionar com senha provisória, papel, desativar, redefinir senha |
| `/backoffice/auditoria` | (admin) Últimas 200 ações |
| `/backoffice/recursos` | (admin) **Gestão de Recursos**: limites da Vercel e da Neon, consumo medido, capacidade de usuários (ver abaixo) |

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
assinatura no Stripe. A cobrança automática (`src/lib/providers/billing.ts`, telas Ajustes e `/app/assinatura`) usa os planos
ativos do catálogo: cada plano pago precisa do **ID do preço no Stripe** (`price_…`), conferido contra o Stripe ao salvar
(valor, BRL, mensal/anual). Ao trocar o Stripe de teste para produção, cole os IDs dos preços de produção. Os dias do
teste grátis valem para os próximos cadastros.

## Botão de suporte no app

Botão flutuante em todas as telas logadas (`src/app/app/_components/support/`), ligado no `src/app/app/layout.tsx`:
balão com três pontos (fechado) → círculo com X (aberto), cores `--brand` / `--brand-foreground`, ponto `--brand-peach`
quando há resposta nova (`unreadByClient`). Abre um painel ancorado (Radix Popover) com duas abas:

- **Novo chamado:** tópico obrigatório, assunto e mensagem; a ajuda do tópico vira o placeholder; aviso de privacidade fixo.
  Página (só o caminho), navegador, tela e versão (`VERCEL_GIT_COMMIT_SHA`) vão sozinhos.
- **Meus chamados:** lista com situação e data; abre a conversa (sem notas internas nem eventos da equipe) e permite responder.
  Abrir um chamado apaga o ponto de resposta nova. Com resposta nova, o painel já abre nesta aba.

Tópicos (definidos com o Product Owner; textos em `messages/<idioma>/support.json`):

| Código | No app | Prioridade inicial |
|---|---|---|
| `bug` | Algo não funciona | alta |
| `acesso` | Login e acesso | alta |
| `duvida` | Dúvida de uso | normal |
| `financeiro` | Plano e cobrança | normal |
| `privacidade` | Privacidade e LGPD | alta (prazo legal) |
| `sugestao` | Sugestão | baixa |
| `outro` | Outro assunto | normal |

Contrato: `src/lib/support.ts` (domínio) e `src/app/app/_actions/support.ts` (`openSupportTicketAction`,
`replySupportTicketAction`, `markSupportReadAction`). Usuário e consultório vêm da sessão. `pageUrl` é gravado só com o
caminho e com ids trocados por `[id]`. Limites: 10 chamados e 30 respostas por usuário por hora. Cliente que responde
reabre chamado resolvido, fechado ou aguardando.

## Gestão de Recursos

Tela `/backoffice/recursos` (só admin). Limites dos planos em `src/lib/backoffice/capacity.ts` (conferidos em 2026-10-07:
Vercel **Hobby**, Neon **Free**); medições em `src/lib/backoffice/resources.ts`. Quando um plano mudar, atualize as
constantes e `LIMITS_CHECKED_AT`.

- **Medido ao vivo no banco:** tamanho (de 1 GB), conexões abertas × `max_connections`, latência (mediana de 3 `SELECT 1`),
  desde quando o compute está acordado, maiores tabelas, imagens guardadas no Postgres (`MediaFile`).
- **Uso do app:** consultórios, usuários, pessoas com ação na auditoria nos últimos 15 min / 24 h e pico por hora em 7 dias
  (o app não grava visualizações, então é uma aproximação por baixo). Projeção de quando o banco enche.
- **Consumo do mês da Neon** (CU-horas e transferência, com projeção até o fim do ciclo): só com `NEON_API_KEY` na Vercel
  (`NEON_PROJECT_ID` já vem da integração). Sem a chave, a tela mostra o passo a passo.
- **Vercel:** no Hobby não há API de consumo; a tela mostra a cota e o link para o Usage do painel.
- **Capacidade:** calculadora com hipóteses editáveis (telas por pessoa, CPU e bytes por tela). Com os valores padrão o
  Hobby aguenta ~9 pessoas usando ao mesmo tempo o dia útil inteiro; o primeiro limite é o Fast Origin Transfer.
- **Alertas:** atenção a partir de 70%, crítico a partir de 90%. Alerta fixo: o Hobby não permite uso comercial.

## Segurança e privacidade (revisão de 2026-10-07)

- Trocar ou redefinir a senha derruba as sessões abertas antes (`passwordChangedAt` × `iat`).
- Login com mensagem única (não revela quais usuários existem) e incremento atômico de tentativas. O bloqueio é por
  usuário: alguém pode manter o `admin` bloqueado de propósito; se acontecer, trocar o nome de usuário ou bloquear também por IP.
- Abrir chamado ou ficha de cliente fica na auditoria (`ticket.view`, `workspace.view`).
- **Depois do deploy, entre logo com o usuário `admin` e a senha inicial, troque a senha e confira na Auditoria que o primeiro login foi seu.**

## Ficou para depois

Anexos e captura de tela (com aviso de borrar dados de pacientes), aviso por e-mail quando a equipe responde (não há
serviço de e-mail), 2FA no backoffice, retenção/anonimização dos chamados quando houver exclusão de conta (hoje não existe
exclusão de consultório no app), retenção mínima da auditoria, SLA e respostas prontas, alinhar Stripe ao catálogo novo.
