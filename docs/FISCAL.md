# Fiscal

Impostos e documentos do consultório (`/app/fiscal`, permissão `fiscal.ver`).

- **Regras puras:** `src/lib/tax.ts`, testadas em `tests/unit/tax.test.ts`.
- **Dados do mês:** `src/app/app/fiscal/_data.ts`, por data de pagamento no fuso de São Paulo:
  - rendimentos: cobranças pagas;
  - livro-caixa: pagamentos de despesas dedutíveis, desde janeiro (o excedente de um mês passa para os seguintes do mesmo ano, via `livroCaixa()` de `payables.ts`);
  - INSS: pagamentos da categoria INSS individual;
  - folha: grupo "pessoal".

## Perfil fiscal (Workspace)

Quem administra as finanças (`financeiro.pagar`) define:

- **Regime** (`taxRegime`):
  - `pf`: profissional pessoa física, com carnê-leão e Receita Saúde (esta não vale para a área de estética);
  - `simples`: Simples Nacional;
  - `presumido`: lucro presumido.
  - Na migration, consultório que já tinha CNPJ começa em `simples`, para continuar emitindo NFS-e.
- **CPF do titular** (`taxCpf`): vai no recibo e no CSV.
- **Ocupação do Carnê-Leão Web** (`taxOccupation`): 255 = psicólogo, sugerido na área de saúde mental.
- **Dependentes** (`taxDependents`): R$ 189,59 por mês cada.

## Carnê-leão (`/app/fiscal/carne-leao?mes=AAAA-MM`)

- **Fórmulas:**
  - tabela progressiva mensal 2026 (Lei 15.191/2025);
  - o livro-caixa (despesas de custeio, Lei 9.250, art. 4º, I) deduz sempre, limitado ao rendimento;
  - sobre o que sobra, INSS + dependentes + pensão × desconto simplificado de R$ 607,20: vale o maior;
  - redutor da Lei 15.270/2025 sobre o rendimento tributável: até R$ 5.000 reduz até R$ 312,89; de R$ 5.000,01 a R$ 7.350, R$ 978,62 − 0,133145 × rendimento.
- **DARF 0190:** vence no último dia útil do mês seguinte (feriados bancários de `payables.ts`). Abaixo de R$ 10 acumula.
- **Natureza:** é estimativa, com aviso no topo da tela. A apuração oficial é a do Carnê-Leão Web. Rendimentos de PJ ou convênio (com IRRF) não entram.
- **Consultório com vários profissionais:** o carnê-leão é individual; a tela avisa que tudo vai no CPF do titular do perfil fiscal.

## Receita Saúde e CSV do Carnê-Leão Web (`/app/fiscal/exportar?mes=` ou `?ano=`)

- **Quem baixa:** só quem administra as finanças (`financeiro.pagar`), fora de sessão de suporte. A rota devolve 400 sem regime `pf`, sem CPF válido do titular ou sem ocupação.

- **Sem API:** a Receita não oferece integração direta. O recibo nasce "A enviar" (`receitaSaudeStatus = queued`) e o CSV leva o indicador "S", que gera os recibos ao importar.
- **Formato do CSV:** importação em Escrituração > Importar, 16 campos com ";":
  - data DD/MM/AAAA, código R01.001.001, ocupação;
  - valor sem milhar ("1250,50");
  - descrição, quem pagou e CPF do pagador;
  - CPF do beneficiário (campo 9) quando quem paga é o responsável (`Patient.responsibleCpf`, paciente menor);
  - indicador "S" e CPF do titular.
- **Pendências:** linha sem CPF válido (com dígitos verificadores) do pagador ou do beneficiário fica de fora e aparece como pendência.
- **Estética:** sem indicador "S" (procedimento estético não é despesa médica dedutível); o recibo não nasce "a enviar".
- **Situação dos recibos:** baixar o arquivo não muda nada (GET sem efeito). Depois de importar, o botão "Já importei" (`markExportedAction`, POST, `financeiro.pagar`) passa os recibos "A enviar" do mês para "Exportado (CSV)". Os já exportados ficam fora dos próximos arquivos (`&todos=1` inclui de novo).

## Recibo e informe

- **Recibo** (`/impressao/recibo/<id>`): atende a Lei 9.250/95, art. 8º, § 2º, III:
  - quem recebeu: com CNPJ, o consultório (e o profissional como responsável); sem CNPJ, o profissional com o CPF do perfil; conselho e endereço;
  - paciente e pagador;
  - valor em número e por extenso;
  - serviço, data e assinatura.
- **Informe anual ao paciente** (`/impressao/informe/<pacienteId>?ano=`): valores pagos mês a mês e o total, para a declaração. O atalho fica na ficha do paciente, só para `financeiro.pagar`.
- **Auditoria:** cada impressão de recibo e de informe fica no log (`fiscal.receipt.print`, `fiscal.yearReport.print`).
- **Por regime:**
  - pessoa física: só o recibo;
  - NFS-e: só para regime de empresa (Simples ou presumido).
- **NFS-e:** segue simulada; falta a integração com o emissor nacional (certificado e-CNPJ).

## Agenda fiscal

Obrigações do mês por regime (`obligationsFor`):

- **Pessoa física:**
  - carnê-leão;
  - recibos da Receita Saúde do mês, escriturados antes de gerar o DARF;
  - INSS individual (GPS) no dia 15, prorrogando para o dia útil seguinte.
- **Empresa:**
  - DAS no dia 20 (Simples), prorrogando para o dia útil seguinte;
  - DMED até o último dia útil de fevereiro.

## Fator R (`/app/fiscal/fator-r`)

- **Cálculo:** folha ÷ receita nos 12 meses. Com 28% ou mais, serviços de saúde vão para o Anexo III; abaixo, Anexo V.
- **Na tela:** mostra quanto falta de folha para chegar a 28%.

## Pendências

- NFS-e real no emissor nacional.
- Rendimentos recebidos de PJ ou convênio (com IRRF), que não entram no carnê-leão.
- Reembolsos.
- Identidade fiscal por profissional (CPF, ocupação e apuração separados) em consultório com vários profissionais.
- Conferir o layout do CSV e o código de ocupação da odontologia no manual oficial do Carnê-Leão Web.
- Repasse ao profissional.
