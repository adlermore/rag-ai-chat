import { t } from "@/lib/i18n";

/**
 * Атрибуция разработчика: «նախագծող Steply» + логотип. Тактично, не конкурирует
 * с эмблемой ЦБ. Лого — apps/web/public/steply-logo.webp.
 */
export function PoweredBySteply({
  className = "",
  center = false,
}: {
  className?: string;
  center?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 text-muted-foreground ${
        center ? "justify-center" : ""
      } ${className}`}
    >
      <span className="text-[11px]">{t("app.designedBy")}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/steply-logo.webp"
        alt="Steply"
        className="h-3.5 w-auto opacity-90 dark:brightness-125"
      />
    </div>
  );
}
