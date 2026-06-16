// LUMA — núcleo de IA da Saluti.
// Implementa interface estável; usa OPENAI_API_KEY se presente, senão fallback
// determinístico baseado em heurísticas. Permite demonstração end-to-end
// sem dependência de chave de API.

type SummarizeArgs = {
  text: string;
  patientName?: string;
};

export const luma = {
  async summarizeSession({ text, patientName }: SummarizeArgs) {
    if (process.env.OPENAI_API_KEY) {
      try {
        return await callOpenAI({ text, patientName });
      } catch (err) {
        console.warn("[LUMA] fallback heurístico:", err);
      }
    }
    return heuristicSummary({ text, patientName });
  },
};

const heuristicSummary = ({ text, patientName }: SummarizeArgs) => {
  const lowered = text.toLowerCase();
  const topicsCatalog: Record<string, string> = {
    "ansiedade": "Ansiedade",
    "depress": "Sintomas depressivos",
    "luto": "Luto",
    "sono": "Distúrbios de sono",
    "trabalh": "Estressores ocupacionais",
    "famil": "Dinâmica familiar",
    "casa": "Vínculo conjugal",
    "casamento": "Vínculo conjugal",
    "alimenta": "Comportamento alimentar",
    "panico": "Crises de pânico",
    "pânico": "Crises de pânico",
    "exposi": "Exposição gradual",
    "medica": "Manejo medicamentoso",
    "tcc": "Reestruturação cognitiva",
    "infanc": "História de infância",
    "social": "Habilidades sociais",
  };
  const topics = Object.entries(topicsCatalog)
    .filter(([k]) => lowered.includes(k))
    .map(([, v]) => v);

  const firstSentence = text.split(/[.!?\n]/).find((s) => s.trim().length > 0) ?? "";
  const wordCount = text.trim().split(/\s+/).length;
  const intensity = wordCount > 300 ? "alta" : wordCount > 120 ? "média" : "baixa";

  const summary = [
    patientName ? `**Paciente:** ${patientName}` : null,
    `**Densidade clínica:** ${intensity} (${wordCount} palavras registradas).`,
    topics.length
      ? `**Temas detectados:** ${topics.join(", ")}.`
      : "**Temas detectados:** sessão narrativa sem temas catalogados.",
    `**Síntese inicial:** ${firstSentence.trim() || "Conteúdo escasso para sumarização."}.`,
    `**Sugestão LUMA:** considere registrar plano terapêutico, próximos passos e potenciais comorbidades observadas.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { summary, topics };
};

const callOpenAI = async ({ text, patientName }: SummarizeArgs) => {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Você é o LUMA, assistente clínico da Salutti. Sumarize sessões em até 5 bullets: temas, hipóteses, plano terapêutico sugerido, riscos. Cite explicitamente se houver indício de risco psiquiátrico agudo. Não invente dados ausentes.",
        },
        {
          role: "user",
          content: `Paciente: ${patientName ?? "anônimo"}\n\nRegistro da sessão:\n${text}`,
        },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  const summary = json.choices?.[0]?.message?.content ?? "Sem resposta.";
  return { summary, topics: [] as string[] };
};
