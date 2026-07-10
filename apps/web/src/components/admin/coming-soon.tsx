import { Construction } from "lucide-react";
import { PageHeader } from "./page-header";
import { t } from "@/lib/i18n";

/** Плейсхолдер разделов, реализуемых в следующих фазах (Documents/Analytics/Audit). */
export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col items-center justify-center gap-3 px-8 py-24 text-center">
        <Construction className="size-10 text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("admin.comingSoon")}
        </p>
      </div>
    </>
  );
}
