export type AppLocale = "en" | "hi" | "kn" | "mr";
const locales: Record<AppLocale, string> = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  mr: "mr-IN",
};

export function appLocale(): string {
  if (typeof document === "undefined") return locales.en;
  const language = document.documentElement.lang as AppLocale;
  return locales[language] || locales.en;
}

export function formatDate(value: string | number | Date, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(appLocale(), options).format(new Date(value));
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(appLocale(), options).format(value);
}
