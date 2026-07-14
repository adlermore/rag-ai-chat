"use client";

import { useRef, useState } from "react";
import { Button, cn } from "@rag/ui";
import { SendHorizontal } from "lucide-react";
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

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:ring-2 focus-within:ring-ring">
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
          "max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px]",
          "text-foreground outline-none placeholder:text-muted-foreground",
          "disabled:opacity-60",
        )}
      />
      <Button
        type="button"
        size="sm"
        className="gap-1.5"
        disabled={disabled || !value.trim()}
        onClick={submit}
      >
        <SendHorizontal className="size-4" />
        {disabled ? t("chat.sending") : t("chat.send")}
      </Button>
    </div>
  );
}
