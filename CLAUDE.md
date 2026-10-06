# CLAUDE.md — salutti-app

Guia rápido para sessões futuras do Claude Code neste repositório.

## Leitura obrigatória antes de mexer no código

1. `README.md` — setup, credenciais demo, mapa requisito→módulo.
2. `ARCHITECTURE.md` — decisões técnicas, trade-offs deliberados e roadmap (§9 "Próximos passos pragmáticos").
3. `STATUS.md` — estado atual, pendências encontradas na última retomada, plano priorizado. **Atualize este arquivo ao final de cada sessão relevante** (o que mudou, o que ficou pendente).

## Comandos

```bash
npm run dev           # dev server
npm run build         # prisma generate && next build
npm run db:push       # sincronizar schema Prisma
npm run db:seed       # recria usuários, consultórios e modelos de anamnese, sem pacientes (tsx prisma/seed.ts)
npm run db:admin      # criar/atualizar usuário admin (admin/admin) — scripts/create-admin.ts
npm run db:reset      # force-reset + seed
npx prisma studio     # GUI dos dados
node scripts/smoke-test.mjs <userId> <workspaceId>   # smoke test manual das rotas /app/*
```

Não há suíte de testes automatizada (Vitest/Playwright) ainda — decisão deliberada documentada em `ARCHITECTURE.md`. Se for adicionar, `src/lib/providers/insights.ts` é o melhor ponto de partida (puro, determinístico, sem I/O).

## Convenções já estabelecidas (seguir, não reinventar)

- Server Components por padrão; `"use client"` só quando necessário (Recharts, workspace switcher).
- Mutações via Server Actions (`"use server"`) no mesmo arquivo do componente que as usa — sem camada de API separada para forms internos.
- Cada integração externa mockada vive em `src/lib/providers/<nome>.ts` com interface estável e função nomeada por domínio (`pix.generateCopyPaste`, não um `utils.ts` genérico). Ao integrar de verdade, só o corpo da função muda, a assinatura não.
- Tipos vêm do Prisma Client — nunca recriar types manualmente.
- Todo modelo de domínio carrega `workspaceId`; toda query de página passa por `requireContext()` para resolver usuário + workspace ativo (multi-tenant "shared schema", não schema-per-tenant).
- Comentários só onde a intenção não é óbvia (ex.: por que algo é mock, por que uma decisão foge do padrão).

## Armadilhas conhecidas

- **Não existe `prisma/dev.db` até você rodar `db:push` + `db:seed`** — só `prisma/seed.db` (usado pelo modo demo da Vercel) está versionado.
- **`scripts/smoke-test.mjs` assina o JWT com um segredo hardcoded** diferente do `AUTH_SECRET` do `.env` — ajuste um dos dois antes de confiar no resultado.
- **Modo demo na Vercel não persiste dados entre cold starts** (`src/lib/db.ts` copia `seed.db` para `/tmp` a cada start) — comportamento esperado, não é bug.
- Auth é implementação própria (jose + bcrypt), não Auth.js — migração está mapeada no roadmap, não presuma que já existe suporte a 2FA/SSO.
