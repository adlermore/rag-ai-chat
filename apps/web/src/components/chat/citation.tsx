"use client";

import type { ReactNode } from "react";
import type { MessageSource } from "@rag/shared";
import { cn } from "@rag/ui";

/**
 * Цитатный чип ⟨n⟩ — фирменный элемент (docs/03-DESIGN-SYSTEM.md): нумерованная
 * ссылка на источник прямо в тексте. Клик → скролл к карточке источника.
 * Превью фрагмента — через native title (HoverCard — следующий инкремент).
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
  const preview = source?.documentTitle
    ? `${source.documentTitle}`
    : `⟨${marker}⟩`;
  return (
    <button
      type="button"
      title={preview}
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
