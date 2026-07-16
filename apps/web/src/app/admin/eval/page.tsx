"use client";

import { useCallback, useEffect, useState } from "react";
import type { EvalQuestionView, EvalStatus } from "@rag/shared";
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
  cn,
} from "@rag/ui";
import { Check, ChevronLeft, ChevronRight, Download, ListChecks, X } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { evalApi, type EvalList } from "@/lib/api/eval";
import { t, type TranslationKey } from "@/lib/i18n";

type LoadState = "loading" | "error" | "ready";
type Tab = EvalStatus | "all";

const PAGE_SIZE = 20;

const TABS: { key: Tab; labelKey: TranslationKey }[] = [
  { key: "pending", labelKey: "eval.tabPending" },
  { key: "approved", labelKey: "eval.tabApproved" },
  { key: "rejected", labelKey: "eval.tabRejected" },
  { key: "all", labelKey: "eval.tabAll" },
];

const KIND_LABEL: Record<string, TranslationKey> = {
  prose: "eval.kindProse",
  table: "eval.kindTable",
  trap: "eval.kindTrap",
};

function StatusBadge({ status }: { status: EvalStatus }) {
  if (status === "approved") {
    return (
      <Badge
        variant="outline"
        style={{ color: "var(--confidence-high)", borderColor: "var(--confidence-high)" }}
      >
        {t("eval.statusApproved")}
      </Badge>
    );
  }
  if (status === "rejected") {
    return <Badge variant="destructive">{t("eval.statusRejected")}</Badge>;
  }
  return <Badge variant="secondary">{t("eval.statusPending")}</Badge>;
}

export default function EvalPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [tab, setTab] = useState<Tab>("pending");
  const [data, setData] = useState<EvalList | null>(null);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (tb: Tab, p: number) => {
    setState("loading");
    try {
      setData(await evalApi.list(tb, p, PAGE_SIZE));
      setTab(tb);
      setPage(p);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load("pending", 1);
  }, [load]);

  async function review(q: EvalQuestionView, status: EvalStatus) {
    setBusyId(q.id);
    try {
      await evalApi.review(q.id, status);
      await load(tab, page);
    } finally {
      setBusyId(null);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const counts = data?.countsByStatus ?? {};

  return (
    <>
      <PageHeader
        title={t("eval.title")}
        subtitle={t("eval.subtitle")}
        actions={
          <Button variant="outline" className="gap-2" onClick={() => void evalApi.downloadApproved()}>
            <Download className="size-4" />
            {t("eval.export")}
          </Button>
        }
      />

      <div className="px-8 py-6">
        {/* Фильтр-табы со счётчиками */}
        <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
          {TABS.map(({ key, labelKey }) => {
            const count =
              key === "all"
                ? Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)
                : counts[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => void load(key, 1)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors",
                  tab === key
                    ? "bg-card font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(labelKey)}
                <span className="ms-1.5 font-mono text-xs text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>

        {state === "loading" && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-base font-medium">{t("states.errorTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("eval.loadError")}</p>
            <Button variant="outline" size="sm" onClick={() => void load(tab, page)}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {state === "ready" && data && data.items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <ListChecks className="size-10 text-muted-foreground" />
            <p className="text-base font-medium">{t("eval.emptyTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("eval.emptyHint")}</p>
          </div>
        )}

        {state === "ready" && data && data.items.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("eval.colQuestion")}</TableHead>
                  <TableHead className="w-24">{t("eval.colKind")}</TableHead>
                  <TableHead className="w-32">{t("eval.colStatus")}</TableHead>
                  <TableHead className="w-28 text-right">{t("eval.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="max-w-[480px]">
                      <p className="truncate font-medium" title={q.question}>
                        {q.question}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={q.expectedAnswer}>
                        {q.mustRefuse ? t("eval.mustRefuse") : q.expectedAnswer}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {t(KIND_LABEL[q.kind] ?? "eval.kindProse")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={q.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("eval.approve")}
                          aria-label={t("eval.approve")}
                          disabled={busyId === q.id || q.status === "approved"}
                          style={{ color: "var(--confidence-high)" }}
                          onClick={() => void review(q, "approved")}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("eval.reject")}
                          aria-label={t("eval.reject")}
                          className="text-destructive hover:text-destructive"
                          disabled={busyId === q.id || q.status === "rejected"}
                          onClick={() => void review(q, "rejected")}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {pages > 1 && (
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={page <= 1}
                  onClick={() => void load(tab, page - 1)}
                >
                  <ChevronLeft className="size-4" />
                  {t("eval.prev")}
                </Button>
                <span className="font-mono text-xs text-muted-foreground">
                  {page}/{pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={page >= pages}
                  onClick={() => void load(tab, page + 1)}
                >
                  {t("eval.next")}
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
