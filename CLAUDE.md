# CLAUDE.md — salutti-app

Guia rápido para sessões futuras do Claude Code neste repositório.

## Leitura obrigatória antes de mexer no código

1. `README.md` — setup, seed de desenvolvimento (SEED_DEMO=1), mapa requisito→módulo.
2. `ARCHITECTURE.md` — decisões técnicas, trade-offs deliberados e roadmap (§9 "Próximos passos pragmáticos").
3. `STATUS.md` — estado atual, pendências encontradas na última retomada, plano priorizado. **Atualize este arquivo ao final de cada sessão relevante** (o que mudou, o que ficou pendente).

## Comandos

```bash
npm run dev           # dev server
npm run build         # prisma generate && next build
npm run db:local      # Postgres local embutido (localhost:5433, dados em .pgdata)
npm run db:migrate    # nova migration a partir do schema.prisma
npm run db:deploy     # aplica migrations pendentes
npm run db:seed       # com SEED_DEMO=1: recria usuários/consultórios de desenvolvimento, sem pacientes; sem ela não cria usuários (tsx prisma/seed.ts)
npm run db:admin      # criar/atualizar usuário admin (admin/admin) — scripts/create-admin.ts
npm run db:reset      # force-reset + seed
npx prisma studio     # GUI dos dados
npm test              # unitários (Vitest): datas/fuso, rótulos, formatação, videochamada, insights
npm run test:e2e      # ponta a ponta (Playwright): Postgres descartável e servidor na porta 3300
node scripts/smoke-test.mjs <userId> <workspaceId> [baseUrl]   # smoke test manual das rotas /app/*
```

Testes: unitários em `tests/unit` (Vitest) e ponta a ponta em `tests/e2e` (Playwright). O CI (`.github/workflows/ci.yml`) roda lint, tipos, unitários com `TZ=UTC` e o e2e contra o build de produção em todo PR. Datas sempre via `src/lib/dates.ts` (fuso de São Paulo); ids vindos de formulário sempre via `src/lib/tenant.ts`.

## Convenções já estabelecidas (seguir, não reinventar)

- Server Components por padrão; `"use client"` só quando necessário (Recharts, workspace switcher).
- Mutações via Server Actions (`"use server"`) no mesmo arquivo do componente que as usa — sem camada de API separada para forms internos.
- Cada integração externa mockada vive em `src/lib/providers/<nome>.ts` com interface estável e função nomeada por domínio (`pix.generateCopyPaste`, não um `utils.ts` genérico). Ao integrar de verdade, só o corpo da função muda, a assinatura não.
- Tipos vêm do Prisma Client — nunca recriar types manualmente.
- Todo modelo de domínio carrega `workspaceId`; toda query de página passa por `requireContext()` para resolver usuário + workspace ativo (multi-tenant "shared schema", não schema-per-tenant).
- Comentários só onde a intenção não é óbvia (ex.: por que algo é mock, por que uma decisão foge do padrão).

## Armadilhas conhecidas

- **Banco é Postgres em todo lugar.** Local: `npm run db:local` + `SEED_DEMO=1 npm run db:seed`. Mudou o schema? `npm run db:migrate -- --name <descricao>` (nunca `db push`). Produção aplica migrations no `vercel-build`, pela conexão direta do Neon (`DATABASE_URL_UNPOOLED`).
- Auth é implementação própria (jose + bcrypt) com 2FA TOTP (`src/lib/totp.ts`); não há SSO nem Auth.js.
- No Windows, `prisma generate` falha com EPERM se um dev server estiver aberto (a DLL do motor fica travada); o cliente JS é gerado mesmo assim.
