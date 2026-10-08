# Acesso de suporte à conta do cliente

Permite que a equipe Salutti entre na conta de um consultório para investigar um problema (ex.: um chamado do botão de
suporte), sem conhecer a senha de ninguém e sem ver conteúdo clínico.

## Como usar

1. No backoffice, abra o cliente (Clientes, Usuários → "Acessar conta" ou, no chamado, "Acessar a conta para investigar").
2. No cartão **Acessar conta**, escreva o motivo (vindo de um chamado, ele já vem preenchido; não cite pacientes), confirme
   com a **sua senha do backoffice** e clique em **Acessar conta**.
3. Aparecem o e-mail `suporte_salutti@salutti.com` e uma **senha aleatória**, mostrada só dessa vez, com contagem regressiva.
4. Entre no **login normal do app** (de preferência numa janela anônima) com esses dados.
5. No app, uma faixa mostra "Acesso de suporte à conta X: somente leitura, sem conteúdo clínico. Termina às HH:MM" e o
   botão **Encerrar acesso**.

## Regras

- **Um usuário oculto** "Suporte Salutti", sem `Membership`: não aparece em equipe, contagens, limites nem aniversários, e
  nunca vira membro (convite recusado, login com Google recusado). Ele "está" em todas as contas só por concessão.
- **Concessão** (`SupportAccessGrant`): um consultório, **um login** (uso único) e **15 minutos** a partir da geração. A
  sessão termina junto com a concessão. Gerar outra revoga a anterior; **Revogar agora** derruba a sessão na próxima requisição.
- **Somente leitura**: com a sessão de suporte, o cliente do banco (`src/lib/db.ts`) recusa qualquer gravação, venha de onde
  vier. Exceções: a própria concessão e a auditoria do consultório.
- **Sem conteúdo clínico**: o papel virtual `support` está fora de `CLINICAL_ROLES` (prontuário, evolução, anamnese, humor,
  fotos clínicas, procedimentos realizados e termos da Estética). Também ficam fora: observações livres da sessão e do
  paciente, consentimentos de procedimento e de foto, a tela LGPD (auditoria e consentimentos), o XML do TISS, a
  exportação LGPD e as imagens (`/api/media`). **O que aparece**: agenda, cadastro (nome, contatos) e financeiro dos pacientes.
- **Nada sai do sistema**: Google Agenda/Meet, WhatsApp, NFS-e, Receita Saúde e Stripe recusam a sessão de suporte antes de enviar.
- **Só em produção**: deploys de preview recusam a senha do suporte (eles dividem o banco com produção).
- A senha é aleatória (20 caracteres) e guardada só como SHA-256, como os convites.
- **Só administradores** do backoffice geram acesso, confirmando a própria senha na hora; motivo obrigatório (10 a 200
  caracteres). Senha errada fica na Auditoria (`support.grant.denied`).
- **Termos e Política de Privacidade** descrevem o acesso (versão legal 2026-10-08: quem já tem conta vê o aviso de reaceite).
- **Transparência**: início e fim ficam no `AuditLog` do consultório (`support.access.start` / `support.access.end`, tela LGPD);
  dono e administradores veem no painel "A equipe Salutti acessou sua conta" com data e motivo (últimos 30 dias). No
  backoffice, `support.grant.create` / `support.grant.revoke` ficam na Auditoria e o histórico aparece no cartão.

## Código

`src/lib/support-access.ts` (concessões), `src/lib/auth.ts` (sessão e contexto do suporte), `src/lib/db.ts` (trava de
somente leitura), `src/app/(auth)/login/login-screen.tsx` (login), `src/app/(auth)/logout/route.ts` (encerrar),
`src/app/backoffice/_components/support-access-card.tsx` e `src/app/backoffice/(painel)/clientes/[id]/page.tsx` (backoffice),
`src/app/app/_components/support/support-access.tsx` (faixa e aviso). Testes: `tests/unit/support-access.test.ts` e o terceiro
teste de `tests/e2e/backoffice.spec.ts`.

## Ficou para depois

- O e-mail `suporte_salutti@salutti.com` foi escolhido pelo dono. Nenhum fluxo manda e-mail para ele hoje (sem
  "esqueci a senha"; convite e Google recusados), mas se o domínio `salutti.com` não for da Salutti, troque antes de criar
  qualquer fluxo por e-mail.
- Levar direto à tela do chamado após o login; contar os 15 minutos a partir do login (ou "+15 min" com novo motivo).
- Mensagem amigável quando uma gravação é recusada (hoje aparece a página de erro; a faixa explica o motivo).
- Aviso ao dono por e-mail no início do acesso (não há serviço de e-mail).
- Limite de tentativas no login (a senha tem ~115 bits; o limite evita só abuso).
- 2FA obrigatório no backoffice para gerar acesso.
- Consentimento prévio do dono (hoje ele é avisado depois, com o motivo).
- Acesso com gravação (ex.: corrigir um dado a pedido do cliente) exigiria consentimento explícito e registro por alteração.
