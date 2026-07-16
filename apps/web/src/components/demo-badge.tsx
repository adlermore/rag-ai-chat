import { t } from "@/lib/i18n";

/** Пометка демо-версии. Управляется NEXT_PUBLIC_DEMO (на проде — убрать флаг). */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

export function DemoBadge({ full = false }: { full?: boolean }) {
  if (!IS_DEMO) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md border border-[var(--brand-gold)]/60 bg-[var(--brand-gold)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-gold)]"
      title={t("app.demoFull")}
    >
      {full ? t("app.demoFull") : t("app.demo")}
    </span>
  );
}
