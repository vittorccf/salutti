// Armazenamento das imagens enviadas. Hoje: tabela MediaFile no Postgres (bytea), simples e sem outro serviço.
// Para um storage de objetos (ex.: Vercel Blob privado), só o corpo destas funções muda.
import { db } from "@/lib/db";

// clinical_photo: foto clínica (antes/durante/depois) da Salutti Estética; consent_signature: assinatura da
// paciente no termo. As duas são dado de saúde: só papéis clínicos acessam.
export type MediaKind = "user_avatar" | "workspace_banner" | "patient_photo" | "clinical_photo" | "consent_signature";
export const CLINICAL_MEDIA: MediaKind[] = ["clinical_photo", "consent_signature"];
export type MediaOwner = { userId?: string; workspaceId?: string };

export const media = {
  async save(kind: MediaKind, owner: MediaOwner, image: { mime: string; bytes: Buffer }) {
    const created = await db.mediaFile.create({
      data: { kind, ...owner, mime: image.mime, size: image.bytes.length, bytes: image.bytes },
      select: { id: true },
    });
    return created.id;
  },

  async read(id: string) {
    return db.mediaFile.findUnique({ where: { id } });
  },

  async remove(id: string | null | undefined) {
    if (id) await db.mediaFile.deleteMany({ where: { id } });
  },
};
