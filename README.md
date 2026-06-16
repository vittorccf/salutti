# Saluti - ERP SaaS de Saúde (Protótipo navegável)

> ERP SaaS para profissionais autônomos e clínicas de saúde mental (psicólogos, psicanalistas, terapeutas, psiquiatras), com expansão prevista para odontologia e UBS.
>
> Diferencial: **automação financeira-fiscal com IA preditiva (LUMA)** - vai além das "agendas bonitas" dos concorrentes (Sintropia, Sinappsy, Agendart).

## ⚡ Subir em 60 segundos

```bash
cd saluti-app
npm install
npx prisma db push --skip-generate
npx prisma generate
npm run db:seed
npm run dev
```

Abra http://localhost:3000 e use as credenciais demo:

| Usuário                       | Senha       | Workspace                                          |
| ----------------------------- | ----------- | -------------------------------------------------- |
| `guilherme@saluti.dev`        | `saluti123` | Consultório psicólogo autônomo (Goiânia)           |
| `kris@saluti.dev`             | `saluti123` | UBS Turvânia · clínica odontológica                |

**Portal do paciente (Ana Beatriz):** http://localhost:3000/portal/ana-demo-token-please-rotate

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
| Multi-tenant (workspace switcher)                                       | Layout `/app` · cookie `saluti_ws` |
| Trial 15 dias                                                           | Onboarding `/signup` |
| Cobertura UBS / offline-first (caso Kris Fellipe)                        | Workspace `ubs-turvania` no seed |

## 🏗 Arquitetura resumida

- **Next.js 14 (App Router) + TypeScript** - full-stack, Server Actions para todas as mutações
- **Prisma + SQLite** no dev (provider trocável para PostgreSQL com 1 linha)
- **shadcn/ui-style** (Radix + Tailwind) - design system enxuto montado à mão
- **Multi-tenant** via `workspaceId` em todas as tabelas + cookie de workspace ativo (`saluti_ws`)
- **Auth** JWT em cookie httpOnly (jose) - em produção: substituir por Auth.js + sessões em DB
- **LUMA**: interface estável (`lib/providers/llm.ts`) - chama OpenAI se `OPENAI_API_KEY` setada, senão usa heurística determinística (zero-dependency demo)
- **Audit log** automático em mutações sensíveis (criação de paciente, cobrança, exportação LGPD)

Detalhes em `ARCHITECTURE.md`.

## 🧰 Comandos úteis

```bash
npm run dev           # dev server
npm run build         # build produção
npm run db:push       # sincronizar schema
npm run db:seed       # repovoar dados demo
npm run db:reset      # nuke + seed
npx prisma studio     # GUI dos dados
```

## 🔐 Variáveis de ambiente

Veja `.env` - todas com defaults de sandbox. Para usar IA real:

```bash
OPENAI_API_KEY=sk-...
```

Para integrações reais (Stripe, Asaas, NFE.io, WhatsApp, Receita Saúde): trocar as chaves correspondentes. As interfaces dos providers (`src/lib/providers/`) ficam idênticas - só a implementação `mock` é substituída.

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
