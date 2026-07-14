"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  cn,
} from "@rag/ui";
import { FileUp, Upload } from "lucide-react";
import { documentsApi } from "@/lib/api/documents";
import { ApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n";

const ACCEPT = ".pdf,.docx,.xlsx";

export function UploadDocumentDialog({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setTitle("");
    setError(null);
  }

  function onPick(f: File | null) {
    setFile(f);
    // Автозаполнение названия из имени файла (без расширения).
    if (f && !title.trim()) {
      setTitle(f.name.replace(/\.(pdf|docx|xlsx)$/i, ""));
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!file) return;

    setSubmitting(true);
    try {
      await documentsApi.upload(file, title.trim() || file.name);
      reset();
      setOpen(false);
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("docs.uploadError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="size-4" />
          {t("docs.upload")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("docs.uploadTitle")}</DialogTitle>
            <DialogDescription>{t("docs.uploadSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>{t("docs.file")}</Label>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-5",
                "text-start text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                file
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50",
              )}
            >
              <FileUp className={cn("size-5 shrink-0", file && "text-primary")} />
              <span className="min-w-0 truncate">
                {file ? file.name : t("docs.fileHint")}
              </span>
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-title">{t("docs.name")}</Label>
            <Input
              id="doc-title"
              value={title}
              maxLength={300}
              placeholder={t("docs.namePlaceholder")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!file || submitting}>
              {submitting ? t("docs.uploading") : t("docs.upload")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
