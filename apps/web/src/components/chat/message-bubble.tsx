"use client";

import type { MessageSource } from "@rag/shared";
import { cn } from "@rag/ui";
import { FileSpreadsheet, FileText, SearchX } from "lucide-react";
import { t } from "@/lib/i18n";
import { MarkdownAnswer } from "./markdown";
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
  const Icon = source.documentType === "xlsx" ? FileSpreadsheet : FileText;
  return (
    <li
      id={`src-${messageId}-${marker}`}
      className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 transition-colors hover:border-primary/40 hover:bg-muted/60"
    >
      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-primary/40 px-1 text-[11px] font-medium tabular-nums text-primary">
        {marker}
      </span>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate text-[13px]">
        <span className="font-medium text-foreground">{source.documentTitle}</span>
        {loc.length > 0 && (
          <span className="text-muted-foreground"> · {loc.join(", ")}</span>
        )}
      </span>
    </li>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 py-1" aria-label={t("chat.thinking")}>
      <span className="text-[13px] text-muted-foreground">{t("chat.thinking")}</span>
      <span className="inline-flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1 animate-bounce rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
    </span>
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
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  const confidence = (message.confidence ?? "high") as Confidence;
  const sources = message.sources ?? [];

  // Отказ — спокойная карточка, НЕ ошибка (docs/03-DESIGN-SYSTEM.md).
  if (confidence === "refused" && !streaming) {
    return (
      <div className="flex justify-start">
        <div className="flex max-w-[85%] items-start gap-3 rounded-2xl rounded-bl-md border border-border bg-muted/40 px-4 py-3.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <SearchX className="size-4 text-muted-foreground" />
          </span>
          <span>
            <span className="block text-[14px] font-semibold text-foreground">
              {t("chat.refusedTitle")}
            </span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
              {t("chat.refusedHint")}
            </span>
          </span>
        </div>
      </div>
    );
  }

  const thinking = streaming && message.content.trim().length === 0;

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
        )}
        style={{
          borderInlineStartWidth: 3,
          borderInlineStartColor: CONFIDENCE_VAR[confidence],
        }}
      >
        {confidence === "low" && !streaming && (
          <p
            className="mb-2 flex items-center gap-1.5 text-xs font-medium"
            style={{ color: CONFIDENCE_VAR.low }}
          >
            {t("chat.confidenceLow")}
          </p>
        )}

        {thinking ? (
          <ThinkingDots />
        ) : (
          <div className="text-[15px] text-foreground">
            <MarkdownAnswer
              text={message.content}
              sources={sources}
              messageId={message.id}
            />
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-primary align-middle" />
            )}
          </div>
        )}

        {sources.length > 0 && (
          <div className="mt-3 border-t border-border pt-2.5">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("chat.sources")}
            </p>
            <ul className="flex flex-col gap-1">
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
