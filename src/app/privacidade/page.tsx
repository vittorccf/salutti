import type { Metadata } from "next";
import Link from "next/link";
import { EntityInfo, LegalPage, List, Section } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/contact";
import { LEGAL_ENTITY, TERMS_PATH } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidade · Salutti",
  description: "Como a Salutti trata dados pessoais de profissionais, clínicas e pacientes, conforme a LGPD.",
};

// Página pública exigida pelo Google (tela de consentimento OAuth) e ligada ao cadastro. Ao mudar algo relevante,
// atualize LEGAL_VERSION em src/lib/legal.ts.
export default function PrivacyPage() {
  const mail = (
    <a href={supportMailto("Privacidade")} className="text-brand underline-offset-4 hover:underline">
      {SUPPORT_EMAIL}
    </a>
  );
  return (
    <LegalPage title="Política de Privacidade">
      <p>
        Esta política explica como a Salutti (plataforma de gestão para profissionais de saúde mental e de estética,
        incluindo a Salutti Estética) trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados
        (Lei 13.709/2018, LGPD). Ela vale para o site, o aplicativo e as integrações oferecidas. O uso da plataforma
        também segue os <Link href={TERMS_PATH} className="text-brand underline-offset-4 hover:underline">Termos de Uso</Link>.
      </p>
      <EntityInfo />

      <Section id="papeis" title="1. Quem decide sobre cada dado">
        <List>
          <li>
            <strong>Dados da sua conta</strong> (profissional, clínica e equipe): a Salutti é a <em>controladora</em>.
          </li>
          <li>
            <strong>Dados de pacientes</strong> que o profissional ou a clínica registra (cadastro, agenda, prontuário,
            anamnese, evolução, fotos clínicas, termos, cobranças): o profissional ou a clínica é o <em>controlador</em>,
            e a Salutti atua como <em>operadora</em>, tratando esses dados apenas para prestar o serviço, conforme as
            instruções de quem os registrou.
          </li>
        </List>
        <p>
          Pacientes que quiserem exercer seus direitos devem procurar primeiro o profissional ou a clínica que os
          atende. A Salutti apoia o controlador nesses pedidos (exportação, correção, anonimização e eliminação estão
          disponíveis dentro da plataforma). Dados que a lei ou as normas profissionais mandam guardar, como prontuário,
          ficha de procedimento e registro do lote de insumo usado em cada paciente, ficam guardados pelo prazo legal
          mesmo após um pedido de eliminação (art. 16, I, da LGPD).
        </p>
      </Section>

      <Section id="dados" title="2. Dados que coletamos">
        <List>
          <li><strong>Cadastro:</strong> nome, e-mail, senha (guardada só como hash), data de aniversário (opcional), foto de perfil (opcional).</li>
          <li><strong>Consultório ou clínica:</strong> nome, tipo de conta, área de atendimento, CNPJ (opcional), banner ou logo, membros da equipe e seus papéis.</li>
          <li><strong>Uso e segurança:</strong> registro de auditoria das ações feitas na plataforma (ação, data e usuário), dados da verificação em duas etapas e o aceite destes documentos (data, versão, endereço IP e navegador).</li>
          <li><strong>Suporte:</strong> mensagens dos chamados abertos pelo botão de ajuda e dados técnicos da tela em que você estava.</li>
          <li><strong>Assinatura:</strong> plano, situação do pagamento e identificadores do processador de pagamentos. Dados de cartão são tratados diretamente pela Stripe e não ficam na Salutti.</li>
          <li><strong>Integração com o Google:</strong> se você conectar sua conta Google, o e-mail dessa conta e uma credencial de acesso (guardada cifrada). Veja a seção 5.</li>
          <li><strong>Dados de pacientes:</strong> os que o profissional registrar, incluindo dados de saúde, que são dados pessoais sensíveis (art. 11 da LGPD).</li>
          <li>
            <strong>Fotos clínicas</strong> (antes, durante e depois) e assinaturas em termos: também são dados sensíveis,
            vistos só por papéis clínicos da equipe. O uso em divulgação exige uma autorização da paciente separada do uso
            clínico, que ela pode revogar a qualquer momento. A Salutti não usa essas imagens para nenhum fim próprio e não
            as envia ao assistente de inteligência artificial.
          </li>
        </List>
      </Section>

      <Section id="finalidades" title="3. Para que usamos e com qual base legal">
        <List>
          <li>Criar e manter sua conta, autenticar o acesso e prestar o serviço contratado (execução de contrato, art. 7º, V).</li>
          <li>Proteger contas e dados, prevenir fraudes e manter registros de acesso (legítimo interesse e obrigação legal, art. 7º, II e IX; Marco Civil da Internet, art. 15).</li>
          <li>Cobrar a assinatura e emitir documentos fiscais (execução de contrato e obrigação legal).</li>
          <li>Responder chamados de suporte e avisar sobre mudanças importantes no serviço (execução de contrato e legítimo interesse).</li>
          <li>Dados de pacientes: tratados somente para as finalidades definidas pelo profissional ou pela clínica, que é responsável por ter a base legal adequada: por exemplo, tutela da saúde (art. 11, II, &ldquo;f&rdquo;), que vale para profissionais de saúde, ou o consentimento específico do paciente, recomendado quando o atendimento não é feito por profissional de saúde (como esteticistas, Lei 13.643/2018).</li>
        </List>
        <p>Não vendemos dados pessoais e não usamos dados de pacientes para publicidade.</p>
      </Section>

      <Section id="compartilhamento" title="4. Com quem compartilhamos">
        <p>Somente com fornecedores necessários para o funcionamento da plataforma, sob contrato e com o mínimo de dados:</p>
        <List>
          <li><strong>Vercel</strong> (hospedagem do aplicativo) e <strong>Neon</strong> (banco de dados PostgreSQL).</li>
          <li><strong>Stripe</strong> (cobrança da assinatura da Salutti).</li>
          <li><strong>Google</strong> (Agenda e Google Meet), apenas para quem conectar a própria conta.</li>
          <li><strong>Zoom</strong> (videochamadas), quando escolhido no agendamento: recebe só um título genérico, a data e a duração da reunião, sem o nome do paciente.</li>
          <li>
            <strong>OpenAI</strong> (resumo do assistente Saluttin): quando o recurso está ativo na plataforma, ao salvar
            uma evolução o texto dela é enviado à OpenAI, nos Estados Unidos, para gerar o resumo. O nome do paciente não é
            enviado. Pela política da OpenAI para a API, esse conteúdo não é usado para treinar modelos e pode ficar
            guardado por até 30 dias para monitoramento de abuso. Fotos e anexos não são enviados.
          </li>
          <li><strong>ViaCEP e BrasilAPI</strong> (preenchimento de endereço): recebem apenas o CEP digitado.</li>
        </List>
        <p>
          Também podemos fornecer dados quando exigido por lei ou por ordem de autoridade competente. Alguns desses
          fornecedores processam dados fora do Brasil; nesses casos, a transferência internacional é feita nas hipóteses
          do art. 33 da LGPD.
        </p>
      </Section>

      <Section id="google" title="5. Dados do Google">
        <p>
          A conexão com o Google é opcional e feita por cada profissional em Ajustes. Pedimos apenas: identificação
          básica (<code>openid</code> e <code>email</code>), para mostrar qual conta está conectada, e acesso aos eventos
          da sua Agenda (<code>calendar.events</code>), para criar, atualizar e apagar o evento com link do Google Meet
          dos atendimentos que você agendar na Salutti.
        </p>
        <List>
          <li>Não lemos, copiamos nem guardamos os demais eventos da sua agenda.</li>
          <li>A credencial de acesso fica cifrada no banco e é apagada quando você desconecta a conta em Ajustes. Você também pode revogar o acesso em <a href="https://myaccount.google.com/permissions" className="text-brand underline-offset-4 hover:underline" rel="noopener noreferrer" target="_blank">myaccount.google.com/permissions</a>.</li>
          <li>Dados recebidos das APIs do Google não são vendidos, não são usados para publicidade, não são transferidos a terceiros (exceto quando necessário para prestar o recurso, por exigência legal ou com sua permissão) e não são usados para treinar modelos de inteligência artificial.</li>
        </List>
        <p>
          O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs do Google
          obedecem à{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-brand underline-offset-4 hover:underline" rel="noopener noreferrer" target="_blank" lang="en">
            Google API Services User Data Policy
          </a>
          , incluindo os requisitos de Uso Limitado (Limited Use).
        </p>
      </Section>

      <Section id="seguranca" title="6. Segurança">
        <List>
          <li>Conexões cifradas (HTTPS); senhas guardadas com hash (bcrypt); verificação em duas etapas disponível.</li>
          <li>Credenciais de integrações e segredos da verificação em duas etapas guardados cifrados.</li>
          <li>Isolamento entre consultórios: cada conta só acessa os próprios dados; dentro da equipe, recepção e financeiro não abrem prontuário.</li>
          <li>Registro de auditoria das ações sensíveis.</li>
        </List>
        <p>
          Nenhum sistema é totalmente imune a incidentes. Se ocorrer um incidente de segurança que possa trazer risco
          ou dano relevante, avisaremos os afetados e a Autoridade Nacional de Proteção de Dados (ANPD), como prevê o
          art. 48 da LGPD.
        </p>
      </Section>

      <Section id="retencao" title="7. Por quanto tempo guardamos">
        <List>
          <li>Dados da conta: enquanto a conta existir; depois, pelo prazo necessário para cumprir obrigações legais, exercer direitos em processos e resolver pendências.</li>
          <li>Registro de auditoria: enquanto a conta existir e pelo prazo necessário para comprovar ações e aceites.</li>
          <li>
            Prontuários e registros clínicos (incluindo ficha de procedimento, fotos clínicas, termos e lote de insumo
            usado): o profissional ou a clínica define a guarda conforme a lei e as normas do seu conselho, por exemplo,
            no mínimo 5 anos para psicólogos (Resolução CFP 001/2009) e 20 anos a partir do último registro para o
            prontuário do paciente em geral (Lei 13.787/2018). Esse dever continua valendo depois que a conta é
            encerrada: antes da eliminação, oferecemos a exportação completa.
          </li>
        </List>
      </Section>

      <Section id="direitos" title="8. Seus direitos">
        <p>
          Como titular, você pode pedir: confirmação do tratamento, acesso, correção, anonimização, bloqueio ou
          eliminação de dados desnecessários, portabilidade, informação sobre compartilhamento, revogação do
          consentimento e revisão de decisões automatizadas (art. 18 da LGPD). Boa parte disso está disponível em
          Ajustes; o restante pode ser pedido por e-mail para {mail}. Respondemos em até 15 dias. Você também pode
          reclamar à ANPD.
        </p>
      </Section>

      <Section id="cookies" title="9. Cookies">
        <p>
          Usamos apenas cookies necessários ao funcionamento: sessão de login, etapas da verificação em duas etapas,
          consultório ativo, idioma escolhido e um cookie temporário durante a conexão com o Google. Não usamos cookies
          de publicidade nem de rastreamento de terceiros.
        </p>
      </Section>

      <Section id="menores" title="10. Crianças e adolescentes">
        <p>
          As contas da plataforma são para profissionais e clínicas, maiores de 18 anos. Dados de pacientes crianças ou
          adolescentes podem ser registrados pelo profissional, que deve observar o art. 14 da LGPD (consentimento de um
          dos pais ou responsável, no melhor interesse da criança ou do adolescente).
        </p>
      </Section>

      <Section id="mudancas" title="11. Mudanças nesta política">
        <p>
          Podemos atualizar esta política. A data e a versão ficam no topo da página; quando a mudança for relevante,
          avisaremos dentro da plataforma ou por e-mail antes de ela valer.
        </p>
      </Section>

      <Section id="contato" title="12. Contato e encarregado (DPO)">
        <p>
          Dúvidas, pedidos e comunicações sobre privacidade: {mail}
          {LEGAL_ENTITY.dpo ? <>. Encarregado pelo tratamento de dados pessoais: {LEGAL_ENTITY.dpo}</> : null}.
        </p>
      </Section>
    </LegalPage>
  );
}
