import type { ReactNode } from "react";
import { Role } from "@rag/shared";
import { RequireAuth } from "@/components/auth/require-auth";
import { AdminShell } from "@/components/admin/shell";

/** Оболочка админки: доступ только для роли admin (RBAC на клиенте + на API). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth requireRole={Role.Admin}>
      <AdminShell>{children}</AdminShell>
    </RequireAuth>
  );
}
