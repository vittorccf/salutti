# Contas a pagar e relatórios financeiros

Módulo de despesas do consultório (`/app/financeiro/pagar`) e relatórios do financeiro (`/app/financeiro/relatorios`).
Acesso: **dono, administrador e financeiro** (`canManagePayables` em `src/lib/permissions.ts`). Profissional e recepção recebem 404,
e as abas "Contas a pagar" e "Relatórios" não aparecem para eles.

## Modelo (prisma/schema.prisma)

| Modelo | Papel |
|---|---|
| `Supplier` | Fornecedor ou favorecido (CPF/CNPJ só dígitos, e-mail, telefone, chave Pix, categoria padrão, ativo). |
| `FinanceCategory` | Plano de contas. Grupo (ordem da DRE), `deductible` (sugestão para o Livro-Caixa), `systemKey` nas categorias padrão. |
| `Payable` | A conta. Valor em **centavos**; `competenceDate` (mês da despesa, DRE) e `dueDate` (caixa); boleto, Pix, documento, centro de custo; série (`seriesId`, `seriesIndex`, `installmentTotal` ou `frequency`); cancelamento lógico. |
| `PayablePayment` | Baixa total ou parcial. `principalCents` abate a conta; saiu do caixa = principal + juros + multa − desconto. Estorno marca `reversedAt`, nunca apaga. |
| `PayableAttachment` | Boleto, nota, comprovante ou contrato em `MediaFile` (`kind: payable_attachment`, PDF ou imagem até 2 MB, tipo conferido pelo conteúdo). |

O plano de contas padrão (`DEFAULT_CATEGORIES` em `src/lib/payables.ts`) é criado no primeiro acesso de cada consultório.

## Regras (src/lib/payables.ts e src/lib/boleto.ts, testes em tests/unit/payables.test.ts)

- **Situação** calculada, não gravada: cancelada, paga, vencida, paga em parte, vence hoje ou em aberto (`payableStatus`).
- **Parcelada:** o total é dividido em parcelas iguais e os centavos que sobram vão para as primeiras. Todas ficam com a competência da compra.
- **Recorrente:** semanal até anual, por quantidade, até uma data ou sem fim (gera 12 meses e o botão "Gerar as próximas" acrescenta mais).
  O dia âncora se mantém (31/01 → 28/02 → 31/03), e cada ocorrência fica com a competência do seu mês.
- **Fim de semana/feriado:** manter, ir para o próximo dia útil ou antecipar. Os feriados bancários nacionais incluem os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) e o 20/11 a partir de 2024.
  A regra vale na criação da série. As ocorrências geradas depois por "Gerar as próximas" não passam por ela.
- **Editar/cancelar** "só esta" ou "esta e as próximas em aberto da série". Nas próximas mudam descrição, fornecedor, categoria, forma, observações e,
  em recorrentes, o valor. Vencimento, boleto e Pix mudam só na conta aberta. Conta com pagamento só é cancelada depois do estorno.
- **Pagamento:** o valor não pode passar do saldo. A conta é travada (`SELECT … FOR UPDATE`) durante a conferência, então dois envios simultâneos não pagam em dobro.
  O mesmo vale para o pagamento em lote da lista.
- **Linha digitável:**
  - Boleto bancário (47 dígitos): confere os 3 DVs módulo 10 e o DV geral módulo 11, e extrai banco, valor e vencimento.
    O fator de vencimento recomeçou em 1000 no dia 22/02/2025; entre as duas datas possíveis, fica a mais próxima de hoje.
  - Arrecadação (48 dígitos, começa com 8): DV módulo 10 quando o 3º dígito é 6 ou 7, e módulo 11 quando é 8 ou 9. Só há valor quando o 3º dígito é 6 ou 8, e não há vencimento padronizado.
    O PDF da Febraban é digitalizado e não pôde ser conferido; a regra segue as bibliotecas de mercado. O valor lido pode ser editado no formulário.
- **CSV:** ";" como separador e BOM para abrir no Excel em português. Célula que começa com = + - @ vira texto (injeção de fórmula).

## Relatórios (src/app/app/financeiro/relatorios/_data.ts)

- **Fluxo de caixa** do ano, mês a mês: realizado pela data do pagamento (cobranças pagas e baixas de contas) e previsto pelo vencimento do que está em aberto.
- **DRE simplificada** por competência: receita pelo vencimento das cobranças; despesas por grupo do plano de contas; resultado.
- **Despesas por categoria** (com %) e os 15 maiores fornecedores do ano.
- **Livro-Caixa** do carnê-leão (regime de caixa):
  - A receita são as cobranças pagas na Salutti; as despesas, as pagas e marcadas como dedutíveis.
  - Juros e multa ficam de fora, e o desconto reduz o valor.
  - A dedução do mês fica limitada à receita do mês. O excedente passa para os meses seguintes e zera em janeiro.
  - Base legal pesquisada: Lei 8.134/1990, art. 6º; RIR/2018; IN RFB 1.500/2014, art. 104. As sugestões de dedutível seguem o que a Receita aceita de forma explícita.
  - É apoio, não parecer: a tela pede para confirmar com o contador.

Cada relatório exporta em CSV (`/app/financeiro/relatorios/exportar?view=…&year=…`), e a lista de contas exporta com os mesmos filtros da tela
(`/app/financeiro/pagar/exportar`). As exportações ficam na auditoria.

## Painel inicial

Para dono, administrador e financeiro, o painel mostra quantas contas estão vencidas e quantas vencem em 7 dias, com o saldo de cada grupo.

## Ficou para depois

- Contas bancárias com saldo e conciliação por extrato OFX.
- Rateio de uma conta entre centros de custo.
- Aprovação de pagamento (clínicas com financeiro separado).
- Lembrete de vencimento por e-mail: depende do serviço de e-mail, que ainda não existe.
- Importação de planilha.
- Leitura do PDF do boleto.
- Anexos em storage de objetos: hoje ficam no Postgres, e o Neon Free tem 1 GB.
