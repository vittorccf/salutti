# Status — salutti-app

> Última atualização deste arquivo: 2026-09-21 (retomada após ~3 meses parado).

## Onde parou

- **Último commit:** `33f3ca7` — "style: remoção de travessões" — 16/06/2026, 14:41 (Brasília).
- **4 commits no total, todos de 16/06/2026**: commit inicial (protótipo completo) → fix de build na Vercel → modo demo com SQLite versionado → ajuste cosmético de texto.
- `git status` limpo, sem branches paralelas. Repositório construído em uma única sessão intensa de desenvolvimento assistido por IA.
- Documentação (`README.md`, `ARCHITECTURE.md`) está atualizada e é a fonte de verdade para arquitetura, stack e próximos passos — **não duplicada aqui**. A seção 9 do `ARCHITECTURE.md` ("Próximos passos pragmáticos") continua 100% válida.

## O que está funcionando (protótipo navegável completo)

Agenda, prontuário (anamnese + evolução com sumarização LUMA), financeiro (cobranças, link de pagamento público, régua de cobrança), fiscal (NFS-e/recibos), comunicação (WhatsApp mock), IA preditiva financeira (LUMA), portal do paciente, LGPD (painel + exportação + audit log), multi-tenant com dois workspaces demo (psicólogo solo + UBS odonto). Todas as integrações externas são mocks deliberados e documentados (não são bugs).

## Pendências técnicas encontradas na retomada (além do roadmap do ARCHITECTURE.md §9)

1. **Não há `prisma/dev.db` local** — para rodar localmente é preciso repetir `npx prisma db push` + `npm run db:seed` do zero (só `prisma/seed.db`, usado no modo demo Vercel, está versionado).
2. **`scripts/smoke-test.mjs` usa um segredo JWT hardcoded** (`dev-secret-please-change-in-production-salutti-prototype-001`) diferente do `AUTH_SECRET` real do `.env` — só funciona se `AUTH_SECRET` não tiver sido customizado, ou precisa ser ajustado manualmente antes de usar.
3. **Sem workflow de CI** (`.github/workflows` não existe neste repo) e sem `vercel.json`/pasta `.vercel` local — não há evidência local de qual projeto/URL está ativo na Vercel. Vale confirmar no painel da Vercel se o deploy demo ainda está de pé.
4. **Modo demo da Vercel não persiste dados entre cold starts** — limitação conhecida e aceita (documentada no commit `da097cb`), não é bug a corrigir, mas relevante lembrar se for usado para demonstrar a clientes.

## Plano de retomada priorizado

1. **Reconfirmar que o ambiente ainda builda.** `npm install` → `npx prisma db push --skip-generate` → `npx prisma generate` → `npm run db:seed` → `npm run dev`. Rodar `scripts/smoke-test.mjs` (ajustando o segredo JWT se necessário) para validar as 11 rotas principais.
2. **Confirmar o estado do deploy na Vercel** (painel Vercel: projeto existe? build passando? domínio ativo?). Se for usar para demonstrar a clientes reais, lembrar da limitação de persistência do modo demo.
3. **Decidir o próximo item de produto a atacar**, escolhendo entre o roadmap já mapeado em `ARCHITECTURE.md` §9 — sugestão de ordem por impacto/esforço:
   - **Testes automatizados** (Vitest em `providers/insights.ts`, que é puro e determinístico — ganho rápido de confiança antes de mexer em mais nada).
   - **Onboarding wizard** pós-signup (melhora a primeira impressão para qualquer demo/venda).
   - **Integração real de um provider** (WhatsApp Cloud API ou Stripe Billing são os mais diretos) para sair do estágio "só mock".
   - Itens maiores (TISS/convênios, Memed/ICP-Brasil, offline-first UBS, mobile nativo) ficam para quando houver validação de demanda real desses segmentos.
4. **Corrigir a inconsistência do `smoke-test.mjs`** (item 2 acima) antes de confiar nele como checagem de regressão.

## Arquivos-chave para retomar contexto

- `README.md`, `ARCHITECTURE.md` — leitura obrigatória antes de codar.
- `prisma/schema.prisma` — modelo de dados completo.
- `src/lib/auth.ts`, `src/lib/db.ts` — auth e lógica de banco/modo demo.
- `src/lib/providers/*.ts` — pontos de extensão para integrações reais.
- `scripts/create-admin.ts`, `scripts/smoke-test.mjs` — utilitários operacionais.
- `../resource/Takeout/NotebookLM/SaaS/` — pesquisa de discovery original (personas, concorrência, regulação).
