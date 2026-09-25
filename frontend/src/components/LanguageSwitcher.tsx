import { Languages } from "lucide-react";
import { LANGUAGE_OPTIONS, useLanguage, translate, type Language } from "@/contexts/LanguageContext";

export function LanguageSwitcher({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { language, setLanguage } = useLanguage();
  const label = translate("Language", language);
  return (
    <label className={`language-switcher ${compact ? "language-switcher-compact" : ""} ${className}`} data-no-translate>
      <Languages aria-hidden="true" size={compact ? 15 : 17} />
      {!compact && <span>{label}</span>}
      <select aria-label={label} value={language} onChange={event => setLanguage(event.target.value as Language)}>
        {LANGUAGE_OPTIONS.map(option => <option key={option.code} value={option.code}>{option.nativeName}</option>)}
      </select>
    </label>
  );
}
