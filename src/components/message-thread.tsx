import { cn } from "@/lib/utils";

export type ThreadMessage = { id: string; body: string; mine: boolean; author: string; at: string; read?: boolean };

// Conversa em balões (portal do paciente e ficha do profissional). Texto puro, quebra de linha preservada.
export function MessageThread({ messages, emptyText, readLabel }: { messages: ThreadMessage[]; emptyText: string; readLabel?: string }) {
  if (!messages.length) return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="space-y-3">
      {messages.map((m) => (
        <li key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
              m.mine ? "rounded-br-md bg-brand text-brand-foreground" : "rounded-bl-md border bg-card",
            )}
          >
            <p className={cn("mb-0.5 text-[11px] font-medium", m.mine ? "text-brand-foreground/80" : "text-muted-foreground")}>{m.author}</p>
            <p className="whitespace-pre-line break-words">{m.body}</p>
            <p className={cn("mt-1 text-right text-[11px]", m.mine ? "text-brand-foreground/80" : "text-muted-foreground")}>
              {m.at}
              {m.mine && m.read && readLabel ? ` · ${readLabel}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
