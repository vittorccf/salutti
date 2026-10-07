// Biblioteca de modelos de anamnese por especialidade. São roteiros de primeira consulta para
// o consultório adotar e adaptar; não substituem o julgamento clínico de quem atende.
export type AnamnesisQuestion = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
};
export type AnamnesisSchema = { sections: { title: string; questions: AnamnesisQuestion[] }[] };

export type LibraryTemplate = {
  slug: string;
  name: string;
  specialty: string;
  description: string;
  // Tipos de atendimento (Workspace.segment) para os quais este modelo é o padrão.
  defaultFor: string[];
  schema: AnamnesisSchema;
};

const sono: AnamnesisQuestion = { key: "sono", label: "Qualidade do sono", type: "select", options: ["Boa", "Regular", "Ruim"] };
const medicacoes: AnamnesisQuestion = { key: "medicacoes", label: "Medicações em uso", type: "text" };

export const ANAMNESIS_LIBRARY: LibraryTemplate[] = [
  {
    slug: "psicologia-geral",
    name: "Anamnese psicológica",
    specialty: "psicologia",
    description: "Primeira consulta em psicologia clínica: queixa, história e contexto.",
    defaultFor: ["solo_psicologo", "clinica"],
    schema: {
      sections: [
        {
          title: "Identificação e queixa",
          questions: [
            { key: "queixa_principal", label: "Queixa principal", type: "textarea" },
            { key: "motivacao", label: "Por que buscou atendimento agora", type: "textarea" },
            { key: "expectativa", label: "Expectativa com o tratamento", type: "textarea" },
          ],
        },
        {
          title: "História clínica",
          questions: [
            { key: "antecedentes", label: "Antecedentes físicos e psiquiátricos", type: "textarea" },
            { key: "tratamentos_anteriores", label: "Psicoterapias ou tratamentos anteriores", type: "textarea" },
            medicacoes,
            sono,
          ],
        },
        {
          title: "Contexto",
          questions: [
            { key: "familia", label: "Configuração familiar", type: "textarea" },
            { key: "trabalho", label: "Trabalho ou estudo", type: "textarea" },
            { key: "rede_apoio", label: "Rede de apoio", type: "textarea" },
          ],
        },
      ],
    },
  },
  {
    slug: "tcc",
    name: "Anamnese em TCC",
    specialty: "psicologia",
    description: "Foco em situações, pensamentos, emoções e comportamentos.",
    defaultFor: [],
    schema: {
      sections: [
        {
          title: "Problema atual",
          questions: [
            { key: "queixa_principal", label: "Queixa principal", type: "textarea" },
            { key: "situacoes_gatilho", label: "Situações que disparam o problema", type: "textarea" },
            { key: "pensamentos", label: "Pensamentos automáticos frequentes", type: "textarea" },
            { key: "emocoes", label: "Emoções e intensidade (0 a 10)", type: "textarea" },
            { key: "comportamentos", label: "O que faz quando acontece (enfrentamento, evitação)", type: "textarea" },
          ],
        },
        {
          title: "História e recursos",
          questions: [
            { key: "inicio", label: "Quando começou e como evoluiu", type: "textarea" },
            { key: "crencas", label: "Crenças sobre si, os outros e o futuro", type: "textarea" },
            { key: "recursos", label: "Pontos fortes e estratégias que já ajudam", type: "textarea" },
            medicacoes,
            sono,
          ],
        },
        {
          title: "Metas",
          questions: [{ key: "metas", label: "Metas para a terapia (concretas e mensuráveis)", type: "textarea" }],
        },
      ],
    },
  },
  {
    slug: "psicanalise",
    name: "Entrevistas preliminares (psicanálise)",
    specialty: "psicanalise",
    description: "Registro aberto das entrevistas iniciais, sem roteiro fechado.",
    defaultFor: ["solo_psicanalista"],
    schema: {
      sections: [
        {
          title: "Demanda",
          questions: [
            { key: "demanda", label: "Como a pessoa formula o que a traz", type: "textarea" },
            { key: "encaminhamento", label: "Encaminhamento ou como chegou", type: "text" },
          ],
        },
        {
          title: "Fala livre",
          questions: [
            { key: "historia", label: "História contada pelo analisando", type: "textarea" },
            { key: "lacos", label: "Laços e figuras significativas", type: "textarea" },
            { key: "sonhos", label: "Sonhos, lapsos e repetições relatados", type: "textarea" },
          ],
        },
        {
          title: "Enquadre",
          questions: [
            { key: "frequencia", label: "Frequência combinada", type: "select", options: ["1x por semana", "2x por semana", "3x ou mais por semana"] },
            { key: "observacoes", label: "Observações do analista", type: "textarea" },
          ],
        },
      ],
    },
  },
  {
    slug: "infantil",
    name: "Anamnese infantil (com responsáveis)",
    specialty: "psicologia",
    description: "Desenvolvimento, escola e rotina, respondida com os responsáveis.",
    defaultFor: [],
    schema: {
      sections: [
        {
          title: "Queixa",
          questions: [
            { key: "queixa_responsaveis", label: "Queixa trazida pelos responsáveis", type: "textarea" },
            { key: "queixa_escola", label: "O que a escola relata", type: "textarea" },
          ],
        },
        {
          title: "Desenvolvimento",
          questions: [
            { key: "gestacao_parto", label: "Gestação e parto", type: "textarea" },
            { key: "marcos", label: "Marcos do desenvolvimento (fala, marcha, controle esfincteriano)", type: "textarea" },
            { key: "saude", label: "Saúde, internações e medicações", type: "textarea" },
            sono,
          ],
        },
        {
          title: "Rotina e família",
          questions: [
            { key: "rotina", label: "Rotina, telas e brincadeiras", type: "textarea" },
            { key: "familia", label: "Composição familiar e quem cuida", type: "textarea" },
            { key: "escola", label: "Escola, série e adaptação", type: "textarea" },
          ],
        },
      ],
    },
  },
  {
    slug: "casal",
    name: "Anamnese de terapia de casal",
    specialty: "psicologia",
    description: "História do relacionamento e pontos de conflito.",
    defaultFor: [],
    schema: {
      sections: [
        {
          title: "Motivo",
          questions: [
            { key: "motivo", label: "O que trouxe o casal agora (na visão de cada um)", type: "textarea" },
            { key: "objetivo", label: "O que esperam da terapia", type: "textarea" },
          ],
        },
        {
          title: "Relacionamento",
          questions: [
            { key: "historia", label: "Como se conheceram e tempo de relação", type: "textarea" },
            { key: "conflitos", label: "Principais conflitos e como discutem", type: "textarea" },
            { key: "filhos", label: "Filhos e divisão de cuidados", type: "textarea" },
            { key: "violencia", label: "Há histórico de violência? (avaliar segurança)", type: "select", options: ["Não", "Sim", "Prefere não responder"] },
          ],
        },
      ],
    },
  },
  {
    slug: "psiquiatria",
    name: "Primeira consulta psiquiátrica",
    specialty: "psiquiatria",
    description: "História da doença atual, antecedentes e exame do estado mental.",
    defaultFor: [],
    schema: {
      sections: [
        {
          title: "História",
          questions: [
            { key: "queixa_principal", label: "Queixa principal", type: "textarea" },
            { key: "hda", label: "História da doença atual", type: "textarea" },
            { key: "antecedentes_psiq", label: "Antecedentes psiquiátricos e internações", type: "textarea" },
            { key: "antecedentes_familiares", label: "Antecedentes familiares", type: "textarea" },
          ],
        },
        {
          title: "Uso de substâncias e medicações",
          questions: [
            medicacoes,
            { key: "alergias", label: "Alergias", type: "text" },
            { key: "substancias", label: "Álcool, tabaco e outras substâncias", type: "textarea" },
          ],
        },
        {
          title: "Exame do estado mental",
          questions: [
            { key: "eem", label: "Aparência, humor, afeto, pensamento, sensopercepção, juízo", type: "textarea" },
            { key: "risco", label: "Risco de suicídio", type: "select", options: ["Baixo", "Moderado", "Alto", "Não avaliado"] },
            sono,
          ],
        },
      ],
    },
  },
  {
    slug: "odontologia",
    name: "Anamnese odontológica",
    specialty: "odonto",
    description: "Histórico de saúde, alergias e hábitos de higiene bucal.",
    defaultFor: ["odonto", "ubs"],
    schema: {
      sections: [
        {
          title: "Histórico",
          questions: [
            { key: "queixa", label: "Queixa principal", type: "textarea" },
            { key: "alergias", label: "Alergias (inclusive anestésicos)", type: "text" },
            { key: "medicamentos", label: "Medicamentos contínuos", type: "text" },
            { key: "condicoes", label: "Diabetes, hipertensão, cardiopatia ou gestação", type: "textarea" },
          ],
        },
        {
          title: "Hábitos",
          questions: [
            { key: "higiene", label: "Hábitos de higiene bucal", type: "textarea" },
            { key: "fumante", label: "Fumante?", type: "select", options: ["Sim", "Não", "Ex-fumante"] },
            { key: "bruxismo", label: "Range ou aperta os dentes?", type: "select", options: ["Sim", "Não", "Não sabe"] },
          ],
        },
      ],
    },
  },
  // Salutti Estética: avaliação antes de procedimentos. Sem campo de "resultado prometido" (Res. CFF 658/2018).
  {
    slug: "estetica-facial",
    name: "Anamnese estética facial",
    specialty: "estetica",
    description: "Pele, rotina de cuidados, fototipo e contraindicações antes de procedimentos faciais.",
    defaultFor: [
      "estetica_farmacia",
      "estetica_biomedicina",
      "estetica_esteticista",
      "estetica_enfermagem",
      "estetica_hof",
      "estetica_medicina",
      "estetica_clinica",
    ],
    schema: {
      sections: [
        {
          title: "Queixa e expectativa",
          questions: [
            { key: "queixa_principal", label: "Queixa principal", type: "textarea" },
            { key: "expectativas", label: "Expectativas com o tratamento", type: "textarea" },
          ],
        },
        {
          title: "Pele",
          questions: [
            { key: "fototipo", label: "Fototipo (Fitzpatrick)", type: "select", options: ["I", "II", "III", "IV", "V", "VI"] },
            { key: "tipo_pele", label: "Tipo de pele", type: "select", options: ["Normal", "Seca", "Oleosa", "Mista", "Sensível"] },
            { key: "rotina_cuidados", label: "Rotina de cuidados (produtos e frequência)", type: "textarea" },
            {
              key: "exposicao_solar",
              label: "Exposição solar",
              type: "select",
              options: ["Baixa, usa protetor", "Frequente, usa protetor", "Frequente, sem protetor"],
            },
          ],
        },
        {
          title: "Saúde e contraindicações",
          questions: [
            { key: "alergias", label: "Alergias (medicamentos, cosméticos, anestésicos)", type: "text" },
            {
              key: "medicamentos",
              label: "Medicamentos em uso (inclusive isotretinoína, anticoagulantes, ácidos tópicos)",
              type: "textarea",
            },
            {
              key: "gestacao",
              label: "Gestação ou amamentação",
              type: "select",
              options: ["Não", "Gestante", "Amamentando", "Tentando engravidar"],
            },
            { key: "autoimunes", label: "Doenças autoimunes", type: "text" },
            { key: "herpes", label: "Herpes recorrente?", type: "select", options: ["Sim", "Não", "Não sabe"] },
            { key: "queloide", label: "Tendência a quelóide?", type: "select", options: ["Sim", "Não", "Não sabe"] },
          ],
        },
        {
          title: "Histórico estético",
          questions: [
            { key: "procedimentos_anteriores", label: "Procedimentos estéticos anteriores (quais e quando)", type: "textarea" },
            { key: "intercorrencias", label: "Intercorrências em procedimentos anteriores", type: "textarea" },
          ],
        },
      ],
    },
  },
  {
    slug: "estetica-injetaveis",
    name: "Avaliação para injetáveis (toxina, preenchimento, bioestimulador)",
    specialty: "estetica",
    description: "Contraindicações, produtos já aplicados e consentimento antes de injetáveis.",
    defaultFor: [
      "estetica_farmacia",
      "estetica_biomedicina",
      "estetica_enfermagem",
      "estetica_hof",
      "estetica_medicina",
      "estetica_clinica",
    ],
    schema: {
      sections: [
        {
          title: "Indicação",
          questions: [
            { key: "queixa_principal", label: "Queixa e região de interesse", type: "textarea" },
            { key: "expectativa", label: "Expectativa da paciente", type: "textarea" },
          ],
        },
        {
          title: "Contraindicações",
          questions: [
            { key: "gestacao", label: "Gestação ou amamentação", type: "select", options: ["Não", "Gestante", "Amamentando"] },
            {
              key: "neuromusculares",
              label: "Doença neuromuscular (miastenia gravis, Eaton-Lambert, ELA)",
              type: "select",
              options: ["Não", "Sim"],
            },
            { key: "anticoagulantes", label: "Uso de anticoagulantes, AAS ou anti-inflamatórios (AINEs)", type: "text" },
            { key: "alergia_componentes", label: "Alergia a componentes (albumina, ácido hialurônico, lidocaína)", type: "text" },
            { key: "infeccao_local", label: "Infecção, inflamação ou herpes ativo na região", type: "select", options: ["Não", "Sim"] },
            { key: "autoimunes", label: "Doenças autoimunes ou uso de imunossupressores", type: "text" },
          ],
        },
        {
          title: "Procedimentos prévios",
          questions: [
            { key: "procedimentos_previos", label: "Procedimentos prévios (data e região)", type: "textarea" },
            { key: "produtos_usados", label: "Produtos usados (marca e lote, se souber)", type: "textarea" },
            {
              key: "preenchedor_permanente",
              label: "Já recebeu preenchedor permanente (PMMA, silicone)?",
              type: "select",
              options: ["Não", "Sim", "Não sabe"],
            },
            { key: "intercorrencias", label: "Intercorrências anteriores", type: "textarea" },
          ],
        },
        {
          title: "Consentimento",
          questions: [
            {
              key: "consentimento",
              label: "Riscos, cuidados e alternativas explicados; termo do procedimento assinado",
              type: "select",
              options: ["Sim", "Não"],
            },
          ],
        },
      ],
    },
  },
  {
    slug: "estetica-corporal",
    name: "Anamnese corporal",
    specialty: "estetica",
    description: "Queixa corporal, hábitos e contraindicações para procedimentos corporais.",
    defaultFor: ["estetica_esteticista", "estetica_clinica"],
    schema: {
      sections: [
        {
          title: "Queixa",
          questions: [
            { key: "queixa_principal", label: "Queixa principal e regiões", type: "textarea" },
            { key: "expectativas", label: "Expectativas com o tratamento", type: "textarea" },
          ],
        },
        {
          title: "Hábitos",
          questions: [
            { key: "atividade_fisica", label: "Atividade física (tipo e frequência)", type: "text" },
            { key: "alimentacao", label: "Alimentação e ingestão de água", type: "textarea" },
            { key: "intestino", label: "Funcionamento intestinal", type: "select", options: ["Regular", "Irregular"] },
            { key: "fumante", label: "Fumante?", type: "select", options: ["Sim", "Não", "Ex-fumante"] },
            sono,
          ],
        },
        {
          title: "Saúde e contraindicações",
          questions: [
            { key: "gestacao", label: "Gestação ou amamentação", type: "select", options: ["Não", "Gestante", "Amamentando"] },
            { key: "condicoes", label: "Diabetes, hipertensão, cardiopatia, trombose ou varizes", type: "textarea" },
            { key: "implantes", label: "Marca-passo, implantes metálicos ou próteses", type: "text" },
            { key: "medicamentos", label: "Medicamentos em uso (inclusive anticoagulantes e hormônios)", type: "text" },
            { key: "alergias", label: "Alergias", type: "text" },
            { key: "cirurgias", label: "Cirurgias e procedimentos corporais anteriores", type: "textarea" },
          ],
        },
      ],
    },
  },
];

// Modelos oferecidos a um consultório: os de estética na Salutti Estética, os demais na Salutti.
export const libraryFor = (area: string) =>
  ANAMNESIS_LIBRARY.filter((t) => (t.specialty === "estetica") === (area === "estetica"));

export const libraryTemplate = (slug: string) => ANAMNESIS_LIBRARY.find((t) => t.slug === slug);

// Modelo padrão do tipo de atendimento escolhido no cadastro.
export const defaultTemplateFor = (segment: string) =>
  ANAMNESIS_LIBRARY.find((t) => t.defaultFor.includes(segment)) ?? ANAMNESIS_LIBRARY[0];
