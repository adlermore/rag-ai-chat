"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@rag/shared";
import { Skeleton } from "@rag/ui";
import { useAuth } from "@/lib/auth/context";

/**
 * Клиентская защита маршрута: пока идёт восстановление сессии — скелетон;
 * неаутентифицированного — на /login; при requireRole и несовпадении роли —
 * на корень. (Токены в localStorage → защита на клиенте, приемлемо для v1.)
 */
export function RequireAuth({
  children,
  requireRole,
}: {
  children: ReactNode;
  requireRole?: Role;
}) {
  const { status, user } = useAuth();
  const router = useRouter();

  const roleMismatch =
    status === "authenticated" &&
    requireRole !== undefined &&
    user?.role !== requireRole;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (roleMismatch) {
      router.replace("/");
    }
  }, [status, roleMismatch, router]);

  if (status !== "authenticated" || roleMismatch) {
    return (
      <div className="flex min-h-screen flex-col gap-4 p-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
