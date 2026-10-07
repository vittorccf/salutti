# Salutti Estética

Mesma plataforma, marca e módulos por **área** (`Workspace.area`: `mental` | `estetica`). Toda diferença entre
áreas fica em `src/lib/areas.ts` (nome, caminho público, segmentos, profissões, conselhos, módulos ligados).
Dentro do app a marca vem do consultório ativo; as páginas públicas têm prefixo: `/estetica`, `/estetica/cadastro`,
`/estetica/login`. Visual: o tema atual (Salutti 2.0); o nome muda para "Salutti Estética". Identidade própria depois.

**Foco:** profissional autônoma (primeira usuária: farmacêutica esteta, CRF-MT, atende por WhatsApp; faz toxina,
limpeza de pele, antes/depois). Clínica também funciona, mas é segunda prioridade.

**Vocabulário:** "paciente" (como a própria profissional usa), "procedimento", "atendimento/sessão", "prontuário".

## Módulos da área estética

| Módulo | Onde | O que faz |
|---|---|---|
| Procedimentos | `/app/procedimentos` | Catálogo: nome, categoria (facial, injetável, corporal, capilar, outro), duração, valor, intervalo de retorno, termo de consentimento próprio, kit de insumos (produto + quantidade). |
| Estoque | `/app/estoque` | Produtos (insumo x revenda; unidade U, mL, seringa, frasco, un, g; registro ANVISA; fornecedor; custo; estoque mínimo; validade após aberto em horas). Entrada por lote e validade; saldo por lote; alertas (mínimo, vencendo em 30 dias, vencido, frasco aberto vencido); ajuste, perda (vencido, sobra de frasco, quebra) e venda; histórico; rastreabilidade "quem recebeu o lote X". |
| Registro do atendimento | `/app/agenda/[id]` | Procedimento realizado + insumos/lotes/quantidades usados → baixa automática (FEFO sugerido) ligada à paciente e à sessão; custo de insumo e margem do atendimento; retorno sugerido. |
| Fotos clínicas | ficha da paciente | Antes/durante/depois por procedimento e região, com autorização de uso clínico e **autorização separada** para divulgação (`allowMarketing`). |
| Convênios/TISS | — | Desligado (procedimento estético não é coberto por convênio). |

Núcleo do estoque em `src/lib/stock.ts` (`receiveLot`, `recordUse` com FEFO e validade após aberto,
`adjustLot`, `reverseUse`, `stockAlerts`, `lotStatus`, `openExpiresAt`). Erros: `StockError` com chave em `stock.errors.*`.

Garantias:
- Baixa atômica (`updateMany` com `quantity >= take`): duas baixas simultâneas no mesmo lote não se sobrescrevem.
- `Appointment.procedureRecordedAt` é marcado dentro da transação do registro: clique duplo não baixa duas vezes.
- Estorno (lançamento errado) devolve o saldo líquido a cada lote com motivo, grava movimentos `estorno` e libera
  a sessão para novo registro; nada do histórico é apagado. `StockMovement.product` é `Restrict` (produto se desativa).
- Validade vale o dia inteiro (compara o dia em São Paulo): "válido até 31/10" pode ser usado no dia 31.
- Venda de lote vencido é recusada; perda de vencido é o descarte.
- Ficha técnica opcional na sessão (`procedureDetails`: diluição, unidades por região) e intercorrência.
- Fotos clínicas: remoção lógica com motivo (`removedAt`); autorização de divulgação revogável
  (`marketingRevokedAt`); um consentimento vigente por finalidade e paciente. Só a LGPD apaga de vez.
- Rotas de módulo desligado dão 404 (`requireModule` em `src/lib/modules.ts`), inclusive Convênios na Estética.

## Regras e referências

- Rastreabilidade de insumos: produto, lote, validade e quantidade aplicada ligados à paciente (RDC ANVISA 63/2011,
  roteiro de inspeção de estética da ANVISA). Fiscalização encontra produtos sem registro e vencidos.
- Validade após reconstituição varia por marca (bulas): Botox até 72 h (2–8 °C), Dysport 24 h, Prosigne 4 h.
- Farmacêutico esteta: Resoluções CFF 616/2015 e 645/2017 (toxina, preenchedores absorvíveis, fios absorvíveis,
  microagulhamento, mesoterapia; pós lato sensu). Há sentença de 06/12/2025 contra elas, sem eficácia imediata
  segundo o CFF: não travar nada no sistema por profissão, só registrar.
- Publicidade (Res. CFF 658/2018): sem promessa de resultado; exposição de paciente só com consentimento expresso.
- Fotos clínicas são dado de saúde (LGPD art. 11): uso em divulgação exige consentimento específico e separado.
- Intervalos típicos de retorno: toxina ~120 dias (retoque ~15), bioestimulador 30–60 dias entre sessões,
  skinbooster 14–28 dias entre sessões.

Concorrentes (pesquisa 2026-10): Belle, Clinicorp, Feegow, Simples Agenda (agenda, financeiro, WhatsApp, estoque de
entrada/saída) e, de fora, Pabau, Aesthetic Record, Zenoti (lote ligado à paciente com baixa automática, unidades
fracionadas, custo por procedimento). O diferencial da Salutti Estética é a rastreabilidade com baixa automática.
