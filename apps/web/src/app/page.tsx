import { redirect } from "next/navigation";

/** Корень: в v1 сразу ведём на вход (сессионный роутинг — Фаза 3). */
export default function HomePage() {
  redirect("/login");
}
