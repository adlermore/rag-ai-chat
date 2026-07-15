"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FileText,
  ListChecks,
  LogOut,
  Menu,
  ScrollText,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, cn } from "@rag/ui";
import { BrandMark } from "@/components/brand";
import { DemoBadge } from "@/components/demo-badge";
import { PoweredBySteply } from "@/components/powered-by-steply";
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border p-4">
        <BrandMark size={34} />
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-bold leading-tight text-foreground">
            {t("app.name")}
          </p>
          <p className="truncate text-xs text-muted-foreground">{t("admin.panelTitle")}</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
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
    </>
  );
}

/**
 * Оболочка админки: постоянный сайдбар на ≥md, на мобиле — хедер с гамбургером
 * и выезжающая панель (admin — desktop-first, но должен быть работоспособен
 * с телефона; docs/03-DESIGN-SYSTEM.md §Мобильная версия).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    // h-screen: layout ровно по высоте устройства — сайдбар и контент скроллятся
    // независимо (сайдбар не тянется под длинную страницу, меню не обрезается).
    <div className="flex h-screen overflow-hidden">
      {/* Desktop-сайдбар */}
      <aside className="hidden w-64 shrink-0 flex-col border-e border-border bg-card md:flex">
        <SidebarContent />
      </aside>

      {/* Мобильная выезжающая панель */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden",
          navOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden="true"
        onClick={() => setNavOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-border bg-card",
          "transition-transform duration-200 md:hidden",
          navOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
        )}
        aria-hidden={!navOpen}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute end-2 top-3"
          onClick={() => setNavOpen(false)}
          aria-label={t("common.close")}
        >
          <X className="size-4" />
        </Button>
        <SidebarContent onNavigate={() => setNavOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Мобильный хедер */}
        <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNavOpen(true)}
            aria-label={t("admin.panelTitle")}
          >
            <Menu className="size-4" />
          </Button>
          <BrandMark size={24} />
          <span className="font-display text-sm font-semibold text-foreground">
            {t("app.name")}
          </span>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
        {/* Футер дашборда: отдельная полоса (bg-card) — демо слева, атрибуция справа */}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-8 py-2.5">
          <DemoBadge />
          <PoweredBySteply />
        </footer>
      </div>
    </div>
  );
}
