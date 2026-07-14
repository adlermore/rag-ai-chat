"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@rag/ui";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { UploadDocumentDialog } from "@/components/admin/upload-document-dialog";
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

export default function DocumentsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [docs, setDocs] = useState<AdminDocument[]>([]);

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

  return (
    <>
      <PageHeader
        title={t("docs.title")}
        subtitle={t("docs.subtitle")}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-[360px] truncate font-medium">
                    {d.title}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs uppercase text-muted-foreground">
                      {d.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge doc={d} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {d.chunkCount ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDate(d.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </div>
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
