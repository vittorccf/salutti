// Só no servidor (fora de arquivo "use server", para não virar uma action pública).
import { readImageUpload } from "./media";
import { media, type MediaKind, type MediaOwner } from "./providers/media";

// Troca a imagem guardada: grava a nova, apaga a antiga. Devolve o id que fica (ou null).
export async function replaceImage(
  formData: FormData,
  field: string,
  currentId: string | null,
  kind: MediaKind,
  owner: MediaOwner,
): Promise<string | null> {
  const upload = await readImageUpload(formData, field);
  if (upload === null) return currentId;
  const newId = upload === "remove" ? null : await media.save(kind, owner, upload);
  await media.remove(currentId);
  return newId;
}
