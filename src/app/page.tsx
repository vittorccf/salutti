import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ArrowRight,
  Banknote,
  Brain,
  CalendarCheck,
  FileSignature,
  HeartHandshake,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: <CalendarCheck className="h-5 w-5" />,
    title: "Agenda integrada Meet/Zoom",
    desc: "Confirmação automática via WhatsApp, lembretes 24h/2h, link de teleconsulta criptografado.",
  },
  {
    icon: <Banknote className="h-5 w-5" />,
    title: "Automação financeira completa",
    desc: "Pix Automático, links de pagamento, recorrência, recuperação de inadimplência via régua de cobrança.",
  },
  {
    icon: <FileSignature className="h-5 w-5" />,
    title: "Fiscal sem fricção",
    desc: "NFS-e por município, recibos digitais e Receita Saúde 2025 emitidos com 1 clique.",
  },
  {
    icon: <Brain className="h-5 w-5" />,
    title: "LUMA - IA clínica + preditiva",
    desc: "Sumarização de sessões em segundos, insights financeiros (\"sua receita caiu 12%\") e detecção de churn.",
  },
  {
    icon: <MessageSquareText className="h-5 w-5" />,
    title: "WhatsApp Business API",
    desc: "100% dos profissionais usam WhatsApp - Salutti o transforma em canal oficial com templates aprovados.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "LGPD by design",
    desc: "Mapeamento de dados sensíveis, consent management, audit log e exercício dos 9 direitos do titular.",
  },
];

const differentiators = [
  {
    title: "Sem CRP? Sem problema.",
    desc: "Psicanalistas e terapeutas com formação não-regulamentada são bem-vindos - diferente da concorrência.",
  },
  {
    title: "ERP, não \"agenda bonita\".",
    desc: "Foco no fluxo administrativo que consome 2h a 20h semanais do profissional.",
  },
  {
    title: "Offline-first opcional",
    desc: "Para UBS e clínicas com infraestrutura instável (caso Kris Fellipe / Turvânia).",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-accent/30">
      <nav className="border-b bg-background/80 backdrop-blur sticky top-0 z-50">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="grid h-8 w-8 place-content-center rounded-lg bg-primary text-primary-foreground">
              <HeartHandshake className="h-5 w-5" />
            </span>
            Salutti
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Começar trial 15 dias</Link>
            </Button>
          </div>
        </div>
      </nav>

      <section className="container py-20 text-center">
        <Badge variant="muted" className="mb-4">
          <Sparkles className="mr-1 h-3 w-3" /> Conformidade LGPD & Receita Saúde 2025
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl md:text-6xl font-bold tracking-tight">
          O <span className="text-primary">ERP de Saúde</span> que automatiza o que ninguém quer fazer.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Para psicólogos, psicanalistas, terapeutas e clínicas que querem voltar a cuidar de pessoas - não de planilha.
          Agenda + Pix + NF-e + WhatsApp + IA preditiva em um único sistema.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/signup">
              Criar workspace gratuito <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Acessar demo (Guilherme / Kris)</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Trial de 15 dias · Sem cartão · Cancela em 1 clique
        </p>
      </section>

      <section className="container pb-20 grid gap-4 md:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title} className="border-primary/10">
            <CardContent className="p-6">
              <div className="grid h-10 w-10 place-content-center rounded-lg bg-accent text-accent-foreground">
                {f.icon}
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="bg-primary text-primary-foreground py-16">
        <div className="container grid gap-8 md:grid-cols-3">
          {differentiators.map((d) => (
            <div key={d.title}>
              <Activity className="h-6 w-6" />
              <h3 className="mt-3 text-lg font-semibold">{d.title}</h3>
              <p className="mt-1 text-sm opacity-80">{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="container py-10 text-sm text-muted-foreground text-center">
        <p>
          Salutti · Protótipo navegável · Multi-tenant · Compliance LGPD/HIPAA-ready ·{" "}
          <Link href="/login" className="text-primary underline">
            Entrar
          </Link>
        </p>
      </footer>
    </main>
  );
}
