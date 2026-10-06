# Salutti - ERP SaaS de Saúde (Protótipo navegável)

> ERP SaaS para profissionais autônomos e clínicas de saúde mental (psicólogos, psicanalistas, terapeutas, psiquiatras), com expansão prevista para odontologia e UBS.
>
> Diferencial: **automação financeira-fiscal com IA preditiva (TOBI)** - vai além das "agendas bonitas" dos concorrentes (Sintropia, Sinappsy, Agendart).

## ⚡ Subir em 60 segundos

```bash
cd saluti-app
npm install
cp .env.example .env    # DATABASE_URL aponta para o Postgres local
npm run db:local        # terminal 1: sobe o Postgres (localhost:5433) e aplica as migrations
npm run db:seed         # terminal 2, só na primeira vez
npm run dev
```

O `db:local` usa um Postgres embutido (binários oficiais via npm, dados em `.pgdata`): não precisa de Docker. Se preferir outro Postgres (Docker, Neon), basta trocar o `DATABASE_URL`.

Abra http://localhost:3000 e use as credenciais demo:

| Usuário                       | Senha       | Workspace                                          |
| ----------------------------- | ----------- | -------------------------------------------------- |
| `guilherme@salutti.dev`        | `salutti123` | Consultório psicólogo autônomo (Goiânia)           |
| `kris@salutti.dev`             | `salutti123` | UBS Turvânia · clínica odontológica                |

Os consultórios começam **sem pacientes nem profissionais** (base limpa). Cadastre um profissional em Profissionais e um paciente em Pacientes; o link do portal do paciente é gerado na ficha dele.

**Link público de pagamento:** /pay/&lt;token&gt; (gerado para cada cobrança).

## 🎯 Mapa de requisitos → módulo entregue

Cobertura completa do prompt original:

| Requisito de discovery                                                  | Onde está |
| ----------------------------------------------------------------------- | --------- |
| Agendamento de consultas + Meet/Zoom                                    | `/app/agenda` · link gerado para sessões online |
| Pix Automático (Asaas-like) + recorrência                               | `/app/financeiro/novo`, `lib/providers/pix.ts` |
| Links de pagamento públicos                                             | `/pay/[token]` |
| Emissão NFS-e (NFE.io-like) por município                               | `/app/fiscal`, `lib/providers/nfse.ts` |
| Receita Saúde 2025 (recibos PF obrigatórios)                            | `lib/providers/receita-saude.ts` |
| WhatsApp Business - lembretes 24h/2h, cobranças                         | `lib/providers/whatsapp.ts`, `/app/comunicacao` |
| Régua de cobrança automática                                            | `/app/financeiro/regua` |
| Anamnese personalizável por especialidade                                | `/app/prontuario/[patient]/anamnese` |
| Receituário/Prontuário com assinatura ICP-Brasil (placeholder)          | `/app/prontuario/...` · hash SHA-256 sandbox |
| **Sumarização IA de sessão (TOBI)**                                     | `/app/prontuario/[p]/nova-evolucao` · `lib/providers/llm.ts` |
| **IA Financeira Preditiva** ("sua receita caiu 12%")                    | `/app/tobi`, `lib/providers/insights.ts` |
| App do Paciente - cartões diários                                        | `/portal/[token]` |
| Profissionais **sem CRP** (psicanalistas/terapeutas)                    | `/app/equipe` · flag `noCouncil` |
| LGPD: bases legais, 9 direitos, audit log, anonimização, portabilidade | `/app/lgpd`, `api/lgpd/export` |
| Multi-tenant (workspace switcher)                                       | Layout `/app` · cookie `salutti_ws` |
| Trial 15 dias                                                           | Onboarding `/signup` |
| Cobertura UBS / offline-first (caso Kris Fellipe)                        | Workspace `ubs-turvania` no seed |

## 🏗 Arquitetura resumida

- **Next.js 14 (App Router) + TypeScript** - full-stack, Server Actions para todas as mutações
- **Prisma + PostgreSQL** em todos os ambientes, com migrations versionadas em `prisma/migrations`
- **shadcn/ui-style** (Radix + Tailwind) - design system enxuto montado à mão
- **Multi-tenant** via `workspaceId` em todas as tabelas + cookie de workspace ativo (`salutti_ws`)
- **Auth** JWT em cookie httpOnly (jose) - em produção: substituir por Auth.js + sessões em DB
- **TOBI**: interface estável (`lib/providers/llm.ts`) - chama OpenAI se `OPENAI_API_KEY` setada, senão usa heurística determinística (zero-dependency demo)
- **Audit log** automático em mutações sensíveis (criação de paciente, cobrança, exportação LGPD)

Detalhes em `ARCHITECTURE.md`.

## 🧰 Comandos úteis

```bash
npm run dev           # dev server
npm run build         # build produção
npm run db:local      # Postgres local (localhost:5433)
npm run db:migrate    # cria uma migration a partir de mudanças no schema.prisma
npm run db:deploy     # aplica as migrations pendentes
npm run db:seed       # recria usuários, consultórios e modelos de anamnese (sem pacientes)
npm run db:reset      # apaga o banco, reaplica as migrations e roda o seed
npm test              # testes unitários
npm run test:e2e      # ponta a ponta (sobe um Postgres descartável sozinho)
npx prisma studio     # GUI dos dados
```

## 🔐 Variáveis de ambiente

Veja `.env` - todas com defaults de sandbox. Para usar IA real:

```bash
OPENAI_API_KEY=sk-...
```

Para integrações reais (Stripe, Asaas, NFE.io, WhatsApp, Receita Saúde): trocar as chaves correspondentes. As interfaces dos providers (`src/lib/providers/`) ficam idênticas - só a implementação `mock` é substituída.

**Em produção, `AUTH_SECRET` é obrigatório** (32+ caracteres aleatórios, ex.: `openssl rand -base64 32`). Sem ele o login falha com erro explícito.

### Assinatura da Salutti (Stripe Billing)

Em Ajustes → Plano Salutti, quem é dono do consultório assina Starter ou Pro. Com `STRIPE_SECRET_KEY` real, o botão abre o Checkout do Stripe e o webhook atualiza o plano; sem ela, a ativação é simulada (sem cobrança) e aparece como tal.

1. No Stripe, crie dois preços recorrentes mensais (Starter R$ 49, Pro R$ 129) e preencha `STRIPE_PRICE_STARTER` e `STRIPE_PRICE_PRO`.
2. Crie o endpoint de webhook `https://<seu-domínio>/api/stripe/webhook` com os eventos `checkout.session.completed`, `customer.subscription.updated` e `customer.subscription.deleted`, e preencha `STRIPE_WEBHOOK_SECRET`.
3. Ative o Customer Portal do Stripe para o botão "Gerenciar assinatura e faturas".

### Banco de produção (Postgres)

1. Crie um banco Postgres (ex.: **Neon** pelo Marketplace da Vercel, que já preenche o `DATABASE_URL`).
2. Na Vercel, o script `vercel-build` aplica as migrations (`prisma migrate deploy`) antes do build, pela conexão direta (`DATABASE_URL_UNPOOLED`, criada pelo Neon): o pooler não suporta os locks das migrations.
3. Para criar os logins de demonstração no banco novo, rode uma vez `DATABASE_URL=<url> npm run db:seed`.

### Convênios e faturamento TISS

Em **Convênios**, cadastre a operadora (registro ANS, valor contratado por sessão e, se houver, o código do prestador) e os dados do prestador (CNPJ e CNES). Vincule o paciente ao convênio com o número da carteirinha, agende a sessão com "Forma de pagamento: Convênio" e, depois de realizada, gere o lote em **Convênios → Faturar**. O XML sai no **Padrão TISS 4.03.00** (ISO-8859-1), pronto para enviar pelo portal da operadora.

- Psicólogo: guia **SP/SADT**, procedimento TUSS **50000470** (sessão de psicoterapia individual por psicólogo), CRP 09, CBO 251510.
- Psiquiatra/médico: guia de **consulta**, TUSS **10101012**, CRM 06.
- Sessão online sai com regime 05 (telessaúde); presencial, 01 (ambulatorial). Sem CNES, a guia usa 9999999.
- Odontologia (guia GTO) e profissionais sem conselho ainda não são faturáveis.
- O XML é validado nos testes contra os XSD oficiais (`tests/fixtures/tiss-4.03.00`). Operadoras podem exigir autorização prévia, senha ou pedido médico: confira o contrato antes do primeiro envio.

### Videochamada (Google Meet e Zoom)

Ao agendar uma sessão online, escolha Google Meet ou Zoom e o link é gerado na hora (também dá para gerar depois, na tela da sessão). Sem as chaves abaixo, o link é **simulado** e aparece com o selo "Simulado". O título da reunião é genérico ("Sessão · Salutti"): o nome do paciente não vai para o Google nem para o Zoom.

- **Google Meet** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`): crie um cliente OAuth "Aplicativo da Web" no Google Cloud, ative a Google Calendar API e cadastre a URI de retorno `<origem>/api/integracoes/google/retorno` (ex.: `https://salutti.vercel.app/api/integracoes/google/retorno` e `http://localhost:3000/...`). Cada usuário conecta a própria conta em **Ajustes → Google Meet**; o Meet nasce na agenda de quem atende (cadastro profissional com o mesmo e-mail), com título genérico e sem convidados. O escopo `calendar.events` é sensível: até a verificação do app pelo Google, só usuários de teste cadastrados no console (até 100) conseguem conectar. `GOOGLE_REFRESH_TOKEN` (opcional) é uma conta única de reserva para quem não conectou.
- **Zoom** (`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`): crie um app "Server-to-Server OAuth" no Zoom Marketplace com o escopo `meeting:write:admin`. As reuniões ficam na conta do dono do app, com sala de espera ativada.

## ✋ Trade-offs deliberados deste protótipo

- **Providers mock** (Asaas/NFE.io/WhatsApp/Receita Saúde) - entrega o fluxo end-to-end sem credenciais. Interfaces e callbacks já desenhados para integração real.
- **NextAuth não foi usado** - implementação minimalista com `jose` para ficar transparente. Migração é direta.
- **Sem React Native ainda** - App do Paciente é entregue como Web App responsivo no `/portal/[token]`. PWA / wrappers nativos vêm depois.
- **TISS / convênios** estão fora deste protótipo (segmentação S3/S4 do discovery). Schema já contempla `Patient.responsibleName` e modelos suficientes para anexar TISS.

## 📚 Origem dos requisitos

O discovery completo está em `../resource/Takeout/NotebookLM/SaaS/` (sources, notas e artifacts). Pessoas reais referenciadas:

- **Kris Fellipe** (cirurgião-dentista, UBS Turvânia/GO) - caso UBS/offline-first
- **Guilherme Quintino** (psicólogo, Goiânia) - caso solo

Pesquisa coordenada por **Vittor Campos Castro Freitas**.
