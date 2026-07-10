"use client";

import { Button } from "@rag/ui";
import { LogOut } from "lucide-react";
import { RequireAuth } from "@/components/auth/require-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth/context";
import { t } from "@/lib/i18n";

function ClientHome() {
  const { user, logout } = useAuth();
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ThemeToggle />
        <Button variant="outline" size="sm" className="gap-2" onClick={logout}>
          <LogOut className="size-4" />
          {t("auth.logout")}
        </Button>
      </div>
      <p className="font-display text-3xl font-bold text-foreground">
        {t("app.homeTitle")}
      </p>
      <p className="max-w-md text-sm text-muted-foreground" dir="ltr">
        {user?.email}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("app.homeHint")}
      </p>
    </main>
  );
}

// Клиентский раздел (чат — Фаза 3). Пока лендинг-заглушка после входа.
export default function AppPage() {
  return (
    <RequireAuth>
      <ClientHome />
    </RequireAuth>
  );
}
