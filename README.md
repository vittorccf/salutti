# Salutti - ERP SaaS de Saúde (Protótipo navegável)

> ERP SaaS para profissionais autônomos e clínicas de saúde mental (psicólogos, psicanalistas, terapeutas, psiquiatras), com expansão prevista para odontologia e UBS.
>
> Diferencial: **automação financeira-fiscal com IA preditiva (LUMA)** - vai além das "agendas bonitas" dos concorrentes (Sintropia, Sinappsy, Agendart).

## ⚡ Subir em 60 segundos

```bash
cd salutti-app
npm install
npx prisma db push --skip-generate
npx prisma generate
npm run db:seed
npm run dev
```

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
| **Sumarização IA de sessão (LUMA)**                                     | `/app/prontuario/[p]/nova-evolucao` · `lib/providers/llm.ts` |
| **IA Financeira Preditiva** ("sua receita caiu 12%")                    | `/app/luma`, `lib/providers/insights.ts` |
| App do Paciente - cartões diários                                        | `/portal/[token]` |
| Profissionais **sem CRP** (psicanalistas/terapeutas)                    | `/app/equipe` · flag `noCouncil` |
| LGPD: bases legais, 9 direitos, audit log, anonimização, portabilidade | `/app/lgpd`, `api/lgpd/export` |
| Multi-tenant (workspace switcher)                                       | Layout `/app` · cookie `salutti_ws` |
| Trial 15 dias                                                           | Onboarding `/signup` |
| Cobertura UBS / offline-first (caso Kris Fellipe)                        | Workspace `ubs-turvania` no seed |

## 🏗 Arquitetura resumida

- **Next.js 14 (App Router) + TypeScript** - full-stack, Server Actions para todas as mutações
- **Prisma + SQLite** no dev (provider trocável para PostgreSQL com 1 linha)
- **shadcn/ui-style** (Radix + Tailwind) - design system enxuto montado à mão
- **Multi-tenant** via `workspaceId` em todas as tabelas + cookie de workspace ativo (`salutti_ws`)
- **Auth** JWT em cookie httpOnly (jose) - em produção: substituir por Auth.js + sessões em DB
- **LUMA**: interface estável (`lib/providers/llm.ts`) - chama OpenAI se `OPENAI_API_KEY` setada, senão usa heurística determinística (zero-dependency demo)
- **Audit log** automático em mutações sensíveis (criação de paciente, cobrança, exportação LGPD)

Detalhes em `ARCHITECTURE.md`.

## 🧰 Comandos úteis

```bash
npm run dev           # dev server
npm run build         # build produção
npm run db:push       # sincronizar schema
npm run db:seed       # recria usuários, consultórios e modelos de anamnese (sem pacientes)
npm run db:reset      # nuke + seed
npx prisma studio     # GUI dos dados
```

## 🔐 Variáveis de ambiente

Veja `.env` - todas com defaults de sandbox. Para usar IA real:

```bash
OPENAI_API_KEY=sk-...
```

Para integrações reais (Stripe, Asaas, NFE.io, WhatsApp, Receita Saúde): trocar as chaves correspondentes. As interfaces dos providers (`src/lib/providers/`) ficam idênticas - só a implementação `mock` é substituída.

**Em produção, `AUTH_SECRET` é obrigatório** (32+ caracteres aleatórios, ex.: `openssl rand -base64 32`). Sem ele o login falha com erro explícito.

### Videochamada (Google Meet e Zoom)

Ao agendar uma sessão online, escolha Google Meet ou Zoom e o link é gerado na hora (também dá para gerar depois, na tela da sessão). Sem as chaves abaixo, o link é **simulado** e aparece com o selo "Simulado". O título da reunião é genérico ("Sessão · Salutti"): o nome do paciente não vai para o Google nem para o Zoom.

- **Google Meet** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`): crie um cliente OAuth no Google Cloud com a Google Calendar API ativada e o escopo `https://www.googleapis.com/auth/calendar.events`, e gere um refresh token da conta do consultório (ex.: OAuth Playground). A reunião é criada como evento na agenda dessa conta.
- **Zoom** (`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`): crie um app "Server-to-Server OAuth" no Zoom Marketplace com o escopo `meeting:write:admin`. As reuniões ficam na conta do dono do app, com sala de espera ativada.

## ✋ Trade-offs deliberados deste protótipo

- **SQLite no dev** em vez de Postgres - zero setup. Schema é compatível com Postgres (basta trocar o provider no `schema.prisma`).
- **Providers mock** (Asaas/NFE.io/WhatsApp/Receita Saúde) - entrega o fluxo end-to-end sem credenciais. Interfaces e callbacks já desenhados para integração real.
- **Sem testes automatizados** - foco em demonstrabilidade visual. Schema, providers e domínio já estão isolados o suficiente para receber testes (Vitest/Playwright) sem refactor.
- **NextAuth não foi usado** - implementação minimalista com `jose` para ficar transparente. Migração é direta.
- **Sem React Native ainda** - App do Paciente é entregue como Web App responsivo no `/portal/[token]`. PWA / wrappers nativos vêm depois.
- **TISS / convênios** estão fora deste protótipo (segmentação S3/S4 do discovery). Schema já contempla `Patient.responsibleName` e modelos suficientes para anexar TISS.

## 📚 Origem dos requisitos

O discovery completo está em `../resource/Takeout/NotebookLM/SaaS/` (sources, notas e artifacts). Pessoas reais referenciadas:

- **Kris Fellipe** (cirurgião-dentista, UBS Turvânia/GO) - caso UBS/offline-first
- **Guilherme Quintino** (psicólogo, Goiânia) - caso solo

Pesquisa coordenada por **Vittor Campos Castro Freitas**.
