# Salutti Odonto

A terceira área da Salutti (`area = "odonto"`, `src/lib/areas.ts`), para cirurgiões-dentistas e clínicas odontológicas.

- **Visual:** design system "Salutti Odonto" (artifact https://claude.ai/artifact/9WevV4ACtLCUwtRCXSXRup):
  - azul gelo, cobalto e marinho;
  - selo "odonto" em Geist Mono;
  - tokens em `[data-area="odonto"]` (`src/app/globals.css`) e logos em `public/brand/odonto`.
- **Regras puras:** `src/lib/odonto.ts`. Testes em `tests/unit/odonto.test.ts` e `tests/e2e/odonto.spec.ts`.

## Entrada

- **Páginas públicas:** `/odonto` (landing), `/odonto/login` e `/odonto/cadastro`.
- **Especialidades no cadastro:**
  - clínico geral, ortodontia, implantodontia, endodontia, odontopediatria, periodontia e prótese;
  - clínica odontológica (conta de clínica).
- **Profissões:** dentista, TSB e ASB; conselho CRO.
- **Anamnese:**
  - "Anamnese odontológica": anticoagulantes, sangramento, bisfosfonatos, endocardite/prótese valvar, radioterapia, gestação;
  - "Anamnese de odontopediatria", feita com o responsável.

## Módulos (liberáveis por cliente no backoffice)

### `odontograma`

- **Odontograma** (`/app/pacientes/<id>/odontograma`):
  - acesso só para papel clínico, por ser prontuário (Res. CFO 174/92);
  - dentições permanente e decídua (FDI);
  - situações: hígido, a tratar, em tratamento, restaurado, extração indicada, ausente, implante;
  - faces em sigla, normalizadas: MOD; anterior usa I e posterior usa O;
  - histórico do dente pelos planos.
- **Planos e orçamentos** (`/app/planos`):
  - o plano de tratamento é o orçamento: em estudo → aprovado → concluído, ou recusado/cancelado;
  - número sequencial por consultório;
  - itens por dente, faces e TUSS, com valor da tabela;
  - desconto, parcelas, 1º vencimento e validade.
- **Aprovação** (`financeiro.receber`):
  - gera as parcelas em Cobranças (`Charge.treatmentPlanId` e `installment`), com Pix ou boleto e link de pagamento;
  - roda numa transação que só passa se o plano ainda estiver em estudo.
- **Procedimento realizado** (ato clínico):
  - atualiza o odontograma (`toothResult`) e cria o retorno sugerido (`returnMonths`);
  - o plano conclui quando não sobra item planejado.
- **Cancelar plano aprovado:** cancela as parcelas em aberto; as pagas ficam.
- **Orçamento impresso** (`/impressao/orcamento/<id>`): consultório, paciente, dentes e faces, valores, condições, validade e assinaturas.
- **Tabela de procedimentos** (`/app/planos/tabela`):
  - a tabela sugerida tem 27 itens, sem preço nem TUSS;
  - TUSS com 8 dígitos;
  - "por dente" exige o dente no plano.
- **Retornos** (`/app/retornos`):
  - profilaxia, manutenção periodontal e ortodôntica, revisão;
  - vencidos, próximos 30 dias e agendados, com WhatsApp pronto;
  - na anonimização do paciente, os pendentes são cancelados.

### `protese`

- **Prótese** (`/app/protese`):
  - ordem de serviço com laboratório, trabalho, dentes, cor (escala Vita), envio, prazo e custo;
  - fluxo: enviar → prova → recebido → instalado, com refazer;
  - atrasados destacados.

## Permissões

- **Escopo:** em clínica, o dentista vê os próprios pacientes (`portalPatientScope`).
- **Por ação:**
  - recepção (`pacientes.gerenciar`) monta planos, prótese e retornos;
  - quem recebe (`financeiro.receber`) aprova, cancela plano aprovado e edita a tabela;
  - só papel clínico vê o odontograma e marca "realizado".
- **Sessão de suporte:** é somente leitura e não é clínica.

## Pendências

- Guia GTO (TISS odontológico) a partir do plano aprovado: os dados de dente, face e TUSS já ficam guardados.
- Repasse ao dentista (percentual sobre o realizado ou o recebido).
- Periograma e odontograma por face (desenho das 5 faces).
- Consultórios antigos com segmento "odonto" na área mental continuam lá; o backoffice pode liberar os módulos `odontograma` e `protese` em Liberações.
