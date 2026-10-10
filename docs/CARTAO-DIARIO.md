# Cartão diário

Módulo `cartao_diario` (src/lib/areas.ts): ligado por padrão na área de saúde mental. As regras ficam em `src/lib/diary.ts`.
O cartão não é ferramenta de diagnóstico nem de monitoramento em tempo real.

## Profissional: `/app/pacientes/<id>/cartao`

Acesso só de papel clínico, com o paciente no escopo de quem vê.

- **Personalizar por paciente:**
  - modelos Básico, Ansiedade (GAD-7), Humor (PHQ-9) e Bem-estar (WHO-5);
  - itens ansiedade, sono, energia, medicação, emoções, atividades e nota (o humor é sempre pedido);
  - até 5 perguntas próprias: escala 0 a 10, sim/não, número ou texto curto;
  - escalas de rastreio a cada 7, 14 ou 28 dias.
- **Ligar o PHQ-9** exige que o profissional confirme uma vez que avaliará os alertas conforme o próprio protocolo de risco (`riskProtocolAckAt`).
- **Editar uma pergunta própria** (rótulo ou tipo) cria outra: a antiga fica arquivada e as respostas antigas continuam no relatório e no CSV (`mergeQuestions`).
- **Relatório:**
  - resumo do período (30 ou 90 dias);
  - gráfico do humor com média móvel de 7 dias e ansiedade;
  - humor em pixels nas últimas 12 semanas, com linhas por dia da semana;
  - padrões:
    - sono × humor, com pelo menos 14 pares, mostrando n e r e dizendo "tendência";
    - humor com e sem cada atividade, com pelo menos 5 dias de cada lado;
    - emoções mais frequentes;
  - escalas com escore e faixa;
  - respostas às perguntas próprias e notas do paciente.
- **Exportar:**
  - CSV traduzido (`/cartao/csv`), registrado na auditoria;
  - Imprimir/PDF, com rodapé "autorrelato, não é documento psicológico" (Res. CFP 06/2019).

## Paciente: portal (`/portal`)

- **Aceite antes do primeiro registro:**
  - explica a finalidade, quem vê, que ninguém acompanha em tempo real e que os registros podem fazer parte do prontuário;
  - mostra os contatos de crise;
  - a versão do texto vai para a auditoria.
- **Check-in do dia:** só com os itens ligados. Desligar um item não apaga o que já foi gravado no dia.
- **Escala que vence:** aparece abaixo do check-in. Um envio duplicado vira uma resposta só (trava por paciente e escala).
- **PHQ-9 item 9 acima de zero:** o paciente vai para a tela de apoio, que pede para ligar 192 se estiver em perigo, mostra o CVV 188 e a UPA, e explica que não é imediato. O profissional recebe o alerta.
- **Sem pressão:** nada de sequência nem de "perdeu o dia"; o portal mostra só "você registrou N dias este mês".
- **Parar de usar:** o consentimento é revogável. Os registros feitos ficam com o profissional.

## Alerta de risco

- **Onde aparece:**
  - numa faixa no topo de todas as telas do app, para quem é clínico e vê o paciente (`src/lib/diary-alerts.ts`);
  - no topo do cartão do paciente.
- **Quando some:** quando alguém registra a conduta, com nota opcional. A conduta guarda quem registrou, a data e a nota.
- **Paciente arquivado:** não entra na contagem.

## Instrumentos

- **Origem:**
  - PHQ-9 e GAD-7: Spitzer, Williams, Kroenke e colegas, de uso livre;
  - WHO-5: Psychiatric Centre North Zealand e OMS.
- **Faixas:**
  - PHQ-9: 0-4, 5-9, 10-14, 15-19, 20-27;
  - GAD-7: 0-4, 5-9, 10-14, 15-21;
  - WHO-5: 0-100, com 28 ou menos como muito baixo e 50 ou menos como baixo.
- **Natureza:** são escalas de rastreio, não testes do SATEPSI.
- **Traduções:**
  - o pt-BR segue as versões publicadas;
  - en é o original;
  - es segue as versões em espanhol.

## Pendências

- Avisar por e-mail, sem conteúdo clínico, quando houver alerta de risco. Depende de um provedor de e-mail, que o app ainda não tem.
- Modelos DBT (impulsos 0 a 5, agiu ou não, habilidades) e registro de pensamentos (TCC).
- Modo "rever juntos" na sessão, mostrando o gráfico ao paciente.
