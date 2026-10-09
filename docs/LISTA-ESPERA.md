# Lista de espera

Módulo `lista_espera` (src/lib/areas.ts): ligado por padrão nas duas áreas. O backoffice pode tirá-lo de um cliente em "Liberações".
Serve para quem ainda não tem horário para todos os interessados, inclusive o profissional recém-formado que já junta uma fila.

## Telas

- `/app/lista-espera` (permissão `pacientes.gerenciar`):
  - métricas sobre a lista inteira: aguardando, espera média e mediana até agendar, % que virou paciente;
  - abas Aguardando / Agendados / Encerrados / Todos, filtradas no banco;
  - "Abriu uma vaga?": filtra por dia, turno e modalidade (`matchesSlot`);
  - em cada pessoa:
    - WhatsApp com mensagem discreta: nome de quem atende, sem citar psicoterapia (o celular pode ser compartilhado); para menor, fala com o responsável;
    - registrar contato (mostra a data do último);
    - virar paciente, mudar a situação, editar e apagar.
  - Depois de 30 dias de espera, a pessoa ganha a sugestão "Enviar alternativas pelo WhatsApp" (UBS/CAPS, clínica-escola, CVV).
- Menu: contador vermelho de inscrições urgentes que ainda aguardam contato.
- `/espera/<endereço>` (sem login): formulário que o profissional divulga no Instagram ou no site. Mostra quem atende, com profissão e registro no conselho (Código de Ética do psicólogo, art. 20). Dá 404 se o formulário estiver desligado, se o módulo não estiver liberado ou se não houver ninguém com registro (ou marcado "sem registro").

## Regras

- **Situações:**
  - abertas: aguardando, contatado;
  - agendado;
  - encerradas: desistiu, sem retorno, encaminhado, expirado.
- **Virar paciente:**
  - roda numa transação: a entrada é reservada antes, então dois cliques não criam dois pacientes;
  - o limite de pacientes do contrato é conferido com a linha do consultório travada;
  - cria o cadastro com nome, contato e responsável e abre `/app/agenda/novo?patientId=`;
  - o consentimento do paciente fica pendente, para registrar no cadastro, como num paciente novo sem a caixa marcada.
- **Motivo da procura:** é dado de saúde, com até 280 caracteres. Só papéis clínicos (`canSeeClinical`) veem, editam e gravam. Quem não é clínico salva a edição sem apagar o motivo.
- **Menor de idade:** o nome do responsável é obrigatório; o campo aparece ao marcar "menor". No formulário público, quem preenche declara ser o responsável legal.
- **Formulário público:**
  - pede dados mínimos e um consentimento específico que cita o dado sensível e o prazo de 6 meses (`consentAt`; a versão do texto vai para a auditoria);
  - armadilha anti-robô (campo `website`);
  - até 5 inscrições por IP a cada 15 minutos, contadas antes de validar;
  - até 50 inscrições por consultório em 24 horas;
  - o IP vem de `x-vercel-forwarded-for`/`x-real-ip`.
- **Urgência e crise:**
  - o aviso CVV 188 / SAMU 192 aparece no topo do formulário e de novo ao terminar, se a pessoa marcou a caixa;
  - a caixa diz que a lista não é acompanhada em tempo real;
  - "urgente" destaca a pessoa, mas não lhe dá prioridade automática, para que um robô marcando urgente não empurre os pedidos reais para fora da tela.
- **Retenção (LGPD):**
  - quem está numa situação encerrada ou em "agendado" há mais de 6 meses é anonimizado: sem nome, contato, motivo nem observações;
  - a contagem fica para as métricas, e a auditoria guarda só o id;
  - roda no cron diário da Vercel (`/api/cron/lista-espera`, `vercel.json`, exige `CRON_SECRET`) e ao abrir a página, nunca na sessão de suporte (somente leitura);
  - "Apagar" exclui de vez, para pedido de exclusão.
- **Configurar o formulário público:** só quem tem `equipe.gerenciar` muda o endereço, a previsão e o texto. Para publicar, é preciso um profissional ativo com registro.

## Pendências

- `CRON_SECRET` na Vercel (Production). Sem ele, o cron recusa e a anonimização só roda quando alguém abre a página.
- Aviso por e-mail ou push de inscrição urgente: depende de um provedor de e-mail, que o app ainda não tem.
- Captcha leve (Turnstile), se aparecer spam apesar dos limites.

## Referências

- SimplePractice e Cliniko: preferências e desfechos.
- Jane: oferecer a vaga a quem combina.
- CFP, Código de Ética, arts. 8 e 20, e Resolução 09/2024.
- LGPD, arts. 11 e 14.
