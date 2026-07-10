import type { ReactNode } from "react";
import { Role } from "@rag/shared";
import { RequireAuth } from "@/components/auth/require-auth";
import { AdminSidebar } from "@/components/admin/sidebar";

/** Оболочка админки: доступ только для роли admin (RBAC на клиенте + на API). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth requireRole={Role.Admin}>
      <div className="flex min-h-screen">
        <AdminSidebar />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </RequireAuth>
  );
}
