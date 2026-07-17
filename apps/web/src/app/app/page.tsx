"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageSource } from "@rag/shared";
import { Button, cn } from "@rag/ui";
import { LogOut, Menu, Plus, Sparkles, X } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { DemoBadge } from "@/components/demo-badge";
import { PoweredBySteply } from "@/components/powered-by-steply";
import { RequireAuth } from "@/components/auth/require-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth/context";
import { t } from "@/lib/i18n";
import {
  chatApi,
  streamMessage,
  type Chat,
  type ChatMessage,
  type Confidence,
  type PendingPhase,
} from "@/lib/api/chat";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Composer } from "@/components/chat/composer";

const EXAMPLES = ["chat.example1", "chat.example2", "chat.example3"] as const;

function ChatWorkspace() {
  const { user, logout } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamContent, setStreamContent] = useState<string | null>(null);
  const [streamSources, setStreamSources] = useState<MessageSource[]>([]);
  const [pendingMode, setPendingMode] = useState<PendingPhase>("search");
  const [busy, setBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // мобильный сайдбар (Sheet)
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatApi.list().then(setChats).catch(() => undefined);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamContent]);

  const selectChat = useCallback(async (id: string) => {
    setActiveId(id);
    setStreamContent(null);
    setNavOpen(false);
    try {
      setMessages(await chatApi.messages(id));
    } catch {
      setMessages([]);
    }
  }, []);

  const newChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setStreamContent(null);
    setNavOpen(false);
  }, []);

  // Общая часть: стрим ответа и его финализация (для send и regenerate).
  const runStream = useCallback(
    async (chatId: string, text: string, regenerate: boolean) => {
      let acc = "";
      let srcs: MessageSource[] = [];
      setStreamContent("");
      setStreamSources([]);
      setPendingMode("search"); // сбрасываем; бэкенд пришлёт "chat" для реплик

      const finalize = (id: string, confidence: Confidence, content: string) => {
        setMessages((prev) => [
          ...prev,
          { id, role: "assistant", content, confidence, sources: srcs },
        ]);
        setStreamContent(null);
        setStreamSources([]);
        setBusy(false);
      };

      await streamMessage(
        chatId,
        text,
        {
          onPhase: (p) => setPendingMode(p),
          onToken: (v) => {
            acc += v;
            setStreamContent(acc);
          },
          onSources: (s) => {
            srcs = s;
            setStreamSources(s);
          },
          onDone: (id, confidence) => finalize(id, confidence, acc),
          onError: () =>
            finalize(`e-${Date.now()}`, "refused", t("chat.streamError")),
        },
        { regenerate },
      );
    },
    [],
  );

  const send = useCallback(
    async (text: string) => {
      setBusy(true);
      let chatId = activeId;
      try {
        if (!chatId) {
          // Заголовок чата — первый вопрос (обрезанный), а не «Новый чат».
          const chat = await chatApi.create(text.slice(0, 80));
          chatId = chat.id;
          setActiveId(chat.id);
          setChats((prev) => [chat, ...prev]);
        }
      } catch {
        setBusy(false);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content: text },
      ]);
      await runStream(chatId, text, false);
    },
    [activeId, runStream],
  );

  // Перегенерация: убираем последний ответ ассистента и просим свежий (обход кэша).
  const regenerate = useCallback(async () => {
    if (!activeId || busy) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setBusy(true);
    setMessages((prev) => {
      const idx = prev.map((m) => m.role).lastIndexOf("assistant");
      return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
    });
    await runStream(activeId, lastUser.content, true);
  }, [activeId, busy, messages, runStream]);

  const showEmpty = messages.length === 0 && streamContent === null;
  // id последнего ответа ассистента — только у него показываем «Վерстеղծել».
  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;

  // Содержимое сайдбара — общее для desktop-колонки и мобильной панели.
  const sidebarContent = (
    <>
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
        <BrandMark size={32} />
        <span className="min-w-0 truncate font-display text-[15px] font-semibold leading-tight text-foreground">
          {t("app.name")}
        </span>
      </div>

      <div className="px-3 pb-2">
        <Button variant="outline" className="w-full justify-start gap-2" onClick={newChat}>
          <Plus className="size-4 text-primary" />
          {t("chat.newChat")}
        </Button>
      </div>

      {chats.length > 0 && (
        <p className="px-5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("chat.historyTitle")}
        </p>
      )}
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {chats.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => selectChat(c.id)}
            className={cn(
              "block w-full truncate rounded-lg px-2.5 py-2 text-start text-[13px] leading-5 transition-colors",
              c.id === activeId
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {c.title}
          </button>
        ))}
      </nav>

      {/* h-14 — совпадает по высоте с футером под композером (симметричная нижняя полоса) */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-t border-border px-4">
        <span className="min-w-0 truncate text-[12px] text-muted-foreground" dir="ltr">
          {user?.email}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            aria-label={t("auth.logout")}
            title={t("auth.logout")}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop-сайдбар */}
      <aside className="hidden w-72 shrink-0 flex-col border-e border-border bg-card md:flex">
        {sidebarContent}
      </aside>

      {/* Мобильный сайдбар (Sheet): оверлей + выезжающая панель */}
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
          "fixed inset-y-0 start-0 z-50 flex w-72 flex-col border-e border-border bg-card",
          "transition-transform duration-200 md:hidden",
          navOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
        )}
        aria-hidden={!navOpen}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute end-2 top-4"
          onClick={() => setNavOpen(false)}
          aria-label={t("common.close")}
        >
          <X className="size-4" />
        </Button>
        {sidebarContent}
      </aside>

      {/* Основная область */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Мобильный хедер (на десктопе всё в сайдбаре) */}
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5 md:hidden">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNavOpen(true)}
              aria-label={t("chat.historyTitle")}
            >
              <Menu className="size-4" />
            </Button>
            <BrandMark size={26} />
            <span className="font-display text-sm font-semibold text-foreground">
              {t("app.name")}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={newChat}
            aria-label={t("chat.newChat")}
          >
            <Plus className="size-4" />
          </Button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {showEmpty ? (
            <div className="flex h-full items-center justify-center px-4">
              <div className="flex w-full max-w-lg flex-col items-center gap-8 pb-24 text-center">
                <div>
                  <h1 className="font-display text-[28px] font-bold leading-9 text-foreground">
                    {t("chat.emptyTitle")}
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("chat.emptyHint")}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2.5">
                  {EXAMPLES.map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={busy}
                      onClick={() => send(t(key))}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3",
                        "text-start text-[14px] leading-5 text-foreground",
                        "transition-all hover:border-primary/40 hover:shadow-[0_2px_8px_rgb(0_0_0/0.05)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:opacity-60",
                      )}
                    >
                      <Sparkles className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl px-4 py-8">
              <div className="space-y-5">
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    onRegenerate={
                      streamContent === null &&
                      !busy &&
                      m.role === "assistant" &&
                      m.id === lastAssistantId
                        ? regenerate
                        : undefined
                    }
                  />
                ))}
                {streamContent !== null && (
                  <MessageBubble
                    streaming
                    pendingMode={pendingMode}
                    message={{
                      id: "streaming",
                      role: "assistant",
                      content: streamContent,
                      confidence: "high",
                      sources: streamSources,
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 pb-3 pt-1">
          <div className="mx-auto max-w-3xl">
            <Composer disabled={busy} onSend={send} />
          </div>
        </div>

        {/* Полоса-футер (bg-card), h-14: демо слева, дисклеймер об ИИ по центру, Steply справа */}
        <footer className="grid h-14 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-border bg-card px-4">
          <div className="flex justify-start">
            <DemoBadge />
          </div>
          <p className="min-w-0 truncate text-center text-[11px] text-muted-foreground">
            {t("app.aiDisclaimer")}
          </p>
          <div className="flex justify-end">
            <PoweredBySteply />
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function AppPage() {
  return (
    <RequireAuth>
      <ChatWorkspace />
    </RequireAuth>
  );
}
