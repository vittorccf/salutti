"use client";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useTranslations } from "next-intl";

type Workspace = { id: string; name: string; slug: string };
type Props = { workspaces: Workspace[]; activeId: string };

export const WorkspaceSwitcher = ({ workspaces, activeId }: Props) => {
  const router = useRouter();
  const t = useTranslations("common.layout");
  return (
    <Select
      defaultValue={activeId}
      aria-label={t("workspace")}
      onChange={async (e) => {
        await fetch("/api/workspace/switch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: e.target.value }),
        });
        router.refresh();
      }}
    >
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </Select>
  );
};
