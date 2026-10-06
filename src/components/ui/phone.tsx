import { describePhone } from "@/lib/phone";
import { Flag } from "@/components/ui/flag";

// Telefone salvo, formatado e com a bandeira do país.
export const PhoneText = ({ value, fallback = "-" }: { value: string | null | undefined; fallback?: string }) => {
  const p = describePhone(value);
  if (!p) return <>{fallback}</>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      <Flag code={p.country} />
      {p.display}
    </span>
  );
};
