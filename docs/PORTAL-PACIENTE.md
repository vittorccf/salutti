# Portal do paciente

Área do paciente entre as sessões (`/portal`), pensada primeiro para o celular, e o lado do profissional (`/app/portal` e `/app/pacientes/<id>/portal`).

## Acesso (custo zero, sem e-mail nem SMS)

Pesquisa (out/2026):
- **CPF sozinho:** inseguro. CPF é dado semipúblico, e 223 milhões vazaram com telefone e endereço.
- **CPF + data de nascimento:** fraco. A data de nascimento estava nos mesmos vazamentos.
- **OTP por SMS:** cerca de US$ 0,06 por mensagem.
- **OTP por WhatsApp:** cerca de US$ 0,007 por mensagem, mas exige conta Business verificada.
- **Link mágico por e-mail:** depende de serviço de e-mail, que ainda não existe.

A combinação de melhor custo-benefício sem esses serviços é a seguinte:

1. **Convite de uso único:**
   - O profissional gera o convite na tela do portal do paciente e o envia pelo próprio WhatsApp (botões de copiar e de abrir o WhatsApp).
   - O link vale 72 horas. O banco guarda só o hash (SHA-256), e o link aparece uma única vez.
   - O convite **exige data de nascimento ou CPF no cadastro**: é o que o paciente confirma ao abrir o link. Sem isso, quem tivesse o link escolheria o login.
2. **Ativação:** o paciente abre o link e:
   - confirma a **data de nascimento**;
   - informa o **CPF**, que precisa conferir com o cadastro quando houver;
   - cria a **senha** e aceita o aviso de sigilo, de que as respostas não são imediatas e de que o portal não é canal de emergência.

   Sem CPF no cadastro, o CPF informado vira **só o login**: não entra no cadastro clínico. O profissional vê "CPF informado pelo paciente" e confere antes de usar em recibos.

   O convite é consumido de forma atômica: dois envios simultâneos não o usam duas vezes.
3. **Login:** depois, entra em `/portal/entrar` com **CPF + senha**.
4. **Esqueceu a senha:** o profissional gera um novo convite ("link para nova senha"), que cria a senha nova e derruba as sessões abertas.

Regras (`src/lib/portal-auth.ts`, NIST SP 800-63B):
- **Senha:**
  - de 8 a 128 caracteres, sem regras de composição;
  - recusa senhas óbvias e sequências;
  - recusa o próprio CPF ou a data de nascimento.
- **Limite de tentativas** (`PortalThrottle`, janela de 15 minutos):
  - **CPF + IP:** 5 tentativas. Quem está fora da rede do paciente não consegue bloqueá-lo.
  - **IP:** 30 tentativas, contra varredura de vários CPFs.
  - **Ativação e troca de senha:** 5 tentativas por acesso.
  - O contador é atômico e conta também para CPF inexistente. A resposta é sempre genérica ("CPF ou senha incorretos" ou "Muitas tentativas"), então não revela quem é paciente.
  - Gerar um convite novo zera as tentativas da ativação.
- **Sessão:**
  - cookie próprio `salutti_portal` (httpOnly, SameSite=Lax, `path=/portal`), 30 dias;
  - JWT com **audiência própria**. A sessão do app recusa tokens com audiência ou sem usuário, então o token do portal nunca vale no app;
  - `sessionVersion` sobe na troca de senha, no uso de convite e na revogação, o que derruba as sessões antigas.
- **Revogar:**
  - apaga a senha e o login e derruba as sessões;
  - para voltar, o paciente usa um convite novo, e a senha antiga não volta a valer.
- **Links antigos** (`/portal/<token>`, de antes da senha):
  - mostram só um aviso ("este link mudou") e não abrem o portal nem criam senha;
  - a caixa de entrada lista os pacientes que ainda precisam de convite novo.

Evolução prevista:
- Resend (grátis até 3.000 e-mails por mês) para link mágico, recuperação de senha e aviso de mensagem nova.
- OTP por WhatsApp quando houver volume.
- Passkey dentro do PWA.

## Paciente (`src/app/portal/(area)`)

Navegação inferior com três abas: Semana, Mensagens e Conta.

- **Semana:**
  - **Próxima sessão:** data e hora, profissional e modalidade.
  - **Entrar na sessão:** o botão aparece de 15 minutos antes até o fim (`canJoin`), e só aceita links http/https.
  - **Adicionar à agenda:** gera um `.ics` sem dado clínico.
  - **Confirmar presença ou pedir remarcação:** o pedido pode levar um recado.
  - **Check-in de 30 segundos:**
    - humor de 1 a 5 em botões grandes; ansiedade, sono e nota são opcionais;
    - deixa claro que os registros não são lidos na hora;
    - com humor baixo (1 ou 2), a confirmação traz o CVV e o SAMU.
  - **Destaques da semana publicados pelo profissional:**
    - tarefas: o paciente marca como feita e comenta, em tom neutro, sem cobrança;
    - lembretes;
    - materiais (links só http/https).
  - Próximas sessões e pagamentos em aberto, com link de pagamento.
- **Mensagens:**
  - Conversa com o consultório, com aviso fixo de que não é canal de emergência (CVV 188, SAMU 192, 190).
  - O prazo de resposta aparece junto do campo de escrever.
  - Atualiza sozinha a cada 20 segundos enquanto está aberta.
  - Limite de 20 mensagens por hora.
  - O paciente não vê "lida", para não confundir leitura com resposta.
  - O profissional pode desligar as mensagens daquele paciente.
- **Conta:** recibos, como instalar o portal como app, troca de senha (derruba as sessões em outros aparelhos) e sair.

## Profissional

Mensagens e tarefas são conteúdo clínico: só **dono, administrador e profissional** veem (`requireClinicalContext`).

Na **clínica**, o profissional vê só os pacientes que atende (`portalPatientScope`, pelo e-mail do cadastro profissional). Isso vale na caixa de entrada, no contador do menu, nas conversas e nas ações.

- **Menu "Portal do paciente"** (`/app/portal`), com contador de pendências (mensagens não lidas e pedidos de remarcação). Mostra:
  - os pacientes com link antigo que precisam de convite novo;
  - os pedidos de remarcação, com o botão "marcar como tratado";
  - as conversas, com as não lidas primeiro;
  - o **aviso de resposta**, editável pelo dono ou administrador.
- **Portal de cada paciente** (`/app/pacientes/<id>/portal`):
  - conversa e resposta;
  - publicação de destaques;
  - acesso: convite ou link para nova senha, com o login do paciente, liga/desliga das mensagens e revogação (pede confirmação);
  - próximas sessões com a resposta do paciente e check-ins dos últimos 30 dias.
- **Agenda:** a sessão mostra se o paciente confirmou ou pediu remarcação. O recado só aparece para os papéis clínicos.

## Dados e LGPD

- **Modelos:**
  - `PatientPortalAccess`: login, convite, versão de sessão e mensagens ligadas.
  - `PortalThrottle`.
  - `PortalMessage`.
  - `PortalHighlight`.
  - `Appointment.patientResponse*`.
  - `Workspace.portalMessageNotice`.
- **Exportação LGPD:** inclui mensagens, destaques e o acesso, sem o hash da senha.
- **Exclusão:** remove o acesso ao portal (CPF e senha). As mensagens ficam como registro do atendimento, como as evoluções.
- **Anonimização:** apaga também as mensagens, os comentários de tarefa e os recados de remarcação, porque são texto livre que pode identificar a pessoa.

## Testes

- `tests/unit/portal.test.ts`: CPF, política de senha, convite, janela do botão de entrar, links e `.ics`.
- `tests/e2e/portal.spec.ts`: o fluxo inteiro.
  - **Convite e ativação:**
    - convite bloqueado sem data de nascimento;
    - ativação com data errada, CPF inválido e senha óbvia recusados.
  - **Lado do paciente:**
    - semana, remarcação, tarefa, check-in e mensagens;
    - resposta do profissional;
    - login com senha errada, com CPF inexistente (mesma resposta) e com a senha certa;
    - bloqueio na sexta tentativa errada.
  - **Segurança e revogação:**
    - token do portal recusado como sessão do app;
    - link antigo;
    - convite reutilizado;
    - revogação.

## Ficou para depois (revisão dos agentes)

- Aviso de mensagem nova para o paciente e para o profissional (push no PWA ou e-mail): sem ele, a conversa tende a voltar para o WhatsApp.
- Alerta opcional, por paciente, quando o humor fica baixo vários dias seguidos.
- Botão "copiar para a evolução" nas mensagens e no check-in.
- Horário de silêncio.
- Modelos prontos de tarefas e de psicoeducação.
- Seletor de consultório quando o mesmo CPF tem acesso em mais de um (hoje entra no mais usado).
- Responsável por menor de idade.
- Data de nascimento em três campos (dia, mês e ano) para Android antigo.
