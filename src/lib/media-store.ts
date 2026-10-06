// Só no servidor (fora de arquivo "use server", para não virar uma action pública).
import { readImageUpload, UploadError } from "./media";
import { media, type MediaKind, type MediaOwner } from "./providers/media";

export type StagedImage = {
  /** id que o registro deve passar a apontar (o mesmo de antes, se nada mudou) */
  id: string | null;
  changed: boolean;
  /** depois que o registro foi salvo: apaga a imagem antiga */
  commit: () => Promise<void>;
  /** se o salvamento falhou: apaga a imagem nova, a antiga continua valendo */
  rollback: () => Promise<void>;
};

const noop = async () => {};

// Troca de imagem em duas fases: grava a nova, o chamador atualiza o registro e só então a antiga é apagada.
// Assim nenhum registro aponta para uma imagem que já não existe, e falhas não deixam a imagem nova solta.
export async function stageImage(
  formData: FormData,
  field: string,
  currentId: string | null,
  kind: MediaKind,
  owner: MediaOwner,
  { requireConsent = false } = {},
): Promise<StagedImage> {
  const upload = await readImageUpload(formData, field);
  if (upload === null) return { id: currentId, changed: false, commit: noop, rollback: noop };
  if (upload !== "remove" && requireConsent && formData.get(`${field}Consent`) !== "on") {
    throw new UploadError("Confirme que o paciente (ou o responsável) autorizou o uso da foto.");
  }
  const newId = upload === "remove" ? null : await media.save(kind, owner, upload);
  return {
    id: newId,
    changed: true,
    commit: () => media.remove(currentId),
    rollback: () => media.remove(newId),
  };
}
