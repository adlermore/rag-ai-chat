import { t } from "@/lib/i18n";

/**
 * Атрибуция разработчика: «նախագծող Steply · ՀՀ Կենտրոնական բանկի համար».
 * Кликабелен только логотип (ссылка на steply.tech): приглушён фильтром
 * (ч/б + прозрачность), при наведении — полный цвет.
 */
export function PoweredBySteply({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground ${className}`}
    >
      <span>{t("app.designedBy")}</span>
      <a
        href="https://www.steply.tech/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Steply — steply.tech"
        className="group inline-flex items-center rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/steply-logo.webp"
          alt="Steply"
          className="h-3.5 w-auto opacity-60 grayscale transition duration-200 group-hover:opacity-100 group-hover:grayscale-0 dark:opacity-70 dark:group-hover:brightness-125"
        />
      </a>
      <span className="text-muted-foreground/70">·</span>
      <span>{t("app.forBank")}</span>
    </span>
  );
}
