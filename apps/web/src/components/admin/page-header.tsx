import type { ReactNode } from "react";

/** Единая шапка раздела админки: заголовок (serif), подзаголовок и слот действий. */
export function PageHeader({
  title,
  subtitle,
  actions,
  info,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Небольшой слот рядом с заголовком (напр. info-подсказка при наведении). */
  info?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-8 py-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {title}
          </h1>
          {info}
        </div>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
