"use client";

import { useCallback, useEffect, useState } from "react";
import { UserStatus, type User } from "@rag/shared";
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
import { Users } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { CreateClientDialog } from "@/components/admin/create-client-dialog";
import { clientsApi } from "@/lib/api/endpoints";
import { t } from "@/lib/i18n";

type LoadState = "loading" | "error" | "ready";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("hy-AM", { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 10);
  }
}

export default function ClientsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [clients, setClients] = useState<User[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await clientsApi.list();
      setClients(res.items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleBlock(client: User) {
    const nextStatus =
      client.status === UserStatus.Blocked
        ? UserStatus.Active
        : UserStatus.Blocked;
    setBusyId(client.id);
    try {
      const updated = await clientsApi.update(client.id, { status: nextStatus });
      setClients((prev) =>
        prev.map((c) => (c.id === client.id ? updated : c)),
      );
    } catch {
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("clients.title")}
        subtitle={t("clients.subtitle")}
        actions={<CreateClientDialog onCreated={load} />}
      />

      <div className="px-8 py-6">
        {state === "loading" ? <LoadingTable /> : null}

        {state === "error" ? (
          <ErrorState onRetry={load} />
        ) : null}

        {state === "ready" && clients.length === 0 ? <EmptyState /> : null}

        {state === "ready" && clients.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clients.email")}</TableHead>
                <TableHead>{t("clients.status")}</TableHead>
                <TableHead>{t("clients.createdAt")}</TableHead>
                <TableHead className="text-right">
                  {t("clients.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => {
                const blocked = c.status === UserStatus.Blocked;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium" dir="ltr">
                      {c.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={blocked ? "destructive" : "secondary"}>
                        {blocked
                          ? t("clients.statusBlocked")
                          : t("clients.statusActive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={blocked ? "outline" : "destructive"}
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => toggleBlock(c)}
                      >
                        {blocked
                          ? t("clients.unblock")
                          : t("clients.block")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
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
      <Users className="size-10 text-muted-foreground" />
      <p className="text-base font-medium text-foreground">
        {t("clients.emptyTitle")}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("clients.emptyHint")}
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
        {t("clients.loadError")}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}
