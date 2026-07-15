"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FileText,
  LogOut,
  ListChecks,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button, cn } from "@rag/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth/context";
import { t, type TranslationKey } from "@/lib/i18n";

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/admin/documents", labelKey: "nav.documents", icon: FileText },
  { href: "/admin/clients", labelKey: "nav.clients", icon: Users },
  { href: "/admin/analytics", labelKey: "nav.analytics", icon: BarChart3 },
  { href: "/admin/eval", labelKey: "nav.eval", icon: ListChecks },
  { href: "/admin/audit", labelKey: "nav.audit", icon: ScrollText },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <p className="font-display text-lg font-bold text-foreground">
          {t("app.name")}
        </p>
        <p className="text-xs text-muted-foreground">{t("admin.panelTitle")}</p>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-muted text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-border p-3">
        <div className="flex items-center justify-between">
          <span className="truncate text-xs text-muted-foreground" dir="ltr">
            {user?.email}
          </span>
          <ThemeToggle />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={logout}
        >
          <LogOut className="size-4" />
          {t("auth.logout")}
        </Button>
      </div>
    </aside>
  );
}
