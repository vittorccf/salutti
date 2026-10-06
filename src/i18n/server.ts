// Atalhos do lado do servidor (Server Components e Server Actions).
import { getLocale } from "next-intl/server";
import { formatters } from "./format";

export { getTranslations, getLocale } from "next-intl/server";

export const getFormat = async () => formatters(await getLocale());
