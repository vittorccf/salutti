"use client";
import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { usePathname } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { ActionForm } from "@/components/forms/action-form";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  markSupportReadAction,
  openSupportTicketAction,
  replySupportTicketAction,
  type SupportResult,
} from "../../_actions/support";
import { SupportButton } from "./support-button";

// Ordem do Product Owner: o que trava o uso primeiro.
const TOPICS = ["bug", "acesso", "duvida", "financeiro", "privacidade", "sugestao", "outro"] as const;

export type SupportTicketView = {
  id: string;
  number: number;
  subject: string;
  status: string;
  unread: boolean;
  updatedLabel: string;
  messages: { id: string; fromClient: boolean; body: string; when: string }[];
};

type Tab = "new" | "mine";

export function SupportWidget({ tickets, appVersion }: { tickets: SupportTicketView[]; appVersion?: string }) {
  const t = useTranslations("support");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("new");
  const hasUnread = tickets.some((tk) => tk.unread);
  // Com resposta nova, o painel já abre em "Meus chamados".
  const onOpenChange = (next: boolean) => {
    if (next && hasUnread) setTab("mine");
    setOpen(next);
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <SupportButton open={open} hasUnread={hasUnread} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={12}
          collisionPadding={16}
          aria-label={t("title")}
          className="z-[36] flex max-h-[min(640px,calc(100vh-120px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        >
          <div className="border-b px-4 pb-0 pt-4">
            <p className="font-semibold">{t("title")}</p>
            <div role="tablist" aria-label={t("title")} className="mt-3 flex gap-4 text-sm">
              {(["new", "mine"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 border-b-2 pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    tab === key ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`tabs.${key}`)}
                  {key === "mine" && hasUnread ? <span className="h-2 w-2 rounded-full bg-brand-peach" aria-label={t("mine.newReply")} /> : null}
                </button>
              ))}
            </div>
          </div>
          <div role="tabpanel" className="flex-1 overflow-y-auto p-4">
            {tab === "new" ? (
              <NewTicket appVersion={appVersion} onSeeMine={() => setTab("mine")} />
            ) : (
              <MyTickets tickets={tickets} />
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function NewTicket({ appVersion, onSeeMine }: { appVersion?: string; onSeeMine: () => void }) {
  // key nova = formulário e estado zerados para "abrir outro chamado".
  const [round, setRound] = useState(0);
  return <NewTicketForm key={round} appVersion={appVersion} onSeeMine={onSeeMine} onAnother={() => setRound((r) => r + 1)} />;
}

function NewTicketForm({ appVersion, onSeeMine, onAnother }: { appVersion?: string; onSeeMine: () => void; onAnother: () => void }) {
  const t = useTranslations("support");
  const [state, action] = useFormState<SupportResult, FormData>(openSupportTicketAction, null);
  const [topic, setTopic] = useState("");
  const pathname = usePathname();
  // Contexto técnico do chamado. Só o caminho: o servidor ainda troca ids por [id].
  const [env, setEnv] = useState({ userAgent: "", viewport: "" });
  useEffect(() => {
    setEnv({ userAgent: navigator.userAgent, viewport: `${window.innerWidth}x${window.innerHeight}` });
  }, []);

  if (state?.ok && state.number) {
    return (
      <div className="space-y-3 py-2 text-center" role="status">
        <p className="font-semibold">{t("sent.title", { number: state.number })}</p>
        <p className="text-sm text-muted-foreground">{t("sent.body")}</p>
        <div className="flex flex-col gap-2 pt-2">
          <Button type="button" onClick={onSeeMine}>
            {t("sent.mine")}
          </Button>
          <Button type="button" variant="outline" onClick={onAnother}>
            {t("sent.another")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <FormError message={state?.erro} />
      <input type="hidden" name="pageUrl" value={pathname} />
      <input type="hidden" name="userAgent" value={env.userAgent} />
      <input type="hidden" name="viewport" value={env.viewport} />
      <input type="hidden" name="appVersion" value={appVersion ?? ""} />
      <div className="space-y-1.5">
        <Label htmlFor="support-topic">{t("form.topic")}</Label>
        <Select id="support-topic" name="category" required value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="" disabled>
            {t("form.topicPlaceholder")}
          </option>
          {TOPICS.map((code) => (
            <option key={code} value={code}>
              {t(`topics.${code}.label`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="support-subject">{t("form.subject")}</Label>
        <Input id="support-subject" name="subject" required minLength={3} maxLength={140} placeholder={t("form.subjectPlaceholder")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="support-message">{t("form.message")}</Label>
        <Textarea
          id="support-message"
          name="message"
          required
          minLength={5}
          maxLength={5000}
          rows={5}
          aria-describedby={topic ? "support-help" : undefined}
          placeholder={topic ? t(`topics.${topic}.help`) : undefined}
        />
        {topic ? (
          <p id="support-help" className="text-xs text-muted-foreground">
            {t(`topics.${topic}.help`)}
          </p>
        ) : null}
      </div>
      <p className="flex gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        <span>{t("form.privacy")}</span>
      </p>
      <SubmitButton label={t("form.send")} pendingLabel={t("form.sending")} />
    </form>
  );
}

function MyTickets({ tickets }: { tickets: SupportTicketView[] }) {
  const t = useTranslations("support");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const selected = tickets.find((tk) => tk.id === selectedId);

  const openTicket = (tk: SupportTicketView) => {
    setSelectedId(tk.id);
    if (tk.unread) startTransition(() => markSupportReadAction(tk.id));
  };

  if (tickets.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{t("mine.empty")}</p>;

  if (selected) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t("mine.back")}
        </button>
        <div>
          <p className="font-medium">
            #{selected.number} · {selected.subject}
          </p>
          <p className="text-xs text-muted-foreground">{t(`status.${selected.status}`)}</p>
        </div>
        <ol className="space-y-2">
          {selected.messages.map((m) => (
            <li key={m.id} className={cn("flex", m.fromClient ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[90%] rounded-lg border p-2.5 text-sm", m.fromClient ? "bg-muted" : "border-brand/30 bg-brand/[.06]")}>
                <p className="mb-0.5 text-xs text-muted-foreground">
                  {m.fromClient ? t("mine.you") : t("mine.team")} · {m.when}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <ActionForm action={replySupportTicketAction} resetOnSuccess className="space-y-2">
          <input type="hidden" name="ticketId" value={selected.id} />
          <Label htmlFor="support-reply" className="sr-only">
            {t("mine.reply")}
          </Label>
          <Textarea id="support-reply" name="message" required maxLength={5000} rows={3} placeholder={t("mine.replyPlaceholder")} />
          <SubmitButton label={t("mine.reply")} pendingLabel={t("form.sending")} />
        </ActionForm>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {tickets.map((tk) => (
        <li key={tk.id}>
          <button
            type="button"
            onClick={() => openTicket(tk)}
            className="flex w-full items-center gap-2 py-2.5 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-sm", tk.unread ? "font-semibold" : "font-medium")}>
                #{tk.number} · {tk.subject}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(`status.${tk.status}`)} · {t("mine.updated", { date: tk.updatedLabel })}
              </span>
            </span>
            {tk.unread ? (
              <span className="shrink-0 rounded-full bg-brand-peach px-2 py-0.5 text-xs font-medium text-brand-ink">{t("mine.newReply")}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
