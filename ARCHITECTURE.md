# Saluti · Arquitetura do Protótipo

Este documento explica decisões técnicas, trade-offs e o caminho para produção. Foi mantido enxuto: cada seção responde **o que**, **por quê** e **como evoluir**.

---

## 1. Visão de alto nível

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (próx. clientes)                 │
│  ┌────────────────────┐    ┌──────────────────────────────┐ │
│  │ /app (autenticado) │    │ /portal/[token] (paciente)   │ │
│  │ /pay/[token]       │    │ landing /                    │ │
│  └────────────────────┘    └──────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│              Next.js 14 (App Router · Server)               │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │ Server Actions │  │ API Routes     │  │ Auth (jose)   │  │
│  │ (form mutates) │  │ (LGPD export,  │  │ JWT cookie    │  │
│  └───────┬────────┘  │  workspace sw) │  │ httpOnly      │  │
│          │           └────────┬───────┘  └───────────────┘  │
│  ┌───────▼─────────────────────▼──────────────────────────┐ │
│  │                Domain layer                            │ │
│  │  src/lib/providers/{pix, nfse, receita-saude,          │ │
│  │                     whatsapp, llm, insights}.ts        │ │
│  └───────┬───────────────────────────────────────────────┘ │
│          │                                                  │
│  ┌───────▼──────┐                                           │
│  │ Prisma ORM   │ - tenant scope via workspaceId em todas   │
│  └───────┬──────┘                                           │
└──────────▼──────────────────────────────────────────────────┘
       SQLite (dev)  /  PostgreSQL (prod)
```

## 2. Multi-tenant - modelo "shared schema"

**Decisão:** todas as tabelas de domínio carregam `workspaceId` (não usamos schemas por tenant nem DBs separados). Auth fixa um workspace ativo em cookie `saluti_ws`; todas as queries de página chamam `requireContext()` e usam `ctx.workspace.id` no `where`.

**Porquê:** o público-alvo (psicólogos autônomos + clínicas pequenas) ainda comporta isolamento lógico bem aplicado. DB-per-tenant traria custo desproporcional na fase de aquisição.

**Como evoluir:**
- Habilitar Row Level Security no Postgres usando `app.current_workspace_id` via `SET LOCAL` + middleware Prisma.
- Para clientes Enterprise: ofertar workspace dedicado (cluster Postgres separado) mantendo o mesmo schema.

## 3. Auth

**Hoje:** JWT em cookie `httpOnly` (chave `AUTH_SECRET`), bcryptjs para hash, sem refresh tokens.

**Por que não Auth.js (NextAuth) já:** queremos transparência de código no protótipo para inspeção rápida. Auth.js é a próxima migração natural - `lib/auth.ts` foi escrito com a mesma forma (`getSession`, `createSession`, `destroySession`) para minimizar atrito.

**Roadmap:**
- Auth.js + Postgres Adapter
- 2FA (TOTP) - exigido pelo CFM para sistemas com prontuário online
- SSO SAML para clínicas

## 4. Provedores externos - pattern "interface estável + mock"

Cada integração externa é encapsulada em `src/lib/providers/`. Hoje todas têm implementação **mock determinística** que persiste resultados no nosso DB (NotificationLog, externalId, etc.). Para virar real:

```ts
// Substituir o conteúdo de lib/providers/pix.ts pela chamada Asaas
export const pix = {
  generateChargeId() { /* POST /v3/payments → return id */ },
  generateCopyPaste(amount, txid) { /* GET /v3/payments/:id/pixQrCode */ },
};
```

| Provider          | Implementação atual         | Em produção                        |
| ----------------- | --------------------------- | ---------------------------------- |
| `pix.ts`          | Gera payload Pix sintético  | Asaas/Iugu (Pix Automático)        |
| `nfse.ts`         | Devolve URL pseudo-PDF      | NFE.io · Focus · Nuvem Fiscal      |
| `receita-saude.ts`| Protocolo simulado          | API Receita Federal (eSocial)      |
| `whatsapp.ts`     | Persiste em `NotificationLog` | WhatsApp Cloud API (Meta)        |
| `llm.ts`          | Heurística determinística + fallback OpenAI | OpenAI/Anthropic/Bedrock |
| `insights.ts`     | Queries SQL + regras        | Mesma engine + ML (sklearn) opcional |

## 5. IA LUMA - duas camadas

### 5.1 Sumarização clínica (`lib/providers/llm.ts`)
- Entrada: texto da evolução + nome do paciente
- Saída: `{ summary, topics[] }`
- **Modo demo (default):** heurística que detecta 16 temas (ansiedade, luto, sono, panico, vínculo conjugal, etc.) e produz markdown estruturado.
- **Modo produção:** se `OPENAI_API_KEY` está setado, chama `gpt-4o-mini` com prompt sistema que enfatiza identificação de risco psiquiátrico agudo.

### 5.2 IA Preditiva Financeira (`lib/providers/insights.ts`)
Engine determinística que computa 4 classes de insight em queries Prisma:

1. **`revenue_drop`** - compara mês atual vs anterior
2. **`overdue_pattern`** - agrega cobranças vencidas
3. **`scheduling_gap`** - ocupação de agenda vs capacidade estimada
4. **`churn_risk`** - pacientes ≥60 dias sem sessão

Roda no `/app/luma` (botão "Recalcular") e no startup quando não há insights ainda. **Não usa LLM** - é honestamente uma régua de heurísticas, mas a UI esconde isso e o resultado é indistinguível para o usuário em fase early. Trocar por ML real é incremental.

## 6. LGPD - instrumentação técnica

| Direito do titular                          | Implementação |
| ------------------------------------------- | ------------- |
| Confirmação de tratamento                   | Pesquisa por CPF/email + `ConsentRecord` |
| Acesso aos dados                            | `/app/lgpd` · botão "Exportar JSON" |
| Correção                                    | `/app/pacientes/[id]` editável |
| Anonimização                                | `anonymizeAction` - substitui PII por `ANONIMIZADO`, mantém integridade contábil |
| Portabilidade                               | `/api/lgpd/export?patientId=...` retorna JSON estruturado |
| Eliminação                                  | Soft delete (`deletedAt`) - preserva obrigação fiscal de 5 anos |
| Compartilhamento                            | `NotificationLog` registra todo envio externo |
| Negativa de consentimento                   | Campo `granted` em `ConsentRecord` |
| Revogação                                   | `revokedAt` em `ConsentRecord` |

**Audit log:** middleware via `recordAudit()` em todas as mutações sensíveis. Append-only por convenção; em produção: armazenar fora do DB principal (S3 + Object Lock, ou DynamoDB stream).

**Bases legais aplicáveis** (mapeadas no fluxo de Onboarding):
- **Tutela da saúde** (art. 11, II, "f") - base padrão para coleta clínica
- **Consentimento** - para marketing, comunicação automatizada
- **Execução de contrato** - para emissão fiscal e cobranças
- **Obrigação legal** - Receita Saúde, NFS-e

## 7. Performance e DX

- **Server Components** por padrão - só viram `"use client"` quando precisa (Recharts, switcher, etc.)
- **Server Actions** para todos os forms - zero `useState` para mutações
- **Recharts** para o fluxo de caixa (única dependência client-side pesada)
- **App Router** com layouts aninhados - workspace switcher fica no layout

## 8. Convenções de código

- Comentários só onde a intenção não está óbvia (e.g. justificar o mock vs real)
- Server Actions colocadas no mesmo arquivo do componente que as usa (`"use server"`)
- Cada provider em arquivo dedicado e funções nomeadas pelo domínio (`pix.generateCopyPaste`) - sem `utils.ts`
- Prisma é a fonte de verdade do tipo; nunca recriamos types manualmente

## 9. Próximos passos pragmáticos

1. **TISS / convênios** - adicionar `InsurancePlan`, `TissBatch` ao schema; integrar API SIB
2. **Memed / SafeID** - receituário digital com assinatura ICP-Brasil real
3. **Offline-first** para UBS - service worker + IndexedDB-mirror do Patient/Appointment (caso Kris Fellipe)
4. **WhatsApp Cloud API** - substituir o mock; aprovar templates `reminder_24h`, `charge_due`, `receipt_issued`
5. **Stripe Billing** - assinatura SaaS da própria Saluti (tier Pro R$ 129/mês)
6. **Onboarding wizard** - após signup, walkthrough de 5 passos (workspace, profissional, anamnese, integrações, paciente piloto)
7. **Mobile (React Native)** - app nativo do paciente reutilizando endpoints de `/portal/[token]`
8. **TCC, anamneses por especialidade** - biblioteca pública de templates (psicanálise lacaniana, junguiana, etc.)
9. **Testes** - Vitest para `providers/insights.ts` (engine determinística + fácil de testar); Playwright para fluxos críticos

## 10. Modelo de dados resumido

Veja `prisma/schema.prisma`. Grupos:

- **Identidade:** `User`, `Workspace`, `Membership`
- **Clínico:** `Patient`, `Professional`, `Appointment`, `ClinicalNote`, `AnamnesisTemplate`
- **Financeiro:** `Charge`, `PaymentLink`, `Subscription`
- **Fiscal:** `Receipt`, `Invoice`
- **LGPD / Auditoria:** `ConsentRecord`, `AuditLog`
- **IA:** `AiInsight`
- **App do paciente:** `DailyCard`, `PatientPortalAccess`
- **Comunicação:** `NotificationLog`

Todos com `workspaceId` indexado.
