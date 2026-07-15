import { t } from "@/lib/i18n";

/**
 * Атрибуция разработчика: «նախագծող Steply» + логотип-ссылка на steply.tech.
 * Логотип приглушён фильтром (ч/б + прозрачность), при наведении — полный цвет.
 */
export function PoweredBySteply({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://www.steply.tech/"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Steply — steply.tech"
      className={`group inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded ${className}`}
    >
      <span className="text-[11px]">{t("app.designedBy")}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/steply-logo.webp"
        alt="Steply"
        className="h-3.5 w-auto opacity-60 grayscale transition duration-200 group-hover:opacity-100 group-hover:grayscale-0 dark:opacity-70 dark:group-hover:brightness-125"
      />
    </a>
  );
}
