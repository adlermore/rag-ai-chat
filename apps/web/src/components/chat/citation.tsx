"use client";

import type { ReactNode } from "react";
import type { MessageSource } from "@rag/shared";
import { cn } from "@rag/ui";
import { FileSpreadsheet, FileText } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * Цитатный чип ⟨n⟩ — фирменный элемент (docs/03-DESIGN-SYSTEM.md): нумерованная
 * ссылка на источник прямо в тексте. Hover → карточка с документом и фрагментом
 * чанка; клик → скролл к карточке источника. Без внешних зависимостей (CSS).
 */
function CitationChip({
  marker,
  source,
  messageId,
}: {
  marker: string;
  source?: MessageSource;
  messageId: string;
}) {
  const loc: string[] = [];
  if (source?.page != null) loc.push(`${t("chat.page")} ${source.page}`);
  if (source?.sheet) loc.push(`${t("chat.sheet")} ${source.sheet}`);
  if (source?.row != null) loc.push(`${t("chat.row")} ${source.row}`);
  const Icon = source?.documentType === "xlsx" ? FileSpreadsheet : FileText;

  return (
    <span className="group/cite relative inline-block align-baseline">
      <button
        type="button"
        onClick={() =>
          document
            .getElementById(`src-${messageId}-${marker}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" })
        }
        className={cn(
          "mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md",
          "border border-primary/40 px-1 align-baseline text-[11px] font-medium",
          "tabular-nums text-primary transition-colors hover:bg-primary/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label={`Աղբյուր ${marker}`}
      >
        {marker}
      </button>

      {/* HoverCard: появляется на hover/focus-within, не ловит указатель */}
      {source && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-72",
            "-translate-x-1/2 rounded-xl border border-border bg-popover p-3 text-start",
            "shadow-[0_4px_16px_rgb(0_0_0/0.12)]",
            "opacity-0 transition-opacity duration-150",
            "group-hover/cite:opacity-100 group-focus-within/cite:opacity-100",
            "hidden sm:block", // на тач-экранах hover нет — работает клик→скролл
          )}
        >
          <span className="flex items-center gap-1.5">
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
              {source.documentTitle}
            </span>
          </span>
          {loc.length > 0 && (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {loc.join(" · ")}
            </span>
          )}
          {source.snippet && (
            <span className="mt-1.5 line-clamp-4 block text-[12px] leading-relaxed text-muted-foreground">
              {source.snippet}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

const CITATION_RE = /⟨(\d+)⟩/g;

/** Разбивает текст ответа на фрагменты, заменяя ⟨n⟩ на цитатные чипы. */
export function renderWithCitations(
  text: string,
  sources: MessageSource[],
  messageId: string,
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > last) {
      out.push(text.slice(last, match.index));
    }
    const marker = match[1]!;
    out.push(
      <CitationChip
        key={`c${key++}`}
        marker={marker}
        source={sources[Number(marker) - 1]}
        messageId={messageId}
      />,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
