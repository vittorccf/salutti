# Design system: Salutti 2.0

Fonte: artifact "Salutti 2.0" (https://claude.ai/artifact/U4fSes1U9WNNrB9NMg41Sf), arquivo `tokens.json`.
O `tokens.css` publicado lá estava desatualizado (índigo e coral) no dia da aplicação; vale o `tokens.json`
(azul ardósia, pervinca, lavanda e pêssego).

## Onde está no código

- **Tokens:** `src/app/globals.css`: tema **Dia** em `:root`, **Noite** em `.dark`, mesmos nomes. Tailwind em `tailwind.config.ts`.
- **Fontes:** Geist 400/500/600 e Instrument Serif itálico em `src/app/fonts/` (via `next/font/local`, sem Google Fonts no build).
- **Logo:** `<Logo>` em `src/components/brand/logo.tsx`, desenhado em SVG embutido para acompanhar o tema (claro: balões no degradê pervinca → pêssego, nome `#12141c`; escuro: balões `#e9eef3` com o de baixo a 60%, nome na cor do texto). O pingo do "i" é sempre pervinca (`#4a57c9` no claro, `#8a92d8` no escuro), também na Estética. Variantes `horizontal` (login, cadastro, topo), `symbol` (espaços pequenos), `icon` e `wordmark`; tons `default`, `negative` e `mono`; `area="estetica"` troca o degradê e põe o selo. Arquivos estáticos em `public/brand` (para usos fora do app). Favicon `src/app/icon.svg` e ícones do app/PWA (`public/brand/icon-*.png`, `src/app/apple-icon.png`) vêm do `salutti-icone.svg`, listados em `src/app/manifest.ts`.
- **Componentes:** `src/components/ui/*` seguem os do DS (Button, Badge, Card, Input, Select, Textarea, Label, Separator, Table, EmptyState).

## Regras de uso (resumo do DS)

| Use | Para |
|---|---|
| `bg-primary` (Button `default`) | a ação principal: sólido de alto contraste (tinta no Dia, névoa na Noite). **Uma por área.** |
| `brand` (`text-brand`, Button `brand`, `ring`) | identidade: links, item ativo, foco, série principal dos gráficos. `text-primary-strong` é um alias de `brand`. |
| `highlight` (pêssego) | ponto, pílula ou marcador, **nunca texto**, no máximo um por tela (ex.: indicador do Saluttin). |
| `success`/`warning`/`destructive` | fundo (Badge a 12%); `*-strong` para texto. Sempre com palavra ou ícone. |
| `bg-gradient-brand`, `bg-gradient-brand-light`, `bg-gradient-glow` | só peças de marca e heróis; **no máximo um elemento com degradê por tela**, nunca em botões, badges ou texto. |
| `.border-saluttin` | borda de 1px no degradê do Saluttin (card da IA). |

**Tipografia** (classes em `globals.css`): `text-display` (saudação do painel, 30px), `text-page-title` (título de página, 22px),
`text-card-title` (16px, já no `CardTitle`), `text-overline` (cabeçalhos de tabela, já no `TH`), `text-hero` + `text-accent-serif`
(só marketing: uma palavra em serifa itálica no fim do título; nunca dentro do app).

**Forma:** controles `rounded-md` (10px), popovers `rounded-lg` (14px), cards `rounded-xl` (18px), badges `rounded-full`.
Profundidade por borda, não por sombra. Muito respiro: em dúvida, mais espaço e menos elementos.

**Ícones:** Lucide, traço 1,75px (global), 16px em botões, 20–24px em navegação e estados vazios. Sem emoji.

**Voz:** pt-BR, "você", maiúscula só no início; termos do consultório (paciente, sessão, prontuário, evolução, cobrança);
botões verbo + objeto; títulos "Objeto · contexto"; estados vazios dizem o que falta e o próximo passo; erros dizem o que
aconteceu e como resolver, sem pedir desculpas. Sigilo: nunca conteúdo de prontuário em notificações ou pré-visualizações.
Textos ficam em `messages/*` (ver `docs/I18N.md`).
