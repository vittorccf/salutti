import type { Metadata } from "next";
import Link from "next/link";
import { EntityInfo, LegalPage, List, Section } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/contact";
import { PRIVACY_PATH } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Termos de Uso · Salutti",
  description: "Regras de uso da plataforma Salutti para profissionais de saúde mental, de estética e clínicas.",
};

// Página pública exigida pelo Google (tela de consentimento OAuth) e ligada ao cadastro. Ao mudar algo relevante,
// atualize LEGAL_VERSION em src/lib/legal.ts.
export default function TermsPage() {
  const privacy = (
    <Link href={PRIVACY_PATH} className="text-brand underline-offset-4 hover:underline">
      Política de Privacidade
    </Link>
  );
  return (
    <LegalPage title="Termos de Uso">
      <p>
        Estes termos regem o uso da Salutti, plataforma on-line de gestão para profissionais de saúde mental, de
        estética (Salutti Estética) e clínicas. Ao criar uma conta ou usar a plataforma, você declara que leu e aceita
        estes termos e a {privacy}. Se não concordar, não use a plataforma.
      </p>
      <EntityInfo />

      <Section id="servico" title="1. O serviço">
        <p>
          A Salutti oferece agenda, cadastro de pacientes, prontuário, anamnese, financeiro, cobranças, procedimentos,
          estoque, fotos clínicas, assistente com inteligência artificial (Saluttin), integrações (como Google Agenda e
          Meet) e outros recursos que podem mudar com o tempo. A plataforma é uma ferramenta de apoio à gestão: não
          presta serviço de saúde e não substitui o julgamento técnico do profissional.
        </p>
      </Section>

      <Section id="conta" title="2. Cadastro e conta">
        <List>
          <li>A conta é para maiores de 18 anos. Você deve informar dados verdadeiros e mantê-los atualizados.</li>
          <li>Você é responsável pelo sigilo da senha e por tudo o que for feito com a sua conta. Recomendamos ativar a verificação em duas etapas.</li>
          <li>O dono da conta (ou o administrador da clínica) decide quem entra na equipe e com qual papel, e responde pelos acessos que concede.</li>
          <li>Avise-nos imediatamente em caso de suspeita de acesso indevido: {SUPPORT_EMAIL}.</li>
        </List>
      </Section>

      <Section id="planos" title="3. Teste grátis, planos e pagamento">
        <List>
          <li>Novas contas têm um período de teste grátis, sem cartão. Ao fim do teste, para continuar usando, é preciso assinar um plano.</li>
          <li>Os planos, preços e periodicidade aparecem na plataforma antes da contratação. A cobrança é recorrente e processada pela Stripe.</li>
          <li>Quando a contratação for uma relação de consumo, você pode desistir em até 7 dias da primeira cobrança e receber o valor de volta (direito de arrependimento, art. 49 do Código de Defesa do Consumidor).</li>
          <li>Fora desse prazo, você pode cancelar a assinatura quando quiser; o acesso segue até o fim do período já pago, e valores de períodos iniciados não são reembolsados, salvo quando a lei exigir.</li>
          <li>Reajustes de preço serão avisados com antecedência mínima de 30 dias.</li>
        </List>
      </Section>

      <Section id="profissional" title="4. Responsabilidades do profissional e da clínica">
        <List>
          <li>Exercer a profissão dentro das competências e normas do seu conselho de classe (por exemplo, CFP, CFF, CFBM, COFEN, CFO, CFM) e da ANVISA, quando aplicável.</li>
          <li>Manter o sigilo profissional e garantir que as pessoas da equipe a quem você der acesso também o respeitem.</li>
          <li>Ter base legal para registrar dados de pacientes, colher os consentimentos e autorizações necessários (inclusive para uso de imagem e para atendimento on-line) e informar os pacientes sobre o tratamento dos dados, como controlador perante a LGPD.</li>
          <li>Guardar prontuários pelo prazo exigido pelas normas da sua profissão, inclusive exportando os dados antes de encerrar a conta.</li>
          <li>Revisar o conteúdo gerado pelo Saluttin antes de usá-lo: sugestões e resumos automáticos podem conter erros e não são diagnóstico.</li>
          <li>Na estética: usar apenas insumos regularizados na ANVISA e conferir lote e validade. O controle de estoque, a ordem de uso por validade e os alertas da plataforma são apoio e não substituem essa conferência.</li>
          <li>Revisar e adaptar os modelos de anamnese e de termo de consentimento oferecidos pela plataforma: eles são ponto de partida e precisam seguir as normas do seu conselho.</li>
          <li>Responder pelo conteúdo que inserir na plataforma e pelas cobranças que emitir aos pacientes.</li>
        </List>
      </Section>

      <Section id="proibido" title="5. Uso proibido">
        <List>
          <li>Inserir dados de pessoas sem base legal ou usar a plataforma para fins ilícitos, discriminatórios ou de assédio.</li>
          <li>Tentar acessar dados de outras contas, testar vulnerabilidades sem autorização, sobrecarregar o serviço ou contornar limites técnicos.</li>
          <li>Copiar, revender ou fazer engenharia reversa da plataforma, ou usá-la para criar um produto concorrente.</li>
          <li>Publicar fotos de pacientes sem a autorização de divulgação registrada, ou em desacordo com as regras de publicidade do seu conselho (por exemplo, Resolução CFO 196/2019 e Resolução CFM 2.336/2023), ou prometer resultados.</li>
        </List>
        <p>O descumprimento pode levar à suspensão ou ao encerramento da conta, com aviso prévio sempre que possível.</p>
      </Section>

      <Section id="integracoes" title="6. Integrações de terceiros">
        <p>
          Recursos como Google Agenda, Google Meet e meios de pagamento dependem de serviços de terceiros, com
          termos e políticas próprios. A Salutti não responde por indisponibilidades ou mudanças desses serviços, mas
          avisará quando um recurso for afetado. O uso de dados do Google segue a seção 5 da {privacy}.
        </p>
      </Section>

      <Section id="dados" title="7. Seus dados e de seus pacientes">
        <p>
          Os dados que você registra continuam sendo seus (ou da sua clínica). A Salutti os trata apenas para prestar o
          serviço, conforme a {privacy}. Você pode exportá-los a qualquer momento pelas ferramentas da plataforma ou
          pedindo ao suporte.
        </p>
      </Section>

      <Section id="propriedade" title="8. Propriedade intelectual">
        <p>
          A marca Salutti, o software, o design e os conteúdos da plataforma (como modelos de anamnese) pertencem à
          Salutti ou a seus licenciantes. Você recebe uma licença pessoal, não exclusiva e intransferível para usá-los
          enquanto a conta estiver ativa.
        </p>
      </Section>

      <Section id="disponibilidade" title="9. Disponibilidade e suporte">
        <p>
          Trabalhamos para manter a plataforma disponível e segura, com cópias de segurança do banco de dados, mas
          podem ocorrer interrupções para manutenção ou por falhas de terceiros. O suporte é feito pelo botão de ajuda
          dentro da plataforma ou pelo e-mail{" "}
          <a href={supportMailto()} className="text-brand underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a>.
        </p>
      </Section>

      <Section id="responsabilidade" title="10. Limitação de responsabilidade">
        <p>
          Na extensão permitida pela lei, a Salutti não responde por decisões clínicas, por conteúdo inserido pelos
          usuários, por perdas causadas por uso indevido da conta ou por lucros cessantes. Nada nestes termos limita
          direitos garantidos pelo Código de Defesa do Consumidor, quando aplicável.
        </p>
      </Section>

      <Section id="encerramento" title="11. Encerramento da conta">
        <p>
          Você pode pedir o encerramento da conta a qualquer momento pelo suporte. Antes da eliminação, oferecemos a
          exportação dos dados. Guardaremos apenas o que a lei exigir, pelos prazos da {privacy}.
        </p>
      </Section>

      <Section id="mudancas" title="12. Mudanças nestes termos">
        <p>
          Podemos atualizar estes termos. A data e a versão ficam no topo da página; mudanças relevantes serão avisadas
          dentro da plataforma ou por e-mail antes de valerem. Continuar usando a plataforma depois disso significa
          aceitar a nova versão.
        </p>
      </Section>

      <Section id="lei" title="13. Lei aplicável e foro">
        <p>
          Estes termos seguem as leis do Brasil. Fica eleito o foro do domicílio do usuário para resolver qualquer
          questão relacionada a eles.
        </p>
      </Section>

      <Section id="contato" title="14. Contato">
        <p>
          Dúvidas sobre estes termos:{" "}
          <a href={supportMailto("Termos de Uso")} className="text-brand underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
