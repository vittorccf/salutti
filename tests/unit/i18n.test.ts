import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LOCALE, LOCALES, NAMESPACES } from "@/i18n/config";
import { formatters } from "@/i18n/format";

type Tree = { [k: string]: string | Tree };

const file = (locale: string, ns: string) => path.resolve(__dirname, "../../messages", locale, `${ns}.json`);
const load = (locale: string, ns: string): Tree => JSON.parse(readFileSync(file(locale, ns), "utf8"));

// Achata { a: { b: "x" } } em { "a.b": "x" }.
const flatten = (tree: Tree, prefix = ""): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});

// Nomes dos argumentos ICU ({days, plural, ...} → "days"; {country} → "country") e das tags rich (<fix>).
// Os textos dentro de plural/select ({# dia} etc.) não são argumentos: só conta o que vem logo após "{".
const placeholders = (msg: string) => {
  const args = [...msg.matchAll(/\{\s*([A-Za-z_][\w]*)\s*(?:,|\})/g)].map((m) => m[1]);
  const tags = [...msg.matchAll(/<([A-Za-z][\w-]*)>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...args, ...tags])].sort();
};

const namespaces = NAMESPACES.filter((ns) => existsSync(file(DEFAULT_LOCALE, ns)));
const others = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

describe("mensagens", () => {
  it("há pelo menos o namespace common em pt-BR", () => {
    expect(namespaces).toContain("common");
  });

  describe.each(namespaces)("%s", (ns) => {
    const base = flatten(load(DEFAULT_LOCALE, ns));

    it.each(others)("%s tem o arquivo e as mesmas chaves do pt-BR", (locale) => {
      expect(existsSync(file(locale, ns)), `messages/${locale}/${ns}.json não existe`).toBe(true);
      const msgs = flatten(load(locale, ns));
      expect(Object.keys(msgs).sort()).toEqual(Object.keys(base).sort());
    });

    it.each(others)("%s mantém os mesmos placeholders do pt-BR", (locale) => {
      if (!existsSync(file(locale, ns))) return;
      const msgs = flatten(load(locale, ns));
      const diffs = Object.entries(base)
        .filter(([key]) => key in msgs)
        .map(([key, msg]) => ({ key, expected: placeholders(msg), got: placeholders(msgs[key]) }))
        .filter((d) => JSON.stringify(d.expected) !== JSON.stringify(d.got));
      expect(diffs).toEqual([]);
    });

    it.each(LOCALES)("%s não tem mensagem vazia", (locale) => {
      if (!existsSync(file(locale, ns))) return;
      const empty = Object.entries(flatten(load(locale, ns)))
        .filter(([, v]) => !v.trim())
        .map(([k]) => k);
      expect(empty).toEqual([]);
    });
  });

  it("o extrator de placeholders entende plural e tags", () => {
    expect(placeholders("Teste: {days, plural, one {# dia} other {# dias}}")).toEqual(["days"]);
    expect(placeholders("Você quis dizer <fix>{suggestion}</fix>?")).toEqual(["<fix>", "suggestion"]);
    expect(placeholders("{label} inválido em {country}")).toEqual(["country", "label"]);
  });
});

describe("formatters", () => {
  // Intl usa espaço não separável (U+00A0 ou U+202F) entre símbolo e número: normaliza antes de comparar.
  const norm = (s: string) => s.replace(/[  ]/g, " ");

  it("dinheiro sempre em reais, no formato do idioma", () => {
    expect(norm(formatters("pt-BR").money(200))).toBe("R$ 200,00");
    expect(formatters("en").money(200)).toBe("R$200.00");
    expect(norm(formatters("pt-BR").money(1234.5))).toBe("R$ 1.234,50");
    expect(formatters("en").money(1234.5)).toBe("R$1,234.50");
  });

  it("idioma padrão é pt-BR", () => {
    expect(formatters().locale).toBe("pt-BR");
    expect(norm(formatters().money(10))).toBe("R$ 10,00");
  });

  it("percentual recebe pontos percentuais", () => {
    expect(formatters("pt-BR").percent(12.5)).toBe("12,5%");
    expect(formatters("en").percent(12.5)).toBe("12.5%");
    expect(formatters("en").percent(-3, 0)).toBe("-3%");
  });

  it("datas no fuso de São Paulo", () => {
    // 02:30 UTC de 15/03 ainda é 14/03 em São Paulo (UTC-3).
    const d = new Date("2026-03-15T02:30:00Z");
    expect(formatters("pt-BR").date(d)).toBe("14/03/2026");
    expect(formatters("en").date(d)).toBe("3/14/26");
    expect(formatters("pt-BR").time(d)).toBe("23:30");
    expect(formatters("pt-BR").hour(d)).toBe(23);
  });
});
