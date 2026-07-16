"use client";

import { useRef, useState } from "react";
import { cn } from "@rag/ui";
import { ArrowUp } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * Композер вопроса: автовысота textarea, ⏎ — отправить, Shift+⏎ — перенос строки
 * (docs/03-DESIGN-SYSTEM.md §Доступность).
 */
export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  };

  const canSend = !disabled && value.trim().length > 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border border-border bg-card p-2 ps-4",
          "shadow-[0_2px_12px_rgb(0_0_0/0.06)] transition-shadow",
          "focus-within:border-primary/50 focus-within:shadow-[0_2px_16px_rgb(0_0_0/0.09)]",
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={t("chat.placeholder")}
          onChange={(e) => {
            setValue(e.target.value);
            grow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className={cn(
            "max-h-[200px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-6",
            "text-foreground outline-none placeholder:text-muted-foreground",
            "disabled:opacity-60",
          )}
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={submit}
          aria-label={t("chat.send")}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            canSend
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground",
          )}
        >
          <ArrowUp className="size-4.5" strokeWidth={2.5} />
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        {t("chat.composerHint")}
      </p>
    </div>
  );
}
