import { redirect } from "next/navigation";

/** Корень админки → раздел «Клиенты» (первый реализованный в этой итерации). */
export default function AdminIndex() {
  redirect("/admin/clients");
}
