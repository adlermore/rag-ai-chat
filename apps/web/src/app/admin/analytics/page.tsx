"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AnalyticsDashboard,
  PopularQuestionsResponse,
} from "@rag/shared";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@rag/ui";
import { BarChart3, Download, SearchX } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { analyticsApi } from "@/lib/api/analytics";
import { t } from "@/lib/i18n";

type LoadState = "loading" | "error" | "ready";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Бар-чарт «вопросы по дням»: одна серия → один hue (primary-токен), тонкие
 * бары со скруглённым верхом, 2px зазор, hover-подпись; текст — токены текста.
 */
function DailyChart({ daily }: { daily: AnalyticsDashboard["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.questions));
  const peak = daily.reduce((a, b) => (b.questions > a.questions ? b : a), daily[0]!);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          {t("analytics.dailyTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-40 items-end gap-[2px]">
          {daily.map((d) => {
            const label = `${d.date} · ${d.questions} (${t("analytics.dailyRefused")}: ${d.refusals})`;
            const showValue = d === peak || d === daily[daily.length - 1];
            return (
              <div
                key={d.date}
                title={label}
                aria-label={label}
                className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1 self-stretch"
              >
                {showValue && (
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {d.questions}
                  </span>
                )}
                <div
                  className="w-full max-w-10 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                  style={{ height: `${Math.max(3, (d.questions / max) * 100)}%` }}
                />
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {d.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [dash, setDash] = useState<AnalyticsDashboard | null>(null);
  const [questions, setQuestions] = useState<PopularQuestionsResponse | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [d, q] = await Promise.all([
        analyticsApi.dashboard(),
        analyticsApi.questions(),
      ]);
      setDash(d);
      setQuestions(q);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pct = (x: number) => `${(100 * x).toFixed(0)}%`;

  return (
    <>
      <PageHeader
        title={t("analytics.title")}
        subtitle={t("analytics.subtitle")}
        actions={
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void analyticsApi.downloadCsv()}
          >
            <Download className="size-4" />
            {t("analytics.exportCsv")}
          </Button>
        }
      />

      <div className="space-y-6 px-8 py-6">
        {state === "loading" && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-base font-medium">{t("states.errorTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("analytics.loadError")}
            </p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {state === "ready" && dash && dash.totalQuestions === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <BarChart3 className="size-10 text-muted-foreground" />
            <p className="text-base font-medium">{t("analytics.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("analytics.emptyHint")}
            </p>
          </div>
        )}

        {state === "ready" && dash && dash.totalQuestions > 0 && questions && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label={t("analytics.clients")} value={String(dash.totalClients)} />
              <StatCard
                label={t("analytics.documents")}
                value={`${dash.readyDocuments}/${dash.totalDocuments}`}
              />
              <StatCard label={t("analytics.questions")} value={String(dash.totalQuestions)} />
              <StatCard
                label={t("analytics.refusalRate")}
                value={pct(dash.refusalRate)}
                hint={t("analytics.refusalHint")}
              />
              <StatCard label={t("analytics.lowRate")} value={pct(dash.lowConfidenceRate)} />
              <StatCard label={t("analytics.cacheRate")} value={pct(dash.cacheHitRate)} />
              <StatCard
                label={t("analytics.tokens")}
                value={`${dash.tokensInTotal.toLocaleString()} / ${dash.tokensOutTotal.toLocaleString()}`}
              />
            </div>

            {dash.daily.length > 0 && <DailyChart daily={dash.daily} />}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    {t("analytics.popularTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead />
                        <TableHead className="w-20 text-right">
                          {t("analytics.popularCount")}
                        </TableHead>
                        <TableHead className="w-20 text-right">
                          {t("analytics.popularRefusal")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {questions.popular.slice(0, 10).map((p) => (
                        <TableRow key={p.question}>
                          <TableCell className="max-w-[320px] truncate" title={p.question}>
                            {p.question}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {p.count}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                            {pct(p.refusalRate)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <SearchX className="size-4 text-muted-foreground" />
                    {t("analytics.refusedTitle")}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {t("analytics.refusedHint")}
                  </p>
                </CardHeader>
                <CardContent>
                  {questions.refusedRecent.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {t("common.empty")}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {questions.refusedRecent.map((r, i) => (
                        <li
                          key={`${r.createdAt}-${i}`}
                          className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                        >
                          <span className="min-w-0 truncate" title={r.question}>
                            {r.question}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {r.createdAt.slice(0, 10)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
