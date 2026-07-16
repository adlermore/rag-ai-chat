"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "@rag/ui";
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
} from "lucide-react";
import {
  downloadDocumentFile,
  fetchDocumentBlobUrl,
  openDocumentInNewTab,
  type AdminDocument,
} from "@/lib/api/documents";
import { t } from "@/lib/i18n";

/**
 * Просмотр оригинала документа в админке. PDF рендерится встроенным вьювером
 * (iframe за auth-blob), DOCX/XLSX браузер не показывает — предлагаем скачать.
 * Переиспользует утилиты просмотра из чата (documents.ts).
 */
export function DocumentPreviewDialog({
  doc,
  onClose,
}: {
  doc: AdminDocument | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const isPdf = doc?.type === "pdf";
  const Icon = doc?.type === "xlsx" ? FileSpreadsheet : FileText;

  // Грузим blob для PDF при открытии; чистим object-URL при закрытии/смене.
  useEffect(() => {
    let active = true;
    let created: string | null = null;
    setUrl(null);
    setError(false);
    if (doc && doc.type === "pdf") {
      setLoading(true);
      fetchDocumentBlobUrl(doc.id)
        .then((u) => {
          if (active) {
            created = u;
            setUrl(u);
          } else {
            URL.revokeObjectURL(u);
          }
        })
        .catch(() => active && setError(true))
        .finally(() => active && setLoading(false));
    }
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [doc]);

  return (
    <Dialog open={doc !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          isPdf && "flex h-[88vh] max-w-5xl flex-col gap-3 sm:max-w-5xl",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pe-8">
            <Icon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate">{doc?.title}</span>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2">
            <span className="font-mono uppercase">{doc?.type}</span>
            {doc?.chunkCount != null && (
              <span>
                · {doc.chunkCount} {t("docs.colChunks")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {isPdf ? (
          loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("docs.previewLoading")}
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center text-sm text-destructive">
              {t("docs.previewError")}
            </div>
          ) : url ? (
            <iframe
              src={url}
              title={doc?.title}
              className="h-full min-h-0 w-full flex-1 rounded-lg border border-border bg-muted"
            />
          ) : null
        ) : (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Icon className="size-10 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("docs.previewUnavailable")}
            </p>
            <Button
              className="gap-2"
              onClick={() =>
                doc && void downloadDocumentFile(doc.id, doc.title, doc.type)
              }
            >
              <Download className="size-4" />
              {t("docs.download")}
            </Button>
          </div>
        )}

        {isPdf && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => doc && openDocumentInNewTab(doc.id)}
            >
              <ExternalLink className="size-4" />
              {t("docs.openNewTab")}
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() =>
                doc && void downloadDocumentFile(doc.id, doc.title, doc.type)
              }
            >
              <Download className="size-4" />
              {t("docs.download")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
