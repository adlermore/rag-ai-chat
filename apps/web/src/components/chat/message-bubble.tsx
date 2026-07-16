"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { MessageSource } from "@rag/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@rag/ui";
import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Info,
  MessageSquare,
  Search,
  Sparkles,
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import {
  downloadDocumentFile,
  fetchDocumentBlobUrl,
  openDocumentInNewTab,
} from "@/lib/api/documents";
import { t } from "@/lib/i18n";
import { MarkdownAnswer } from "./markdown";
import type { ChatMessage, Confidence } from "@/lib/api/chat";

function sourceLocation(source: MessageSource): string[] {
  const loc: string[] = [];
  if (source.page != null) loc.push(`${t("chat.page")} ${source.page}`);
  if (source.sheet) loc.push(`${t("chat.sheet")} ${source.sheet}`);
  if (source.row != null) loc.push(`${t("chat.row")} ${source.row}`);
  return loc;
}

function SourceCard({
  source,
  marker,
  messageId,
  onSelect,
}: {
  source: MessageSource;
  marker: number;
  messageId: string;
  onSelect: (s: MessageSource) => void;
}) {
  const loc = sourceLocation(source);
  const Icon = source.documentType === "xlsx" ? FileSpreadsheet : FileText;
  return (
    <li id={`src-${messageId}-${marker}`}>
      <button
        type="button"
        onClick={() => onSelect(source)}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-background",
          "px-2.5 py-1.5 text-start transition-colors hover:border-primary/40 hover:bg-muted/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-primary/40 px-1 text-[11px] font-medium tabular-nums text-primary">
          {marker}
        </span>
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[13px]">
          <span className="font-medium text-foreground">{source.documentTitle}</span>
          {loc.length > 0 && (
            <span className="text-muted-foreground"> · {loc.join(", ")}</span>
          )}
        </span>
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

/** Диалог источника: фрагмент чанка + просмотр PDF прямо в приложении. */
function SourceDialog({
  source,
  onClose,
}: {
  source: MessageSource | null;
  onClose: () => void;
}) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loc = source ? sourceLocation(source) : [];
  const isPdf = source?.documentType === "pdf";

  const close = () => {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    setViewerUrl(null);
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={source !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className={cn(viewerUrl && "flex h-[88vh] max-w-5xl flex-col gap-3 sm:max-w-5xl")}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pe-8">
            {source?.documentType === "xlsx" ? (
              <FileSpreadsheet className="size-4 shrink-0 text-primary" />
            ) : (
              <FileText className="size-4 shrink-0 text-primary" />
            )}
            <span className="min-w-0 truncate">{source?.documentTitle}</span>
          </DialogTitle>
          {loc.length > 0 && <DialogDescription>{loc.join(" · ")}</DialogDescription>}
        </DialogHeader>

        {/* Просмотр PDF прямо в браузере (встроенный вьювер) */}
        {viewerUrl ? (
          <iframe
            src={viewerUrl}
            title={source?.documentTitle}
            className="h-full min-h-0 w-full flex-1 rounded-lg border border-border bg-muted"
          />
        ) : (
          source?.snippet && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("chat.fragment")}
              </p>
              <blockquote className="rounded-lg border-s-2 border-primary/50 bg-muted/50 px-3 py-2 text-[13px] leading-relaxed text-foreground">
                {source.snippet}…
              </blockquote>
            </div>
          )
        )}

        <DialogFooter className="gap-2">
          {isPdf && !viewerUrl && (
            <Button
              className="gap-2"
              disabled={loading || !source}
              onClick={async () => {
                if (!source) return;
                setLoading(true);
                try {
                  setViewerUrl(await fetchDocumentBlobUrl(source.documentId));
                } finally {
                  setLoading(false);
                }
              }}
            >
              <FileText className="size-4" />
              {loading ? t("chat.loadingDocument") : t("chat.viewDocument")}
            </Button>
          )}
          {isPdf && (
            <Button
              variant="outline"
              className="gap-2"
              disabled={!source}
              onClick={() => source && openDocumentInNewTab(source.documentId)}
            >
              <ExternalLink className="size-4" />
              {t("chat.openNewTab")}
            </Button>
          )}
          {!isPdf && (
            <Button
              className="gap-2"
              disabled={!source}
              onClick={() =>
                source &&
                void downloadDocumentFile(
                  source.documentId,
                  source.documentTitle,
                  source.documentType,
                )
              }
            >
              <ExternalLink className="size-4" />
              {t("chat.downloadDocument")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Индикатор ожидания ответа. Стадии отражают реальный порядок пайплайна
 * (гибридный поиск → генерация): метка переключается по таймеру, а «скелетон»
 * из shimmer-полос создаёт ощущение формирующегося ответа и снижает
 * воспринимаемую задержку (docs — приоритет скорости).
 */
function ThinkingIndicator({ mode = "search" }: { mode?: "search" | "chat" }) {
  const [composing, setComposing] = useState(false);
  const isChat = mode === "chat";

  useEffect(() => {
    // Разговорная реплика — без стадий (короткий ответ, не ищем в базе).
    if (isChat) return;
    // Поиск в базе обычно занимает ~1–1.5с, затем начинается генерация.
    const id = setTimeout(() => setComposing(true), 1400);
    return () => clearTimeout(id);
  }, [isChat]);

  const StageIcon = isChat ? MessageSquare : composing ? Sparkles : Search;
  const label = isChat
    ? t("chat.replying")
    : composing
      ? t("chat.composing")
      : t("chat.searching");

  return (
    <div className="flex flex-col gap-3 py-0.5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <StageIcon className="size-4 animate-pulse text-primary" />
        <span>{label}</span>
      </div>
      {/* Скелетон формирующегося ответа (для реплики — одна строка) */}
      <div className="flex flex-col gap-2" aria-hidden="true">
        <div className="shimmer-bar h-2.5 w-[88%]" />
        {!isChat && <div className="shimmer-bar h-2.5 w-[70%]" />}
        {!isChat && <div className="shimmer-bar h-2.5 w-[78%]" />}
      </div>
    </div>
  );
}

/** Строка ответа ассистента: эмблема-аватар слева + колонка контента. */
function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-start gap-2.5">
      <div className="mt-0.5 shrink-0">
        <BrandMark size={28} />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function MessageBubble({
  message,
  streaming = false,
  pendingMode = "search",
}: {
  message: ChatMessage;
  streaming?: boolean;
  pendingMode?: "search" | "chat";
}) {
  // Хук — до любых ранних return (правила хуков React).
  const [selectedSource, setSelectedSource] = useState<MessageSource | null>(null);

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

  // Отказ — спокойное сообщение, НЕ ошибка (docs/03-DESIGN-SYSTEM.md).
  if (confidence === "refused" && !streaming) {
    return (
      <AssistantRow>
        <div className="w-fit max-w-full rounded-2xl rounded-tl-sm border border-border bg-muted/30 px-4 py-3">
          <p className="text-[14px] font-semibold text-foreground">
            {t("chat.refusedTitle")}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("chat.refusedHint")}
          </p>
        </div>
      </AssistantRow>
    );
  }

  const thinking = streaming && message.content.trim().length === 0;
  const showLowBadge = confidence === "low" && !streaming;

  return (
    <>
      <AssistantRow>
        <div className="w-fit max-w-full rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          {/* Пометка неуверенности — компактный бейдж вместо цветной кромки. */}
          {showLowBadge && (
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--confidence-low)]/40 bg-[var(--confidence-low)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--confidence-low)]">
              <Info className="size-3" />
              {t("chat.confidenceLow")}
            </span>
          )}

          {thinking ? (
            <ThinkingIndicator mode={pendingMode} />
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
                    onSelect={setSelectedSource}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </AssistantRow>

      <SourceDialog source={selectedSource} onClose={() => setSelectedSource(null)} />
    </>
  );
}
