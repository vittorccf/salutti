// Versão da Salutti no formato de calendário AAAA.MM.DD (CalVer), calculada no build pelo next.config.mjs.
// A data é a do commit publicado, no fuso de São Paulo: redeploy do mesmo código mantém a versão, e um merge
// novo já sai com a data do dia. O commit curto acompanha para diferenciar duas publicações no mesmo dia.
import { execSync } from "node:child_process";

function git(args) {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
  } catch {
    return null;
  }
}

/** "2026-10-07T23:30:00-03:00" → "2026.10.07", sempre no fuso de São Paulo. */
export function calendarVersion(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}.${get("month")}.${get("day")}`;
}

/**
 * Fora da produção a versão ganha um sufixo, para ninguém confundir uma prévia com o que está no ar.
 * @param {{ commitDate?: string | null, commitSha?: string | null, vercelEnv?: string, now?: Date }} input
 */
export function appVersion({ commitDate, commitSha, vercelEnv, now = new Date() }) {
  const date = commitDate ? new Date(commitDate) : now;
  const base = calendarVersion(Number.isNaN(date.getTime()) ? now : date);
  const suffix = vercelEnv === "production" ? "" : vercelEnv === "preview" ? "-previa" : "-dev";
  return { version: base + suffix, commit: commitSha ? commitSha.slice(0, 7) : "" };
}

export function computeAppVersion(env = process.env) {
  return appVersion({
    commitDate: git("log -1 --format=%cI"),
    commitSha: env.VERCEL_GIT_COMMIT_SHA || git("rev-parse HEAD"),
    vercelEnv: env.VERCEL_ENV,
  });
}
