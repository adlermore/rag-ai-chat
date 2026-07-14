"use client";

import type { MessageSource } from "@rag/shared";
import { cn } from "@rag/ui";
import { Search } from "lucide-react";
import { t } from "@/lib/i18n";
import { renderWithCitations } from "./citation";
import type { ChatMessage, Confidence } from "@/lib/api/chat";

const CONFIDENCE_VAR: Record<Confidence, string> = {
  high: "var(--confidence-high)",
  low: "var(--confidence-low)",
  refused: "var(--confidence-none)",
};

function SourceCard({
  source,
  marker,
  messageId,
}: {
  source: MessageSource;
  marker: number;
  messageId: string;
}) {
  const loc: string[] = [];
  if (source.page != null) loc.push(`${t("chat.page")} ${source.page}`);
  if (source.sheet) loc.push(`${t("chat.sheet")} ${source.sheet}`);
  if (source.row != null) loc.push(`${t("chat.row")} ${source.row}`);
  return (
    <li
      id={`src-${messageId}-${marker}`}
      className="flex items-baseline gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted"
    >
      <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-primary/40 px-1 text-[11px] tabular-nums text-primary">
        {marker}
      </span>
      <span className="min-w-0">
        <span className="font-medium text-foreground">{source.documentTitle}</span>
        <span className="text-muted-foreground">
          {" · "}
          {source.documentType.toUpperCase()}
          {loc.length ? ` · ${loc.join(", ")}` : ""}
        </span>
      </span>
    </li>
  );
}

export function MessageBubble({
  message,
  streaming = false,
}: {
  message: ChatMessage;
  streaming?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-muted px-4 py-2.5 text-[15px] text-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  const confidence = (message.confidence ?? "high") as Confidence;
  const sources = message.sources ?? [];
  const isRefusal = confidence === "refused";

  // Отказ — спокойная серая карточка, НЕ ошибка (docs/03-DESIGN-SYSTEM.md).
  if (isRefusal) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl border border-border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <Search className="size-4" />
            {t("chat.refusedTitle")}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("chat.refusedHint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3"
        style={{ borderInlineStartWidth: 3, borderInlineStartColor: CONFIDENCE_VAR[confidence] }}
      >
        {confidence === "low" && (
          <p className="mb-1.5 text-xs font-medium" style={{ color: CONFIDENCE_VAR.low }}>
            {t("chat.confidenceLow")}
          </p>
        )}
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
          {renderWithCitations(message.content, sources, message.id)}
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />
          )}
        </div>

        {sources.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("chat.sources")}
            </p>
            <ul className="space-y-0.5">
              {sources.map((s, i) => (
                <SourceCard
                  key={s.id}
                  source={s}
                  marker={i + 1}
                  messageId={message.id}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
