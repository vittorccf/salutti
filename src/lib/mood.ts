// Escala de humor dos cartões diários (1 a 5). O design system não usa emoji como ícone:
// o humor aparece como número e palavra.
export const moodLabels = ["Muito mal", "Mal", "Neutro", "Bem", "Muito bem"] as const;

export const moodLabel = (n: number) => moodLabels[Math.max(0, Math.min(4, n - 1))];
