"use client";
// Atalhos do lado do cliente ("use client"): textos com useTranslations e valores com useFormat.
import { useMemo } from "react";
import { useLocale } from "next-intl";
import { formatters } from "./format";

export { useTranslations, useLocale } from "next-intl";

export const useFormat = () => {
  const locale = useLocale();
  return useMemo(() => formatters(locale), [locale]);
};
