"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditLogView } from "@rag/shared";
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
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { analyticsApi } from "@/lib/api/analytics";
import { t } from "@/lib/i18n";

type LoadState = "loading" | "error" | "ready";

const PAGE_SIZE = 20;

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("hy-AM", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 19).replace("T", " ");
  }
}

export default function AuditPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<AuditLogView[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (p: number) => {
    setState("loading");
    try {
      const res = await analyticsApi.audit(p, PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
      setPage(p);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />

      <div className="px-8 py-6">
        {state === "loading" && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-base font-medium">{t("states.errorTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("audit.loadError")}</p>
            <Button variant="outline" size="sm" onClick={() => void load(page)}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {state === "ready" && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <ScrollText className="size-10 text-muted-foreground" />
            <p className="text-base font-medium">{t("audit.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("audit.emptyHint")}</p>
          </div>
        )}

        {state === "ready" && items.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">{t("audit.colTime")}</TableHead>
                  <TableHead>{t("audit.colAdmin")}</TableHead>
                  <TableHead>{t("audit.colAction")}</TableHead>
                  <TableHead>{t("audit.colEntity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatTime(r.createdAt)}
                    </TableCell>
                    <TableCell dir="ltr">{r.adminEmail}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.entity}
                      {r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}
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
                  onClick={() => void load(page - 1)}
                >
                  <ChevronLeft className="size-4" />
                  {t("audit.prev")}
                </Button>
                <span className="font-mono text-xs text-muted-foreground">
                  {page}/{pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={page >= pages}
                  onClick={() => void load(page + 1)}
                >
                  {t("audit.next")}
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
