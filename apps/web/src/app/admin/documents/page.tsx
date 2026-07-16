"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@rag/ui";
import { Eye, FileSpreadsheet, FileText, Info, RotateCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { UploadDocumentDialog } from "@/components/admin/upload-document-dialog";
import { DocumentPreviewDialog } from "@/components/admin/document-preview-dialog";
import { documentsApi, type AdminDocument, type DocStatus } from "@/lib/api/documents";
import { t } from "@/lib/i18n";

type LoadState = "loading" | "error" | "ready";

const POLL_MS = 3000;

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("hy-AM", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function StatusBadge({ doc }: { doc: AdminDocument }) {
  const status = doc.status as DocStatus;
  if (status === "ready") {
    return (
      <Badge
        variant="outline"
        style={{
          color: "var(--confidence-high)",
          borderColor: "var(--confidence-high)",
        }}
      >
        {t("docs.statusReady")}
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge
        variant="outline"
        className="gap-1.5"
        style={{
          color: "var(--confidence-low)",
          borderColor: "var(--confidence-low)",
        }}
      >
        <span
          className="size-1.5 animate-pulse rounded-full"
          style={{ backgroundColor: "var(--confidence-low)" }}
        />
        {t("docs.statusProcessing")}
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" title={doc.errorMessage ?? undefined}>
        {t("docs.statusFailed")}
      </Badge>
    );
  }
  return <Badge variant="secondary">{t("docs.statusQueued")}</Badge>;
}

/** Индикатор индексации: indeterminate-полоса (точный % бэкенд не отдаёт). */
function IndexingProgress() {
  return (
    <div
      className="progress-track mt-1.5 h-1 w-28 rounded-full bg-muted"
      role="progressbar"
      aria-label={t("docs.indexing")}
      title={t("docs.slowInfo")}
    >
      <div className="progress-bar" />
    </div>
  );
}

/** Info-подсказка при наведении: демо на слабом сервере → медленная индексация. */
function IndexingInfo() {
  return (
    <span className="group relative inline-flex align-middle">
      <Info
        className="size-4 cursor-help text-muted-foreground transition-colors hover:text-foreground"
        tabIndex={0}
        aria-label={t("docs.slowInfoLabel")}
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {t("docs.slowInfo")}
      </span>
    </span>
  );
}

export default function DocumentsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [docs, setDocs] = useState<AdminDocument[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminDocument | null>(null);
  const [preview, setPreview] = useState<AdminDocument | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setState("loading");
    try {
      setDocs(await documentsApi.list());
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Пока идёт индексация — тихий поллинг статусов (SSE — след. инкремент).
  const indexing = docs.some(
    (d) => d.status === "processing" || d.status === "queued",
  );
  useEffect(() => {
    if (state !== "ready" || !indexing) return;
    const timer = setInterval(() => void load(true), POLL_MS);
    return () => clearInterval(timer);
  }, [state, indexing, load]);

  async function onReindex(doc: AdminDocument) {
    setBusyId(doc.id);
    try {
      await documentsApi.reindex(doc.id);
      await load(true);
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(doc: AdminDocument) {
    setBusyId(doc.id);
    try {
      await documentsApi.remove(doc.id);
      setConfirmDelete(null);
      await load(true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("docs.title")}
        subtitle={t("docs.subtitle")}
        info={<IndexingInfo />}
        actions={<UploadDocumentDialog onUploaded={() => void load(true)} />}
      />

      <div className="px-8 py-6">
        {state === "loading" ? <LoadingTable /> : null}
        {state === "error" ? <ErrorState onRetry={() => void load()} /> : null}
        {state === "ready" && docs.length === 0 ? <EmptyState /> : null}

        {state === "ready" && docs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("docs.colTitle")}</TableHead>
                <TableHead>{t("docs.colType")}</TableHead>
                <TableHead>{t("docs.colStatus")}</TableHead>
                <TableHead className="text-right">{t("docs.colChunks")}</TableHead>
                <TableHead>{t("docs.colCreated")}</TableHead>
                <TableHead className="text-right">{t("docs.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-[360px]">
                    <button
                      type="button"
                      onClick={() => setPreview(d)}
                      title={t("docs.preview")}
                      className="flex min-w-0 items-center gap-2 rounded text-start font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {d.type === "xlsx" ? (
                        <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate hover:underline">{d.title}</span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs uppercase text-muted-foreground">
                      {d.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge doc={d} />
                    {(d.status === "processing" || d.status === "queued") && (
                      <IndexingProgress />
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {d.chunkCount ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDate(d.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("docs.preview")}
                        aria-label={t("docs.preview")}
                        onClick={() => setPreview(d)}
                      >
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("docs.reindex")}
                        aria-label={t("docs.reindex")}
                        disabled={busyId === d.id || d.status === "processing"}
                        onClick={() => void onReindex(d)}
                      >
                        <RotateCw className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("docs.delete")}
                        aria-label={t("docs.delete")}
                        className="text-destructive hover:text-destructive"
                        disabled={busyId === d.id}
                        onClick={() => setConfirmDelete(d)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </div>

      {/* Просмотр оригинала документа (PDF — встроенный вьювер) */}
      <DocumentPreviewDialog doc={preview} onClose={() => setPreview(null)} />

      {/* Подтверждение удаления: предупреждение об инвалидации кэша и источников */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("docs.deleteTitle")}</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">
                {confirmDelete?.title}
              </span>
              <br />
              {t("docs.deleteWarning")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={busyId !== null}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => confirmDelete && void onDelete(confirmDelete)}
            >
              {busyId ? t("docs.deleting") : t("docs.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LoadingTable() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <FileText className="size-10 text-muted-foreground" />
      <p className="text-base font-medium text-foreground">
        {t("docs.emptyTitle")}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("docs.emptyHint")}
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="text-base font-medium text-foreground">
        {t("states.errorTitle")}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("docs.loadError")}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}
