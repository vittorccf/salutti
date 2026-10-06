# Status — salutti-app

> Última atualização deste arquivo: 2026-10-06. A seção "Pacote de melhorias" é a mais recente; as demais ficam como histórico.

## Pacote de melhorias (2026-10-06) — PRs #14 e #15, e Lote E (idiomas)

Pedido do dono em 10 itens + Google Meet por usuário. Cada lote passou pelos revisores do projeto (`.claude/agents/psicologo.md`, `advogado-do-diabo.md`, `qualidade.md`) e teve os bloqueantes corrigidos antes do commit.

| Lote | PR | Entrega |
|---|---|---|
| A | #14 | LUMA → **TOBI** (redirect `/app/luma`); aba só "Salutti"; telefone internacional (bandeira, DDI, máscara, E.164, `libphonenumber-js/max`); e-mail com sugestão de domínio e checagem MX; CEP preenche endereço (ViaCEP → BrasilAPI, cache e limite); edição de paciente; erros de formulário sem perder dados (`ActionForm`) |
| B | #14 | Cadastro separa **autônomo × clínica** (`Workspace.accountType`), troca em Ajustes; autônomo com 1 profissional ativo; CNPJ numérico/alfanumérico; **aniversários no painel** (pacientes só para quem atende, sem recepção/financeiro; equipe; o próprio usuário) |
| C | #15 | Foto de perfil; **banner ou foto no lugar da marca** no menu; **foto do paciente** com consentimento registrado, só na ficha, `no-store`; imagens no Postgres (`MediaFile`) via `src/lib/providers/media.ts` |
| D | #15 | **Google Meet com a conta Google de cada profissional** (OAuth + PKCE, token cifrado, evento privado, apagado ao cancelar; sem conexão = sem link, com aviso) |
| E | #16 | **Idiomas** pt-BR (padrão), pt-PT, es, en em todo o sistema (`next-intl`, `docs/I18N.md`) |

**Depende do dono:**
1. Merge do #14 e depois do #15 (o #15 contém o #14; após o primeiro merge, o diff do segundo encolhe).
2. Google Meet real: cliente OAuth "Aplicativo da Web" (Calendar API, URI `https://salutti.vercel.app/api/integracoes/google/retorno`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` na Vercel. Até a verificação do app pelo Google: só usuários de teste (até 100) e acesso expira em 7 dias. Avaliar o escopo mais estreito `calendar.app.created` antes de pedir a verificação.
3. Preview e produção dividem o mesmo banco Neon (decisão do dono, "por hora").
4. O artifact do Design System ainda cita "LUMA": atualizar exige autorização para publicar.

**Idiomas, ficou para depois:** insights do TOBI são gerados e salvos em pt-BR (guardar código + parâmetros e traduzir na tela); páginas públicas deixaram de ser estáticas (o idioma vem do cookie); formatos brasileiros (CPF, CEP, telefone +55 padrão) valem em qualquer idioma: pt-PT/es/en são interface para quem atende no Brasil; código antigo sem uso (`labels.ts` exceto `chargeDisplayStatus`/`UFS`, `lgpd.ts`, `mood.ts`, formatadores de `utils.ts`, `PLANS.price`); dias da semana/mês ainda com `Intl` direto em agenda e financeiro.

**Ficou para depois (registrado pelos revisores):** limpeza periódica de imagens órfãs (corrida entre duas edições simultâneas); limite de profissionais do autônomo checado fora de transação; painel lê aniversários de pacientes em memória (filtrar no SQL quando houver muitos); papéis (recepção/financeiro) ainda não restringem prontuário; nome do paciente vai para a OpenAI no resumo do TOBI; convites de usuários para a clínica não existem (vínculo profissional ↔ usuário só para quem já é membro).

## Roadmap executado (2026-10-06) — PRs encadeados #1 → #11

Cada item tem PR próprio, testes e CI verde (exceto onde indicado). Merge na ordem; o GitHub redireciona a base de cada PR.

| PR | Entrega |
|---|---|
| #1 | Design System Salutti (tokens, tema escuro, regras de uso em todas as telas) |
| #2 | Datas no fuso de São Paulo (`src/lib/dates.ts`) |
| #3 | Base limpa, sem pacientes/profissionais fictícios |
| #4 | Segurança: isolamento entre consultórios (IDOR), `AUTH_SECRET` obrigatório em produção |
| #5 | Google Meet e Zoom no agendamento |
| #6 | Testes (Vitest + Playwright) e CI no GitHub Actions |
| #7 | Primeiros passos e biblioteca de modelos de anamnese |
| #8 | Assinatura da Salutti com Stripe Billing |
| #9 | Verificação em duas etapas (TOTP) |
| #10 | Convênios e faturamento TISS 4.03.00 (XML validado contra os XSD oficiais) |
| #11 | PostgreSQL com migrations (substitui SQLite e o modo demo) |

**Depende do dono do projeto:**
1. Merges (o agente não faz merge sem revisão).
2. Vercel/produção: `AUTH_SECRET` (antes do #4) e um Postgres com `DATABASE_URL`, ex.: Neon (antes do #11). Depois do #11: `DATABASE_URL=<url> npm run db:seed` para os logins de demonstração.
3. Credenciais reais para sair do modo de teste: Google (Meet), Zoom, Stripe (chaves, preços, webhook).
4. Local: trocar `DATABASE_URL` do `.env` para o Postgres local (ver `.env.example`) e usar `npm run db:local`.

**Ainda não feito (decisão do dono):** WhatsApp Cloud API, Memed/receita digital, app mobile nativo, modo offline para UBS, guia odontológica (GTO) no TISS, Auth.js/SSO.

**Observado:** o build às vezes falha ao baixar as fontes do Google Fonts (`next/font`), de forma intermitente; uma reexecução resolve. Hospedar as fontes localmente (`next/font/local`) elimina o problema.

## Base limpa (2026-10-06) — branch `chore/base-limpa`

Pacientes e profissionais fictícios removidos do banco local (`prisma/prisma/dev.db`) e do `prisma/seed.db` (demo da Vercel), com tudo ligado a eles (sessões, cobranças, prontuários, recibos, NFS-e, consentimentos, mensagens, insights, cartões, portal, auditoria). Ficam usuários, consultórios, vínculos e modelos de anamnese. O `seed.ts` não cria mais dados fictícios. Backup dos dois bancos em `prisma/backup-2026-10-06/` (ignorado pelo Git).

## Migração para o Design System (2026-10-06) — branch `feat/design-system-v2`

Design System: https://claude.ai/artifact/Ud2EXsJocT4Q6nNw7nCWy1 (gerado a partir deste código; tokens idênticos, conferidos nos dois temas).

**Feito (tsc + lint ok em cada etapa; build completo ok no fim):**
- Tokens do DS aplicados; todas as 26 telas seguindo as regras de uso (status pt-BR via `StatusBadge`, `plural`, formato BR, rótulos em `src/lib/labels.ts` e `src/lib/lgpd.ts`, humor sem emoji em `src/lib/mood.ts`, valores tabulares à direita, voz da TOBI em `insights.ts`).
- Menu do perfil com tema claro/escuro (`next-themes`, chave `salutti-theme`); nav com item ativo; sidebar vira gaveta abaixo de `md`.
- Contraste AA em todos os pares de texto nos dois temas: `muted-foreground` claro 47% → 44% e novo token `destructive-strong`.
- Bugs pré-existentes corrigidos: logout por GET disparado pelo prefetch (agora só POST); `<div>` do Badge dentro de `<p>` (erro de hidratação #418); layout mobile com scroll horizontal; título invisível no aviso da tela Fiscal.
- ESLint configurado (`.eslintrc.json`). `NEXT_DIST_DIR` permite builds de verificação em `.next-check` sem derrubar o dev server (o Next reescreve o `tsconfig.json` nesses builds — descartar com `git checkout -- tsconfig.json`).

**Pendente:**
1. ~~Rodar `npx next build`~~: build completo passou em 2026-10-06.
2. ~~Espelhar no artifact do DS as mudanças de token~~: publicado em 2026-10-06 (versão 6 do artifact).
3. ~~Fuso horário~~: corrigido na branch `fix/timezone` (`src/lib/dates.ts`): grava, exibe e compara em `America/Sao_Paulo`; campos só-data em 00:00 SP; vencida só a partir do dia seguinte. Testado com o servidor em UTC, São Paulo, Tóquio e Los Angeles (saída idêntica). Registros criados antes pelo formulário (só-data em 00:00 UTC) aparecem um dia antes; o seed não é afetado.
4. **Insights da TOBI já salvos no banco** mantêm o texto antigo até "Recalcular insights" (ou novo seed).
5. Botões em `primary-strong` nas páginas públicas estão sobrescritos via `className`; considerar uma variante do `Button`.
6. Imports sem uso antigos: `fiscal/page.tsx` (`Link`, `Button`, `formatDateTimeBR`, `Landmark`), `equipe/page.tsx` (`Link`), `tobi/page.tsx` (`CardDescription`).

## Onde parou

- **Último commit:** `33f3ca7` — "style: remoção de travessões" — 16/06/2026, 14:41 (Brasília).
- **4 commits no total, todos de 16/06/2026**: commit inicial (protótipo completo) → fix de build na Vercel → modo demo com SQLite versionado → ajuste cosmético de texto.
- `git status` limpo, sem branches paralelas. Repositório construído em uma única sessão intensa de desenvolvimento assistido por IA.
- Documentação (`README.md`, `ARCHITECTURE.md`) está atualizada e é a fonte de verdade para arquitetura, stack e próximos passos — **não duplicada aqui**. A seção 9 do `ARCHITECTURE.md` ("Próximos passos pragmáticos") continua 100% válida.

## O que está funcionando (protótipo navegável completo)

Agenda, prontuário (anamnese + evolução com sumarização TOBI), financeiro (cobranças, link de pagamento público, régua de cobrança), fiscal (NFS-e/recibos), comunicação (WhatsApp mock), IA preditiva financeira (TOBI), portal do paciente, LGPD (painel + exportação + audit log), multi-tenant com dois workspaces demo (psicólogo solo + UBS odonto). Todas as integrações externas são mocks deliberados e documentados (não são bugs).

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
